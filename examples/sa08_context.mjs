// 3.3 配备算例：触发、压缩点、溢出、抽样审计、累积误差、保真度上界。
//
// 每个函数对应讲义 3.3 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa08_context.mjs
import { pathToFileURL } from 'node:url'

/**
 * 定义 3.3.1 / 7.2：触发判断。按触发线启动，给压缩调用本身留出预算。
 * @param used 当前序列的 token 数 @param budget 上下文预算 @param trigger 触发线比例
 * @returns 是否应当压缩
 */
export function shouldCompress(used, budget, trigger = 0.75) {
  return used >= budget * trigger
}

/** 序列的 token 总数。@param messages 消息数组（每项含 tokens） @returns token 总数 */
export function totalTokens(messages) {
  return messages.reduce((n, m) => n + m.tokens, 0)
}

/**
 * 命题 3.3.4 / 7.3：找压缩点。从尾部向前累计到保留量，再回退到配对边界。
 * @param messages 消息数组（每项含 tokens 与 kind）
 * @param keepTokens 需要保留的 token 数
 * @returns 压缩区间的起点下标（此下标之前的内容被压缩）
 */
export function findCompressionPoint(messages, keepTokens) {
  let acc = 0
  let i = messages.length
  while (i > 0) {
    acc += messages[i - 1].tokens
    if (acc >= keepTokens) break
    i--
  }
  // 回退：避免把 tool-call 与它的结果分到压缩区间的两侧
  while (i > 0 && messages[i - 1].kind === 'tool-call') i--
  return i
}

/**
 * 定义 3.3.5 / 7.5：溢出。超单条上限就外置并改用带预览的指针。
 * @param message 消息 @param budget 上下文预算 @param singleLimit 单条占比上限
 * @returns `{ message, spilled }`
 */
export function spill(message, budget, singleLimit = 0.25) {
  if (message.tokens <= budget * singleLimit) return { message, spilled: false }
  return {
    message: {
      kind: 'pointer',
      ref: message.id,
      tokens: 20,
      preview: message.content.slice(0, 200),
    },
    spilled: true,
  }
}

/**
 * 定义 3.3.2 / 7.4：压缩事件。它是"这里被压缩过"的唯一证据。
 * @param messages 消息数组 @param from 区间起点 @param to 区间终点
 * @param summary `{ text, tokens }`
 * @returns 压缩事件
 */
export function compressionEvent(messages, from, to, summary) {
  const before = messages.slice(from, to).reduce((n, m) => n + m.tokens, 0)
  return {
    kind: 'compression',
    range: [from, to],
    beforeTokens: before,
    afterTokens: summary.tokens,
    summary: summary.text,
    origin: from, // 派生起点
  }
}

/**
 * 二 2.3：一次输出消耗了多少轮的容量。
 * @param tokens 输出的 token 数 @param perRound 每轮固定开销 @returns 换算的轮数
 */
export function tokensToRounds(tokens, perRound) {
  return tokens / perRound
}

/**
 * 命题 3.3.6：抽样审计的漏检概率。
 * @param q 缺陷率 @param n 抽查条数 @returns 一条都没发现的概率
 */
export function auditMissRate(q, n) {
  return Math.pow(1 - q, n)
}

/**
 * 工具箱 5.3：检出错率 q 所需的抽查量（与零假设 q=0 相比）。
 * @param q 目标缺陷率 @param alpha 第一类错误率 @param power 功效
 * @returns 所需抽查条数
 */
export function auditSampleSize(q, alpha = 0.05, power = 0.8) {
  const zA = quantileNormal(1 - alpha / 2)
  const zB = quantileNormal(power)
  const num = Math.pow(zA + zB, 2) * q * (1 - q)
  return Math.ceil(num / (q * q))
}

/** 标准正态分位数（Acklam 逼近）。@param p 累积概率 @returns 分位数 */
export function quantileNormal(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const plow = 0.02425
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - plow) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/**
 * 命题 3.3.3：累积误差的线性上界。
 * @param epsilons 每次摘要的偏离 @returns 累积上界
 */
export function cumulativeError(epsilons) {
  return epsilons.reduce((s, e) => s + e, 0)
}

/**
 * 命题 3.3.1：保真度上界。这里用幂律率失真模型 D_min = H·(B'/T)^gamma。
 * @param budgetTokens 压缩后的 token 数 @param originalTokens 原始 token 数
 * @param gamma 失真指数（任务类型决定，越大表示压缩损失越轻）
 * @returns 保真度上界
 */
