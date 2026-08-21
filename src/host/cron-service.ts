/**
 * 宿主侧 cron 服务：读取 / 改写用户 crontab（`crontab -l` 读取，`crontab -`
 * 经 stdin 整表写回）。本插件管理的条目带 `# dsh-cron:<id>:<描述>` 标记行，
 * 系统已有条目按行保留、只读展示。
 * @module dsh-cron-panel/host/cron-service
 */

import type {} from '@deepseek-ai/dsh-subprocess'
import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { CronEntry, CronView } from '../core/types.ts'

/** 一次已完成的 crontab 调用。 */
export interface CronRunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

/** crontab 经过的 spawn 接缝（生产环境中即子进程服务）。 */
export interface CronRunner {
  run(argv: readonly string[], stdin?: string): Promise<CronRunResult>
}

/** 收集输出上限。 */
const OUTPUT_CAP_BYTES = 1 << 20

/** 基于 `ctx.subprocess` 的生产运行器。 */
export function subprocessRunner(ctx: Context): CronRunner {
  return {
    async run(argv, stdin) {
      const spec: SubprocessSpawnSpec = {
        argv: ['/usr/bin/crontab', ...argv],
        cwd: '/',
        stdio: {
          stdin: stdin === undefined ? 'ignore' : 'pipe',
          stdout: { maxBytes: OUTPUT_CAP_BYTES },
          stderr: { maxBytes: OUTPUT_CAP_BYTES },
        },
        graceMs: 30_000,
      }
      const handle = ctx.subprocess.spawn(spec)
      if (stdin !== undefined) {
        handle.stdin?.end(stdin)
      }
      const outcome = await handle.done
      const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
      const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
      return { exitCode: outcome.exitCode, stdout, stderr }
    },
  }
}

/** 本插件管理的条目标记：`# dsh-cron:<id>:<描述>`。 */
const MARK_PREFIX = '# dsh-cron:'
/** 调度行正则：5 字段 cron 表达式 + 命令（可带前导 # 表示禁用）。 */
const SCHEDULE_LINE = /^(#\s*)?(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/

/** 通知推送辅助脚本（cron 环境调用，避免命令内嵌 JSON 的引号问题）。 */
export const NOTIFY_SCRIPT = '$HOME/.local/share/dsh-cron-notify.sh'
/** 命令内嵌的通知标记：`__dsn='<platform>|<target>|<描述base64>'`。 */
const NOTIFY_MARK = /;\s*__dsn='([^']*)';\s*ec=\$[\?0-9][^;]*;\s*sh\s+[^;]*dsh-cron-notify\.sh\s+"\$__dsn"\s+"\$ec"\s*$/

/**
 * 从完整命令中剥离插件追加的「日志重定向 + 通知推送」段，返回原始命令与通知配置。
 * @param command crontab 中的完整命令。
 */
export function stripNotify(command: string): { command: string; notify: { platform: string; target: string } | null } {
  let cmd = command.trim()
  let notify: { platform: string; target: string } | null = null
  const m = cmd.match(NOTIFY_MARK)
  if (m !== null) {
    const raw = Buffer.from(m[1], 'base64').toString('utf8')
    const [platform, target, ...rest] = raw.split('|')
    if (platform !== '' && target !== undefined) notify = { platform, target }
    cmd = cmd.slice(0, m.index).trim()
  }
  return { command: cmd, notify }
}

/**
 * 为命令追加通知推送段（幂等：已含通知段则不动）。
 * @param command 已含日志重定向的完整命令。
 * @param notify 通知配置（平台/目标）。
 * @param description 任务描述（推送内容里展示）。
 */
export function withNotify(command: string, notify: { platform: string; target: string }, description: string): string {
  if (NOTIFY_MARK.test(command)) return command
  const payload = Buffer.from(`${notify.platform}|${notify.target}|${description}`).toString('base64')
  return `${command}; __dsn='${payload}'; ec=$?; sh ${NOTIFY_SCRIPT} "$__dsn" "$ec"`
}

