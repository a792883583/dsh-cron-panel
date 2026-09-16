/**
 * 自然语言 → 定时任务结构（cron 表达式 + 任务内容）的 LLM 解析。
 *
 * 本地正则（client/nl-cron.ts）只能穷举说法，换个语种或句式就失效；
 * 这里把解析交给模型：多语言、任意句式都能覆盖。任何失败（未配置 LLM /
 * 超时 / 返回非法）都返回 null，调用方静默回退本地正则，绝不打扰用户。
 * @module dsh-cron-panel/host/nl-llm
 */

/** 解析结果：5 字段 cron 表达式 + 剥离调度后的「要做什么」。 */
export interface NlParseResult {
  expr: string
  task: string | null
}

/** 5 字段表达式形状校验（与宿主写入校验 EXPR_RE 保持一致的宽松版）。 */
const EXPR_SHAPE = /^[0-9*/,A-Za-z-]+\s+[0-9*/,A-Za-z-]+\s+[0-9*/,A-Za-z-]+\s+[0-9*/,A-Za-z-]+\s+[0-9*/,A-Za-z-]+$/

/**
 * 空闲超时（自上次收到 chunk 起算）。
 *
 * 不能用固定总超时：不同模型差异极大——快的 2s 出结果，深推理的要 20~30s。
 * 固定值要么白等、要么误杀。这里改为「只要还有 chunk 在到达就不算超时」，
 * 完全自适应；真正卡死（连不上、认证失败）时才会触发。
 */
const IDLE_TIMEOUT_MS = 20_000

/**
 * 交给模型的说明。要求只输出 JSON，便于直接解析。
 * 实测这类解析模型会先输出 reasoning 再输出 text，因此显式要求正文只放结果。
 */
const SYSTEM = [
  'You convert a human scheduling request into a cron spec. Reply with JSON only, no prose.',
  'Output shape: {"expr":"<5-field cron>","task":"<what to do>"}',
  'Rules for expr (minute hour day-of-month month day-of-week, 0-6 = Sun..Sat):',
  '- Standard 5-field cron syntax: *, */n, a-b, a,b.',
  '- "every Wednesday at 1:30pm" -> "30 13 * * 3"',
  '- "every day at 9am" -> "0 9 * * *"',
  '- "1st of every month at 2am" -> "0 2 1 * *"',
  '- "every 5 minutes" -> "*/5 * * * *"',
  '- "weekends" -> day-of-week "0,6"',
  '- No time given -> default to "0 9 * * *"; no date/weekday given -> "*".',
  'Rules for task: the action to perform with all scheduling words removed,',
  'kept in the user\'s original language. If the request is only a schedule with',
  'no action (e.g. "every Wednesday at 1:30pm"), set task to null.',
].join('\n')

/** 从模型输出里抠出第一个 JSON 对象（容忍 ```json 代码块与前后废话）。 */
function extractJson(text: string): { expr: unknown; task: unknown } | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const candidates = [trimmed]
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced !== null) candidates.unshift(fenced[1].trim())
  // 截取首个 {...} 片段，避免模型在 JSON 后追加解释（或把答案埋在 reasoning 里）。
  const brace = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (brace !== -1 && end > brace) candidates.unshift(trimmed.slice(brace, end + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (typeof parsed === 'object' && parsed !== null && 'expr' in parsed) {
        return parsed as { expr: unknown; task: unknown }
      }
    } catch {
      // 试下一个候选。
    }
  }
  return null
}

/**
 * 用 LLM 解析一句自然语言。
 *
 * 实测 chunk 形态：`text-delta` 携带 `text` 字段（不是 delta），
 * `block-end` 携带完整 `block.text`；带推理能力的模型会把答案同时写进
 * reasoning，所以优先取正文，正文为空时再从 reasoning 兜底。
 *
 * @param llm 宿主 llm 服务（ctx.get('llm')）；为 null 时直接返回 null。
 * @param text 用户输入的自然语言。
 * @param opts provider/model（取自用户配置的默认模型）；reasoningEffort 可选，
 *   传入用户配置的值，未配置则不传以使用模型自身默认——实测部分模型遇到
 *   不支持的档位（如 medium/minimal）会静默返回空响应。
 * @returns 解析结果；失败、超时、非法输出一律 null。
 */
export async function parseWithLlm(
  llm: unknown,
  text: string,
  opts: { provider: string; model: string; reasoningEffort?: string },
): Promise<NlParseResult | null> {
  if (llm === null || text.trim() === '') return null
  const runtime = llm as {
    stream?: (options: Record<string, unknown>) => AsyncIterable<Record<string, unknown>>
  }
  if (typeof runtime.stream !== 'function') return null

  const controller = new AbortController()
  // 空闲超时：每来一个 chunk 就重置，任何模型（快慢皆可）都不会被误杀。
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const resetIdle = (): void => {
    if (idleTimer !== undefined) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS)
  }
  resetIdle()
  try {
    const stream = runtime.stream({
      provider: opts.provider,
      model: opts.model,
      // 尊重用户配置的推理档位；未配置则不传，交回模型自身默认。
      ...(typeof opts.reasoningEffort === 'string' && opts.reasoningEffort !== ''
        ? { reasoningEffort: opts.reasoningEffort }
        : {}),
      system: SYSTEM,
      // content 必须是结构化 ContentBlock[]，且 message 需要 source——
      // 传裸字符串会让适配器抛 "content.some is not a function"。
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: text.trim() }],
        source: { kind: 'plugin', plugin: 'dsh-cron-panel' },
      }],
      // 不指定 maxTokens：各模型输出上限差异很大（8k/32k/128k 都有），
      // 写死一个值可能超出小上限模型的限制而被拒绝。交给适配器用模型默认值。
      temperature: 0,
      signal: controller.signal,
    })

    // 只累计 text-delta（block-end 的 block.text 是同一段正文的完成态，
    // 两者都收会让结果重复一倍）。正文为空时才用 reasoning 兜底。
    let body = ''
    let reasoning = ''
    for await (const chunk of stream) {
      resetIdle()
      const type = typeof chunk?.type === 'string' ? chunk.type : ''
      if (type === 'text-delta') {
        if (typeof chunk.text === 'string') body += chunk.text
        continue
      }
      if (type === 'block-end') {
        const block = chunk.block as { type?: unknown; text?: unknown } | undefined
        // 只在正文缺失时收推理块：部分模型会把答案写进 reasoning。
        if (block?.type === 'reasoning' && typeof block.text === 'string') reasoning += block.text
      }
    }

    const source = body.trim() !== '' ? body : reasoning
    const parsed = extractJson(source)
    if (parsed === null) return null
    if (typeof parsed.expr !== 'string') return null
    const expr = parsed.expr.trim()
    if (!EXPR_SHAPE.test(expr)) return null
    const task = typeof parsed.task === 'string' && parsed.task.trim() !== '' ? parsed.task.trim() : null
    return { expr, task }
  } catch {
    // 未配置 API key / 超时 / 模型报错：静默失败，由调用方回退本地正则。
    return null
  } finally {
    if (idleTimer !== undefined) clearTimeout(idleTimer)
  }
}
