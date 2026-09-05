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

/** 基于 `ctx.subprocess` 的生产运行器。在 Windows 平台下优雅回退到本地 crontab.txt 模拟，避免 /usr/bin/crontab ENOENT 崩溃。 */
export function subprocessRunner(ctx: Context): CronRunner {
  return {
    async run(argv, stdin) {
      if (process.platform === 'win32') {
        const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
        const { homedir } = await import('node:os')
        const { join } = await import('node:path')
        const dir = join(homedir(), '.dsh')
        const file = join(dir, 'crontab.txt')
        if (argv.includes('-l')) {
          if (!existsSync(file)) return { exitCode: 0, stdout: '', stderr: '' }
          try {
            return { exitCode: 0, stdout: readFileSync(file, 'utf8'), stderr: '' }
          } catch (e: any) {
            return { exitCode: 0, stdout: '', stderr: '' }
          }
        }
        if (stdin !== undefined) {
          try {
            mkdirSync(dir, { recursive: true })
            writeFileSync(file, stdin, 'utf8')
            return { exitCode: 0, stdout: '', stderr: '' }
          } catch (e: any) {
            return { exitCode: 1, stdout: '', stderr: e?.message || '写入本地 crontab 失败' }
          }
        }
        return { exitCode: 0, stdout: '', stderr: '' }
      }

      try {
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
      } catch (err: any) {
        return { exitCode: 1, stdout: '', stderr: err?.message || String(err) }
      }
    },
  }
}