/** 从 crontab 文本解析出条目视图（按行保留原始文本）。 */
export function parseCrontab(text: string): CronView {
  const lines = text.split('\n')
  const entries: CronEntry[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const mark = lines[i].match(new RegExp(`^${MARK_PREFIX}([A-Za-z0-9]+)(?::(.*))?$`))
    if (mark !== null) {
      // 本插件管理的条目：标记行 + 紧跟的调度行。
      const id = mark[1]
      const description = (mark[2] ?? '').trim()
      const scheduleLine = lines[i + 1] ?? ''
      const m = scheduleLine.match(SCHEDULE_LINE)
      if (m !== null) {
        // 剥离插件追加的「通知推送段 + 日志重定向」，显示原始命令与通知配置。
        const stripped = stripNotify(m[3].trim())
        entries.push({
          id,
          description,
          expr: m[2].trim(),
          command: stripped.command.replace(/\s*>>\s*\S+dsh-cron-\S+\.log\s*2>&1\s*$/, ''),
          enabled: m[1] === undefined,
          managed: true,
          lines: [i, i + 1],
          notify: stripped.notify,
        })
        i += 1
        continue
      }
      // 标记行后无有效调度行：视为孤立标记，保留原样（不展示为条目）。
      continue
    }
    const m = lines[i].match(SCHEDULE_LINE)
    if (m !== null) {
      entries.push({
        id: `sys-${i}`,
        description: '',
        expr: m[2].trim(),
        command: m[3].trim(),
        enabled: m[1] === undefined,
        managed: false,
        lines: [i],
      })
    }
  }
  return { entries, raw: lines }
}

/**
 * 对 crontab 文本应用一个条目操作，返回新文本。
 * @param view  解析视图（raw 为当前全文行数组）。
 * @param op    操作：create / update / remove。
 */
export function applyOperation(view: CronView, op: CronOperation): string {
  const lines = [...view.raw]
  if (op.kind === 'create') {
    const id = op.id ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
    lines.push(`${MARK_PREFIX}${id}:${op.description}`)
    lines.push(`${op.enabled ? '' : '# '}${op.expr} ${op.command}`)
    return `${lines.join('\n')}\n`
  }
  // update / remove：按行号定位。
  const entry = op.entry
  const lineIndexes = entry.lines.filter((n) => n >= 0 && n < lines.length).sort((a, b) => b - a)
  if (lineIndexes.length === 0) throw new Error('目标行不存在')
  if (op.kind === 'remove') {
    for (const n of lineIndexes) lines.splice(n, 1)
    return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`
  }
  // update：重建标记行 + 调度行。
  const first = lineIndexes[lineIndexes.length - 1]
  const replacement: string[] = []
  if (entry.managed) {
    replacement.push(`${MARK_PREFIX}${entry.id}:${op.description}`)
    replacement.push(`${op.enabled ? '' : '# '}${op.expr} ${op.command}`)
  } else {
    replacement.push(`${op.enabled ? '' : '# '}${op.expr} ${op.command}`)
  }
  lines.splice(first, lineIndexes.length, ...replacement)
  return `${lines.join('\n')}\n`
}

/** 对条目的一次写操作。 */
export type CronOperation =
  | { kind: 'create'; id?: string; description: string; expr: string; command: string; enabled: boolean }
  | { kind: 'update'; entry: CronEntry; description: string; expr: string; command: string; enabled: boolean }
  | { kind: 'remove'; entry: CronEntry }

/** 读取用户 crontab。 */
export async function readCrontab(runner: CronRunner): Promise<CronView> {
  const result = await runner.run(['-l'])
  if (result.exitCode !== 0 && result.stdout === '') {
    // 无 crontab：`crontab -l` 报错且无输出 → 视为空表。
    if (result.stderr.includes('no crontab')) return { entries: [], raw: [] }
    throw new Error(result.stderr.trim() || '读取 crontab 失败')
  }
  return parseCrontab(result.stdout)
}

/** 写入用户 crontab（整体替换）。 */
export async function writeCrontab(runner: CronRunner, text: string): Promise<void> {
  const result = await runner.run(['-'], text)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || '写入 crontab 失败')
  }
}
