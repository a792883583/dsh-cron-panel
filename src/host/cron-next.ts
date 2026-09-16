/**
 * 极简 cron 表达式「下次执行时间」计算器（5 字段，无第三方依赖）。
 * 支持 * / , - 与数字；周字段 0-7（0 与 7 均表示周日）。
 * 用于面板展示「接下来 N 次运行时间」预览。
 * @module dsh-cron-panel/host/cron-next
 */

/** 单个字段的解析结果：允许值集合 + 是否为 `*` 通配（vixie cron 的 STAR 标志）。 */
interface CronField {
  values: Set<number>
  /** 字段以 `*` 开头（含带步长的写法，如每 N 分钟）——与 vixie / isc-cron 的 STAR 判定一致。 */
  star: boolean
}

/** 解析一个字段（分/时/日/月/周）为允许值集合；返回 null 表示非法。 */
function parseField(raw: string, min: number, max: number): CronField | null {
  const field = raw.trim()
  if (field === '') return null
  const star = field.startsWith('*')
  const out = new Set<number>()
  const add = (v: number): void => {
    if (v >= min && v <= max) out.add(v)
  }
  for (const part of field.split(',')) {
    if (part === '') return null
    if (part === '*') {
      for (let v = min; v <= max; v += 1) out.add(v)
      continue
    }
    const stepMatch = part.match(/^(\*|\d+)(?:-(\d+))?\/(\d+)$/)
    if (stepMatch !== null) {
      const from = stepMatch[1] === '*' ? min : Number(stepMatch[1])
      const to = stepMatch[2] === undefined ? max : Number(stepMatch[2])
      const step = Number(stepMatch[3])
      if (step <= 0 || from < min || to > max || from > to) return null
      for (let v = from; v <= to; v += step) out.add(v)
      continue
    }
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range !== null) {
      const from = Number(range[1])
      const to = Number(range[2])
      if (from < min || to > max || from > to) return null
      for (let v = from; v <= to; v += 1) out.add(v)
      continue
    }
    if (/^\d+$/.test(part)) {
      add(Number(part))
      continue
    }
    return null
  }
  return out.size > 0 ? { values: out, star } : null
}

/** 解析 5 字段 cron 表达式；返回 null 表示非法。 */
export function parseCronExpr(expr: string): {
  minute: CronField
  hour: CronField
  day: CronField
  month: CronField
  week: CronField
} | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minute = parseField(parts[0], 0, 59)
  const hour = parseField(parts[1], 0, 23)
  const day = parseField(parts[2], 1, 31)
  const month = parseField(parts[3], 1, 12)
  let week = parseField(parts[4], 0, 7)
  if (minute === null || hour === null || day === null || month === null || week === null) return null
  // 周字段 7 等同 0（周日）。
  if (week.values.has(7)) {
    week = { values: new Set([...week.values].map((v) => (v === 7 ? 0 : v))), star: week.star }
  }
  return { minute, hour, day, month, week }
}

/**
 * 判断某一天是否命中表达式（只看 月/日/周，时与分由调用方枚举）。
 *
 * 日/周语义按 cron 规范（vixie cron / isc-cron 一致）：
 * - 两个字段**都**受限（都不是 `*`）→ 取 OR（任一命中即可）；
 * - 只要有一个是 `*` → 取 AND（等价于只由受限的那个字段决定）。
 *
 * 早先的实现无条件用 OR，而 `*` 展开后是全集恒为 true，导致
 * `30 13 * * 3`（每周三）被算成「每天 13:30」、`0 0 1 * *`（每月 1 号）
 * 被算成「每天 00:00」——面板「接下来运行」因此始终显示连续日期。
 */
function matchesDate(parsed: ReturnType<typeof parseCronExpr>, date: Date): boolean {
  if (parsed === null) return false
  if (!parsed.month.values.has(date.getMonth() + 1)) return false
  const dayOk = parsed.day.values.has(date.getDate())
  const weekOk = parsed.week.values.has(date.getDay())
  if (parsed.day.star || parsed.week.star) return dayOk && weekOk
  return dayOk || weekOk
}

/**
 * 计算表达式接下来的 N 个执行时间（从当前时间起，逐日推进）。
 * @param expr 5 字段 cron 表达式。
 * @param from 起始时间（缺省=当前）。
 * @param count 返回个数（默认 5，上限 50）。
 * @returns { ok: true, next: Date[] } 或 { ok: false, error }。
 */
export function nextRuns(expr: string, from: Date = new Date(), count = 5): { ok: true; next: Date[] } | { ok: false; error: string } {
  const parsed = parseCronExpr(expr)
  if (parsed === null) return { ok: false, error: 'invalid cron expression' }
  const n = Math.max(1, Math.min(50, count))

  // 从「下一分钟」开始：秒/毫秒归零后 +1 分钟。
  const lower = new Date(from)
  lower.setSeconds(0, 0)
  lower.setMinutes(lower.getMinutes() + 1)

  // 当天所有合法的「时:分」升序槽位，避免逐分钟空转（* * * * * 时 1440 个）。
  const slots: Array<[number, number]> = []
  for (const hour of [...parsed.hour.values].sort((a, b) => a - b)) {
    for (const minute of [...parsed.minute.values].sort((a, b) => a - b)) slots.push([hour, minute])
  }

  const next: Date[] = []
  const day = new Date(lower)
  day.setHours(0, 0, 0, 0)
  // 上限 30 年：足以覆盖 2/29（如 `0 0 29 2 *`）这类低频表达式。
  const maxDays = 366 * 30
  for (let guard = 0; guard < maxDays && next.length < n; guard += 1) {
    if (matchesDate(parsed, day)) {
      for (const [hour, minute] of slots) {
        const at = new Date(day)
        at.setHours(hour, minute, 0, 0)
        // 夏令时跳变日可能被规范化到别的时刻，此时跳过错过的槽位即可。
        if (at.getTime() < lower.getTime()) continue
        next.push(at)
        if (next.length >= n) break
      }
    }
    day.setDate(day.getDate() + 1)
  }
  return { ok: true, next }
}
