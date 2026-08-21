/**
 * /cron-panel/* 路由层：为 crontab 查询与写操作提供 JSON 封装（ok/error）。
 * @module dsh-cron-panel/host/routes
 */

import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { CronEntry, CronView, OpResult } from '../core/types.ts'
import { applyOperation, readCrontab, writeCrontab, withNotify, stripNotify, type CronRunner } from './cron-service.ts'
import { nextRuns } from './cron-next.ts'

type Envelope<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

const BODY_CAP_BYTES = 1 << 20

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const part = chunk as Buffer
    total += part.length
    if (total > BODY_CAP_BYTES) {
      req.destroy()
      return null
    }
    chunks.push(part)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function json(res: ServerResponse, envelope: Envelope<unknown>, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(envelope))
}

function str(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function bool(payload: unknown, key: string, fallback: boolean): boolean {
  if (typeof payload !== 'object' || payload === null) return fallback
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : fallback
}

/** 从 payload 解析通知配置：{ platform, target } 或 null（未配置）。 */
function parseNotify(payload: unknown): { platform: string; target: string } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const raw = (payload as Record<string, unknown>).notify
  if (typeof raw !== 'object' || raw === null) return null
  const rec = raw as Record<string, unknown>
  const platform = typeof rec.platform === 'string' ? rec.platform.trim() : ''
  const target = typeof rec.target === 'string' ? rec.target.trim() : ''
  if (platform === '' || target === '') return null
  return { platform, target }
}

/** 通知推送辅助脚本内容（cron 环境调用 /gateway/push）。 */
const NOTIFY_SCRIPT_CONTENT = `#!/bin/bash
# dsh-cron-panel 通知推送辅助脚本（由插件自动生成；任务完成后调用 message-gateway 推送）。
# 用法: <script> '<platform|target|描述>' <exit_code>
D="\$(printf '%s' "\$1" | base64 -d 2>/dev/null)"
EC="\${2:-0}"
P="\${D%%|*}"; R="\${D#*|}"
T="\${R%%|*}"; DESC="\${R#*|}"
[ -n "\$P" ] && [ -n "\$T" ] || exit 0
BODY="\$(printf '{\\"platform\\":\\"%s\\",\\"target\\":\\"%s\\",\\"title\\":\\"cron 任务完成\\",\\"content\\":\\"%s\\\\n退出码: %s\\"}' "\$P" "\$T" "\$DESC" "\$EC")"
curl -s -m 10 -X POST http://127.0.0.1:3080/gateway/push -H 'content-type: application/json' -d "\$BODY" >/dev/null 2>&1 || true
`

/** 确保通知推送脚本存在（不存在则写入）。 */
async function ensureNotifyScript(): Promise<string> {
  const path = join(homedir(), '.local', 'share', 'dsh-cron-notify.sh')
  try {
    await writeFile(path, NOTIFY_SCRIPT_CONTENT, { mode: 0o700 })
  } catch (error) {
    console.error('[dsh-cron-panel] write notify script failed', error)
  }
  return path
}

/** 从命令中剥离通知推送段（供 update 移除通知时使用）。 */
function stripNotifyIn(command: string): string {
  return stripNotify(command).command
}

/** 简单的 5 字段 cron 表达式校验（放宽：允许星号、斜杠、逗号、问号、井号等字符）。 */
const EXPR_RE = /^[0-9*/,?#A-Za-z-]+\s+[0-9*/,?#A-Za-z-]+\s+[0-9*/,?#A-Za-z-]+\s+[0-9*/,?#A-Za-z-]+\s+[0-9*/,?#A-Za-z-]+$/

/** 插件管理条目的日志文件路径。 */
function logPathFor(id: string): string {
  return join(homedir(), 'Library', 'Logs', `dsh-cron-${id}.log`)
}

/** 为管理条目命令追加日志重定向（幂等：已含则不动）。 */
function withLogRedirect(command: string, id: string): string {
  if (/\s*>>\s*\S+dsh-cron-\S+\.log\s*2>&1\s*$/.test(command)) return command
  return `${command} >> ${logPathFor(id)} 2>&1`
}

/** 读取日志文件尾部（最多 120 行，最新在最后）。 */
async function readLogTail(file: string): Promise<string[]> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return []
  }
  const lines = text.split(/\r?\n/)
  return lines.slice(-120)
}