export function fidelityBound(budgetTokens, originalTokens, gamma = 1) {
  const ratio = budgetTokens / originalTokens
  return 1 - Math.pow(ratio, gamma)
}

/**
 * 命题 3.3.5：不动点检验。确定压缩应当收敛；若出现循环则说明算子不确定（如模型生成摘要）。
 * @param compress 压缩算子 @param seq 初始序列 @param budget 预算
 * @param trigger 触发线 @param maxSteps 最大步数
 * @returns `{ ok, steps, cycle }`
 */
export function isIdempotent(compress, seq, budget, trigger = 0.75, maxSteps = 50) {
  let cur = seq
  const seen = new Set()
  for (let i = 0; i < maxSteps; i++) {
    if (!shouldCompress(totalTokens(cur), budget, trigger)) return { ok: true, steps: i, cycle: false }
    const next = compress(cur)
    const key = JSON.stringify(next)
    if (seen.has(key)) return { ok: false, steps: i, cycle: true }
    seen.add(key)
    cur = next
  }
  return { ok: false, steps: maxSteps, cycle: false }
}

/**
 * 定义 3.3.6：折叠多次压缩事件，使"压缩了几次、每次丢了什么"一次看清。
 * @param events 压缩事件数组 @returns 折叠后的摘要记录
 */
export function foldEvents(events) {
  if (events.length === 0) return null
  return {
    count: events.length,
    origins: events.map((e) => e.origin),
    totalRemoved: events.reduce((n, e) => n + (e.beforeTokens - e.afterTokens), 0),
    accumulatedError: cumulativeError(events.map((e) => e.error ?? 0)),
  }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(40)} ${v}`)

  line('shouldCompress(7800, 10000)', shouldCompress(7800, 10000))
  line('shouldCompress(7000, 10000)', shouldCompress(7000, 10000))

  const msgs = [
    { tokens: 3000, kind: 'system' },
    { tokens: 5000, kind: 'user' },
    { tokens: 200, kind: 'tool-call' },
    { tokens: 4000, kind: 'tool-result' },
    { tokens: 800, kind: 'assistant' },
  ]
  line('findCompressionPoint(保留 4500)', findCompressionPoint(msgs, 4500))

  line('tokensToRounds(50000, 2000)', tokensToRounds(50000, 2000))
  line('auditMissRate(0.1, 10)', auditMissRate(0.1, 10).toFixed(3))
  line('auditMissRate(0.1, 30)', auditMissRate(0.1, 30).toFixed(3))
  line('auditSampleSize(0.1)', auditSampleSize(0.1))
  line('auditSampleSize(0.3)', auditSampleSize(0.3))
  line('cumulativeError([0.05,0.05,0.05])', cumulativeError([0.05, 0.05, 0.05]).toFixed(3))
  line('fidelityBound(1000, 5000, γ=1)', fidelityBound(1000, 5000, 1).toFixed(3))
  line('fidelityBound(1000, 5000, γ=2)', fidelityBound(1000, 5000, 2).toFixed(3))

  const big = { id: 'log-1', tokens: 50000, content: 'x'.repeat(5000) }
  const sp = spill(big, 10000)
  line('spill(50000 token, B=10000)', `spilled=${sp.spilled}, 指针 ${sp.message.tokens} token, 预览 ${sp.message.preview.length} 字符`)

  const ev = compressionEvent(msgs, 0, 2, { text: '早期消息的摘要', tokens: 300 })
  line('compressionEvent', `压掉 ${ev.beforeTokens} → ${ev.afterTokens} token，派生起点 ${ev.origin}`)

  // 不动点：确定性压缩收敛，随机压缩可能循环
  const det = (seq) => [...seq.slice(0, 1), { tokens: Math.max(100, Math.floor(totalTokens(seq) / 2)), kind: 'summary' }]
  line('isIdempotent(确定性压缩)', JSON.stringify(isIdempotent(det, msgs, 10000)))
  let flip = 0
  const rand = (seq) => {
    flip++
    const extra = flip % 2 === 0 ? 9000 : 8000 // 在触发线两侧来回
    return [{ tokens: extra, kind: 'summary' }]
  }
  line('isIdempotent(不确定压缩)', JSON.stringify(isIdempotent(rand, msgs, 10000)))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
