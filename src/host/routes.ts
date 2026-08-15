/**
 * /cron-panel/* 路由层：为 crontab 查询与写操作提供 JSON 封装（ok/error）。
 * @module dsh-cron-panel/host/routes
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { CronEntry, CronView, OpResult } from '../core/types.ts'
import { applyOperation, readCrontab, writeCrontab, type CronRunner } from './cron-service.ts'

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
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
          const view = await readCrontab(runner)
          await writeCrontab(
            runner,
            applyOperation(view, { kind: 'create', id, description, expr, command: withLogRedirect(command, id), enabled }),
          )
          json(res, { ok: true, value: { output: `已创建：${expr} ${command}` } satisfies OpResult })
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
          const finalCommand = entryRef.managed ? withLogRedirect(command, entryRef.id) : command
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