/** 注册 /cron-panel 各路由。 */
export function registerCronPanelRoutes(ctx: Context, runner: CronRunner): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path: '/cron-panel',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://dsh')
      const path = url.pathname

      if (req.method !== 'POST') {
        json(res, { ok: false, error: { code: 'internal', message: 'method not allowed' } }, 405)
        return
      }
      const payload = await readJsonBody(req)

      const fail = (error: unknown): void => {
        const message = error instanceof Error ? error.message : String(error)
        json(res, { ok: false, error: { code: 'internal', message } })
      }

      try {
        if (path === '/cron-panel/list') {
          const view = await readCrontab(runner)
          json(res, { ok: true, value: view satisfies CronView })
          return
        }
        if (path === '/cron-panel/create') {
          const description = str(payload, 'description') ?? ''
          const expr = str(payload, 'expr') ?? ''
          const command = str(payload, 'command') ?? ''
          if (expr === '' || command === '' || !EXPR_RE.test(expr)) {
            json(res, { ok: false, error: { code: 'internal', message: 'invalid cron expression or empty command' } })
            return
          }
          const enabled = bool(payload, 'enabled', true)
          const notify = parseNotify(payload)
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
          const view = await readCrontab(runner)
          let finalCommand = withLogRedirect(command, id)
          if (notify !== null) {
            await ensureNotifyScript()
            finalCommand = withNotify(finalCommand, notify, description)
          }
          await writeCrontab(
            runner,
            applyOperation(view, { kind: 'create', id, description, expr, command: finalCommand, enabled }),
          )
          json(res, { ok: true, value: { output: `已创建：${expr} ${command}` } satisfies OpResult })
          return
        }
        if (path === '/cron-panel/next') {
          // 下一次执行时间预览：expr → 接下来 5 次运行时间。
          const expr = str(payload, 'expr') ?? ''
          if (expr === '') {
            json(res, { ok: false, error: { code: 'internal', message: 'missing expr' } })
            return
          }
          const result = nextRuns(expr)
          if (!result.ok) {
            json(res, { ok: false, error: { code: 'internal', message: result.error } })
            return
          }
          json(res, { ok: true, value: { next: result.next.map((d) => d.toISOString()) } })
          return
        }
        if (path === '/cron-panel/logs') {
          const entry = payload as Partial<CronEntry> | null
          if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') {
            json(res, { ok: false, error: { code: 'internal', message: 'malformed entry' } })
            return
          }
          // 管理条目：读插件日志；系统条目：从命令提取重定向的日志文件。
          let file: string | null = null
          if (entry.managed === true) {
            file = logPathFor(entry.id)
          } else if (typeof entry.command === 'string') {
            const m = entry.command.match(/>>\s*(\S+)/)
            file = m === null ? null : m[1]
          }
          if (file === null) {
            json(res, { ok: true, value: { path: null, lines: [] } })
            return
          }
          const lines = await readLogTail(file)
          json(res, { ok: true, value: { path: file, lines } })
          return
        }
        if (path === '/cron-panel/update' || path === '/cron-panel/delete') {
          const entry = payload as Partial<CronEntry> | null
          if (entry === null || typeof entry !== 'object' || !Array.isArray(entry.lines) || typeof entry.id !== 'string') {
            json(res, { ok: false, error: { code: 'internal', message: 'malformed entry' } })
            return
          }
          const entryRef: CronEntry = {
            id: entry.id,
            description: typeof entry.description === 'string' ? entry.description : '',
            expr: typeof entry.expr === 'string' ? entry.expr : '',
            command: typeof entry.command === 'string' ? entry.command : '',
            enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
            managed: entry.managed === true,
            lines: entry.lines.filter((n): n is number => typeof n === 'number'),
          }
          const view = await readCrontab(runner)
          if (path === '/cron-panel/delete') {
            await writeCrontab(runner, applyOperation(view, { kind: 'remove', entry: entryRef }))
            json(res, { ok: true, value: { output: '已删除' } satisfies OpResult })
            return
          }
          const description = str(payload, 'description') ?? entryRef.description
          const expr = str(payload, 'expr') ?? entryRef.expr
          const command = str(payload, 'command') ?? entryRef.command
          if (expr === '' || command === '' || !EXPR_RE.test(expr)) {
            json(res, { ok: false, error: { code: 'internal', message: 'invalid cron expression or empty command' } })
            return
          }
          const enabled = bool(payload, 'enabled', entryRef.enabled)
          const notify = parseNotify(payload)
          let finalCommand = entryRef.managed ? withLogRedirect(command, entryRef.id) : command
          // 通知配置：payload 显式给了 notify 字段才更新（区分「未传」与「传 null 移除」）。
          if (entryRef.managed) {
            const hasNotifyKey = typeof payload === 'object' && payload !== null && 'notify' in (payload as Record<string, unknown>)
            if (hasNotifyKey) {
              if (notify !== null) {
                await ensureNotifyScript()
                finalCommand = withNotify(finalCommand, notify, description)
              } else {
                // 移除通知段：finalCommand 当前可能带旧通知段（entryRef.command 是纯命令，需从 crontab 原行剥离）。
                // 这里用 stripNotify 对 finalCommand 处理一次（若 routes 层已带则剥离）。
                finalCommand = stripNotifyIn(finalCommand)
              }
            } else if (entryRef.notify !== undefined && entryRef.notify !== null) {
              // 未传 notify 但原条目有 → 保留原通知配置。
              finalCommand = withNotify(finalCommand, entryRef.notify, description)
            }
          }
          await writeCrontab(
            runner,
            applyOperation(view, { kind: 'update', entry: entryRef, description, expr, command: finalCommand, enabled }),
          )
          json(res, { ok: true, value: { output: '已保存' } satisfies OpResult })
          return
        }
        json(res, { ok: false, error: { code: 'internal', message: 'unknown route' } }, 404)
      } catch (error) {
        fail(error)
      }
    },
  })
}
