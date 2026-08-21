/**
 * 极简 cron 表达式「下次执行时间」计算器（5 字段，无第三方依赖）。
 * 支持 * / , - 与数字；周字段 0-7（0 与 7 均表示周日）。
 * 用于面板展示「接下来 N 次运行时间」预览。
 * @module dsh-cron-panel/host/cron-next
 */

/** 解析一个字段（分/时/日/月/周）为允许值集合；返回 null 表示非法。 */
function parseField(raw: string, min: number, max: number): Set<number> | null {
  const field = raw.trim()
  if (field === '') return null
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
  return out.size > 0 ? out : null
}

/** 解析 5 字段 cron 表达式；返回 null 表示非法。 */
export function parseCronExpr(expr: string): { minute: Set<number>; hour: Set<number>; day: Set<number>; month: Set<number>; week: Set<number> } | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minute = parseField(parts[0], 0, 59)
  const hour = parseField(parts[1], 0, 23)
  const day = parseField(parts[2], 1, 31)
  const month = parseField(parts[3], 1, 12)
  let week = parseField(parts[4], 0, 7)
  if (minute === null || hour === null || day === null || month === null || week === null) return null
  // 周字段 7 等同 0（周日）。
  if (week.has(7)) {
    week = new Set([...week].map((v) => (v === 7 ? 0 : v)))
  }
  return { minute, hour, day, month, week }
}

/** 计算某个日期时间是否命中表达式（day/month/week 语义：day 与 week 为 OR）。 */
function matches(parsed: ReturnType<typeof parseCronExpr>, date: Date): boolean {
  if (parsed === null) return false
  const minute = date.getMinutes()
  const hour = date.getHours()
  const day = date.getDate()
  const month = date.getMonth() + 1
  const week = date.getDay()
  if (!parsed.minute.has(minute)) return false
  if (!parsed.hour.has(hour)) return false
  if (!parsed.month.has(month)) return false
  const dayOk = parsed.day.has(day)
  const weekOk = parsed.week.has(week)
  // 日与周同时受限时是 OR 语义（cron 规范），但都在时取 AND 更符合直觉；
  // 这里按 cron 规范：任一命中即可（经典 vixie cron 行为）。
  return dayOk || weekOk
}

/**
 * 计算表达式接下来的 N 个执行时间（从当前时间起，向后扫描）。
 * @param expr 5 字段 cron 表达式。
 * @param from 起始时间（缺省=当前）。
 * @param count 返回个数（默认 5，上限 50）。
 * @returns { ok: true, next: Date[] } 或 { ok: false, error }。
 */
export function nextRuns(expr: string, from: Date = new Date(), count = 5): { ok: true; next: Date[] } | { ok: false; error: string } {
  const parsed = parseCronExpr(expr)
  if (parsed === null) return { ok: false, error: 'invalid cron expression' }
  const n = Math.max(1, Math.min(50, count))
  const next: Date[] = []
  const cursor = new Date(from)
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1) // 从下一分钟开始
  let guard = 0
  while (next.length < n && guard < 366 * 24 * 60 * 8) {
    guard += 1
    if (matches(parsed, cursor)) next.push(new Date(cursor))
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  return { ok: true, next }
}