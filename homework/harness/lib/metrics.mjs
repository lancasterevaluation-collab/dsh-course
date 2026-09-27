// Part F 的参考实现。
//
// 两处"安静的陷阱"：
//   - cachedPromptTokens 缺失时按零命中（不抛错）；
//   - 空集合返回 0（不是 NaN）。
// 另有一处必须成立的不变量：延迟四段之和等于总耗时。

/**
 * 三档成本。
 * @param {{ promptTokens: number, completionTokens: number, cachedPromptTokens?: number }} usage
 * @param {{ missPerMTok: number, hitPerMTok: number, outPerMTok: number }} price
 * @returns {{ missInput: number, hitInput: number, output: number, total: number }}
 */
export function costOf(usage, price) {
  const promptTokens = num(usage?.promptTokens)
  const completionTokens = num(usage?.completionTokens)
  const cached = Math.min(num(usage?.cachedPromptTokens), promptTokens) // 截断，避免负的 miss
  const miss = promptTokens - cached
  const missInput = (miss / 1e6) * price.missPerMTok
  const hitInput = (cached / 1e6) * price.hitPerMTok
  const output = (completionTokens / 1e6) * price.outPerMTok
  return { missInput, hitInput, output, total: missInput + hitInput + output }
}

/**
 * 把一次调用的耗时拆成四段（四段之和等于总耗时）。
 * @param {{ at: number, startedAt: number, firstTokenAt: number, finishedAt: number, retryWaitMs?: number }} req
 * @returns {{ queueMs: number, firstTokenMs: number, generateMs: number, retryWaitMs: number, totalMs: number }}
 */
export function latencyBreakdown(req) {
  const keys = ['at', 'startedAt', 'firstTokenAt', 'finishedAt']
  const missing = keys.filter((k) => typeof req?.[k] !== 'number')
  if (missing.length) throw new Error(`缺少时间戳：${missing.join('、')}`)
  // 「其他」段用于吸收重试等待等不在三段中的时间，保证四段之和等于总耗时。
  const retryWaitMs = num(req.retryWaitMs)
  const other = Math.max(0, req.startedAt - (req.at + retryWaitMs))
  return {
    queueMs: other + retryWaitMs,
    firstTokenMs: req.firstTokenAt - req.startedAt,
    generateMs: req.finishedAt - req.firstTokenAt,
    retryWaitMs,
    totalMs: req.finishedAt - req.at,
  }
}

/**
 * 缓存命中率。
 * @param {Array<{ promptTokens: number, cachedPromptTokens?: number }>} usages
 * @returns {number}
 */
export function hitRate(usages) {
  const list = usages ?? []
  if (list.length === 0) return 0
  const total = list.reduce((n, u) => n + num(u?.promptTokens), 0)
  const hit = list.reduce((n, u) => n + num(u?.cachedPromptTokens), 0)
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, hit / total))
}

/**
 * 汇总一批度量。
 * @param {Array<object>} records
 * @param {{ missPerMTok: number, hitPerMTok: number, outPerMTok: number }} price
 * @returns {object}
 */
export function summarize(records, price) {
  const list = records ?? []
  const tokens = { missInput: 0, hitInput: 0, output: 0 }
  const cost = { missInput: 0, hitInput: 0, output: 0, total: 0 }
  const bySession = {}
  const byTool = {}
  const latencies = []

  for (const r of list) {
    const c = costOf(r.usage, price)
    cost.missInput += c.missInput
    cost.hitInput += c.hitInput
    cost.output += c.output
    cost.total += c.total

    const promptTokens = num(r.usage?.promptTokens)
    const cached = Math.min(num(r.usage?.cachedPromptTokens), promptTokens)
    tokens.missInput += promptTokens - cached
    tokens.hitInput += cached
    tokens.output += num(r.usage?.completionTokens)

    const sid = String(r.sessionId)
    bySession[sid] = bySession[sid] ?? { requests: 0, cost: 0 }
    bySession[sid].requests++
    bySession[sid].cost += c.total

    if (typeof r.tool === 'string' && r.tool.length > 0) {
      const t = r.tool
      byTool[t] = byTool[t] ?? { requests: 0, cost: 0 }
      byTool[t].requests++
      byTool[t].cost += c.total
    }

    if (typeof r.totalMs === 'number') latencies.push(r.totalMs)
  }

  return {
    requests: list.length,
    tokens,
    cost,
    hitRate: hitRate(list.map((r) => r.usage)),
    latency: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
    bySession,
    byTool,
  }
}

/** 最近秩法：不插值。 @param {number[]} values @param {number} q */
function percentile(values, q) {
  if (!values || values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1))
  return sorted[idx]
}

/** @param {unknown} v */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