/** 本插件管理的条目标记：`# dsh-cron:<id>:<描述>`。 */
const MARK_PREFIX = '# dsh-cron:'
/** 调度行正则：5 字段 cron 表达式 + 命令（可带前导 # 表示禁用）。 */
const SCHEDULE_LINE = /^(#\s*)?(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/

/** 通知推送辅助脚本（cron 环境调用，避免命令内嵌 JSON 的引号问题）。 */
export const NOTIFY_SCRIPT = '$HOME/.local/share/dsh-cron-notify.sh'
/** 统一 runner 脚本（执行命令 + 失败重试 + 完成后通知，参数 base64 编码避免引号问题）。 */
export const RUN_SCRIPT = '$HOME/.local/share/dsh-cron-run.sh'
/** 命令内嵌的通知标记（旧格式，向后兼容）：`__dsn='<platform>|<target>|<描述base64>'`。 */
const NOTIFY_MARK = /;\s*__dsn='([^']*)';\s*ec=\$[\?0-9][^;]*;\s*sh\s+[^;]*dsh-cron-notify\.sh\s+"\$__dsn"\s+"\$ec"\s*$/
/** 新格式 runner 包装：`sh dsh-cron-run.sh '<b64cmd>' <retries> <delaySec> '<dsn|->'`。 */
const RUNNER_MARK = /^sh\s+\$HOME\/\.local\/share\/dsh-cron-run\.sh\s+'([^']*)'\s+(\d+)\s+(\d+)\s+'([^']*)'\s*$/

/** 剥离结果：原始命令 + 通知配置 + 重试参数。 */
export interface StrippedCommand {
  command: string
  notify: { platform: string; target: string } | null
  retries: number
  retryDelaySec: number
}

/** 解码 dsn（platform|target|描述 的 base64）为通知配置。 */
function decodeNotify(dsn64: string): { platform: string; target: string } | null {
  if (dsn64 === '' || dsn64 === '-') return null
  const raw = Buffer.from(dsn64, 'base64').toString('utf8')
  const [platform, target] = raw.split('|')
  if (platform !== '' && target !== undefined && target !== '') return { platform, target }
  return null
}

/**
 * 从完整命令中剥离插件追加的「日志重定向 + runner 包装（重试/通知）」，返回原始命令与配置。
 * 兼容新旧两种格式：新格式优先（runner 脚本），旧格式（__dsn 内联）向后兼容。
 * @param command crontab 中的完整命令。
 */
export function stripRunner(command: string): StrippedCommand {
  let cmd = command.trim()
  // 先剥离外层日志重定向（runner 命令带 `>> dsh-cron-<id>.log 2>&1`）。
  cmd = cmd.replace(/\s*>>\s*\S+dsh-cron-\S+\.log\s*2>&1\s*$/, '')
  const runner = cmd.match(RUNNER_MARK)
  if (runner !== null) {
    const inner = Buffer.from(runner[1], 'base64').toString('utf8')
    const retries = Number.isInteger(Number(runner[2])) ? Number(runner[2]) : 0
    const retryDelaySec = Number.isInteger(Number(runner[3])) ? Number(runner[3]) : 0
    return { command: inner, notify: decodeNotify(runner[4]), retries, retryDelaySec }
  }
  // 旧格式 fallback（无重试参数）。
  const legacy = stripNotify(cmd)
  return { command: legacy.command, notify: legacy.notify, retries: 0, retryDelaySec: 0 }
}

/**
 * 从完整命令中剥离旧格式的「通知推送段」，返回原始命令与通知配置（向后兼容用）。
 * @param command crontab 中的完整命令。
 */
export function stripNotify(command: string): { command: string; notify: { platform: string; target: string } | null } {
  let cmd = command.trim()
  let notify: { platform: string; target: string } | null = null
  const m = cmd.match(NOTIFY_MARK)
  if (m !== null) {
    notify = decodeNotify(m[1])
    cmd = cmd.slice(0, m.index).trim()
  }
  return { command: cmd, notify }
}

/**
 * 用统一 runner 包装命令（幂等：已是 runner 格式则不动）。
 * @param command 纯命令（不含日志重定向）。
 * @param opts 通知配置 / 描述 / 重试参数。
 */
export function withRunner(command: string, opts: { notify: { platform: string; target: string } | null; description: string; retries: number; retryDelaySec: number }): string {
  if (RUNNER_MARK.test(command.trim())) return command
  const cmd64 = Buffer.from(command).toString('base64')
  const dsn = opts.notify !== null ? Buffer.from(`${opts.notify.platform}|${opts.notify.target}|${opts.description}`).toString('base64') : '-'
  const retries = Math.max(0, Math.min(99, Math.floor(opts.retries || 0)))
  const delay = Math.max(1, Math.min(86400, Math.floor(opts.retryDelaySec || 60)))
  return `sh ${RUN_SCRIPT} '${cmd64}' ${retries} ${delay} '${dsn}'`
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
        // 剥离插件追加的「runner 包装（重试/通知）+ 日志重定向」，显示原始命令与配置。
        const stripped = stripRunner(m[3].trim())
        entries.push({
          id,
          description,
          expr: m[2].trim(),
          command: stripped.command.replace(/\s*>>\s*\S+dsh-cron-\S+\.log\s*2>&1\s*$/, ''),
          enabled: m[1] === undefined,
          managed: true,
          lines: [i, i + 1],
          notify: stripped.notify,
          retries: stripped.retries,
          retryDelaySec: stripped.retryDelaySec,
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
/** 写入用户 crontab（整体替换；写前自动备份到 ~/.local/share/dsh-cron-backups/，保留最近 20 份）。 */
export async function writeCrontab(runner: CronRunner, text: string): Promise<void> {
  // 写前备份：任何异常（bug/误操作）都能从备份恢复。
  try {
    const current = await runner.run(['-l'])
    if (current.exitCode === 0 && current.stdout.trim() !== '') {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')
      const dir = join(homedir(), '.local', 'share', 'dsh-cron-backups')
      mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      writeFileSync(join(dir, `crontab-${stamp}.txt`), current.stdout, { mode: 0o600 })
      // 只保留最近 20 份。
      const { readdirSync, unlinkSync } = await import('node:fs')
      const backups = readdirSync(dir).filter((f) => f.startsWith('crontab-')).sort()
      while (backups.length > 20) {
        const oldest = backups.shift()
        if (oldest !== undefined) {
          try { unlinkSync(join(dir, oldest)) } catch { /* 忽略清理失败 */ }
        }
      }
    }
  } catch (error) {
    // 备份失败不阻断写入（尽力而为）。
    console.warn('[dsh-cron-panel] crontab backup failed', error)
  }
  const result = await runner.run(['-'], text)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || '写入 crontab 失败')
  }
}
