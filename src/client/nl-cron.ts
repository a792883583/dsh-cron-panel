/**
 * 自然语言 → cron 表达式解析（中文为主，兼容简单英文）。
 * 覆盖常见模式：每分钟 / 每 N 分钟 / 每小时 / 每 N 小时 / 每天 / 每周X /
 * 每月 X 号 / 每周末，以及时段词（上午 / 下午 / 晚上…）与 12 小时制修正。
 * 无法解析时返回 null（调用方回退到手动表达式）。
 * @module dsh-cron-panel/client/nl-cron
 */

/** 时段 → 24 小时制偏移修正（12 小时制数字用）。 */
const PERIOD: Array<[RegExp, number, number]> = [
  [/凌晨/, 0, 5],
  [/早上|上午/, 6, 11],
  [/中午/, 11, 13],
  [/下午/, 12, 17],
  [/晚上|夜里|夜间|傍晚/, 18, 23],
]

/** 中文数字（一到十二）。 */
const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
}

/** 星期中文 → cron 数字（0=周日）。 */
const CN_WEEKDAY: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
}

/** 英文星期 → cron 数字。 */
const EN_WEEKDAY: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
}

function toNum(token: string | undefined, fallback = 0): number {
  if (token === undefined || token === '') return fallback
  if (/^\d+$/.test(token)) return Number(token)
  const cn = CN_NUM[token]
  if (cn !== undefined) return cn
  return fallback
}

/**
 * 从文本中解析"X点[Y分]"时间（含时段词修正），返回 {hour, minute} 或 null。
 */
function parseTime(text: string): { hour: number; minute: number } | null {
  const m = text.match(/(凌晨|早上|上午|中午|下午|晚上|夜里|夜间|傍晚)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*(?:点|[:：])\s*(半|(\d{1,2})分?)?/)
  if (m === null) return null
  let hour = toNum(m[2])
  const minute = m[3] === '半' ? 30 : m[4] === undefined ? 0 : Number(m[4])
  if (hour > 23 || minute > 59) return null
  const period = m[1] ?? ''
  if (period !== '') {
    for (const [re, lo, hi] of PERIOD) {
      if (re.test(period)) {
        // 12 小时制数字在时段内修正：下午 3 点 → 15 点。
        if (hour <= 12 && hour >= 1) {
          if (hi >= 12 && hour < 12) hour += 12
        }
        break
      }
    }
  } else if (text.includes('pm') || text.includes('下午') === false && text.includes('晚上')) {
    // 英文 pm / 无时段词时不做修正。
  }
  return { hour, minute }
}

/** 英文时间（9am / 9pm / 21:30）。 */
function parseEnglishTime(text: string): { hour: number; minute: number } | null {
  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  if (m === null) return null
  let hour = Number(m[1])
  const minute = m[2] === undefined ? 0 : Number(m[2])
  const ampm = m[3]
  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

/** 提取数字（含中文数字）。 */
function anyNum(text: string): number | null {
  const m = text.match(/(\d{1,2}|[一二两三四五六七八九十]{1,3})/)
  return m === null ? null : toNum(m[1], -1)
}

/**
 * 解析自然语言描述，返回 5 字段 cron 表达式；失败返回 null。
 */
export function parseNaturalLanguage(input: string): string | null {
  const text = input.trim().toLowerCase()
  if (text === '') return null

  // ---- 固定频率（无时间点） ----
  let m = text.match(/每\s*(\d{1,2})?\s*分钟|every\s+(\d{1,2})?\s*minutes?\b/)
  if (m !== null) {
    const n = Number(m[1] ?? m[2] ?? '1')
    if (n >= 1 && n <= 59) return `*/${n} * * * *`
    return null
  }
  m = text.match(/每\s*(\d{1,2})?\s*小时|every\s+(\d{1,2})?\s*hours?\b/)
  if (m !== null) {
    const n = Number(m[1] ?? m[2] ?? '1')
    if (n >= 1 && n <= 23) return n === 1 ? '0 * * * *' : `0 */${n} * * *`
    return null
  }

  // ---- 时间点 ----
  const cnTime = parseTime(text)
  const enTime = parseEnglishTime(text)
  const time = cnTime ?? enTime
  const hour = time?.hour ?? 0
  const minute = time?.minute ?? 0

  // ---- 星期 ----
  let weekday: number | null = null
  const wdMatch = text.match(/每\s*周|每个?星期|周[一二三四五六日天]|星期[一二三四五六日天]|every\s+\w+(?:day)?/)
  if (wdMatch !== null) {
    for (const [word, num] of Object.entries(CN_WEEKDAY)) {
      if (text.includes(`周${word}`) || text.includes(`星期${word}`)) {
        weekday = num
        break
      }
    }
    if (weekday === null) {
      for (const [word, num] of Object.entries(EN_WEEKDAY)) {
        if (text.includes(word)) {
          weekday = num
          break
        }
      }
    }
    if (text.includes('周末') || text.includes('weekend')) {
      // 周末：周六、周日。cron 0,6（0=周日）。
      return `${minute} ${hour} * * 0,6`
    }
    if (weekday !== null) return `${minute} ${hour} * * ${weekday}`
  }

  // ---- 每月 X 号 ----
  const dom = text.match(/每\s*月\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*[号日]/)
  if (dom !== null) {
    const day = toNum(dom[1])
    if (day >= 1 && day <= 31) return `${minute} ${hour} ${day} * *`
  }

  // ---- 每天 ----
  if (/每天|每日|every day|daily|每天[早中午晚上]|每[天日]/.test(text)) {
    return `${minute} ${hour} * * *`
  }

  // ---- 只有时间点（视为每天） ----
  if (time !== null) return `${minute} ${hour} * * *`

  return null
}
