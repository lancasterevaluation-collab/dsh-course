// 3.6 配备算例：分档成本、延迟分解、命中判定、分位数、归因、护栏。
//
// 每个函数对应讲义 3.6 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa11_observe.mjs
import { pathToFileURL } from 'node:url'

/** 示例价格表（每千 token 单价，相对未命中输入价的倍数）。 */
export const PRICES = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }

/**
 * 定义 3.6.2：分档成本。单价按每千 token 计。
 * @param usage `{ input, output, cacheWrite, cacheRead }`（token 数）
 * @param prices `{ input, output, cacheWrite, cacheRead }`（每千 token 单价）
 * @returns 成本
 */
export function cost(usage, prices = PRICES) {
  return (
    usage.input * prices.input +
    usage.output * prices.output +
    usage.cacheWrite * prices.cacheWrite +
    usage.cacheRead * prices.cacheRead
  ) / 1000
}

/**
 * 定义 3.6.3 / 命题 3.6.6：延迟分解。
 *
 * 四段并不连续覆盖整段墙钟时间：工具段取的是工具执行的净耗时，
 * 而模型与工具之间的调度、网络往返与重试属于残余。因此 residual 不为零是正常的，
 * 它偏大意味着分解漏了一段，必须显式报告。
 *
 * @param marks `{ enqueuedAt, startedAt, firstTokenAt, lastTokenAt, toolDoneAt, toolMs }`（毫秒）
 * @returns `{ queue, prefill, decode, tool, residual, total }`
 */
export function latencyParts(marks) {
  const parts = {
    queue: marks.startedAt - marks.enqueuedAt,
    prefill: marks.firstTokenAt - marks.startedAt,
    decode: marks.lastTokenAt - marks.firstTokenAt,
    tool: marks.toolMs ?? 0,
  }
  const total = marks.toolDoneAt - marks.enqueuedAt
  const summed = parts.queue + parts.prefill + parts.decode + parts.tool
  return { ...parts, residual: total - summed, total }
}

/**
 * 定义 3.6.5 / 工具箱 5.1：分位数。报告时连样本量一起给。
 * @param values 样本 @param q 分位点（0<q<1） @returns `{ value, n, q }` 或 null
 */
export function quantile(values, q) {
  if (!Array.isArray(values) || values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return { value: sorted[idx], n: sorted.length, q }
}

/** 样本均值。@param values 样本 @returns 均值（空数组返回 null） */
export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * 定义 3.6.6：护栏。指标本身不产生行动，越界才产生。
 * @param metrics 指标名到值的映射 @param limits 指标名到上限的映射
 * @returns 越界项数组
 */
export function guardrails(metrics, limits) {
  const breached = []
  for (const [name, limit] of Object.entries(limits)) {
    const v = metrics[name]
    if (typeof v === 'number' && v > limit) breached.push({ name, value: v, limit })
  }
  return breached
}

/**
 * 定义 3.6.4 / 命题 3.6.2：命中长度，即最长公共前缀的长度。
 * @param prev 上次请求的前缀 @param cur 本次请求的前缀 @returns 命中长度
 */
export function hitLength(prev, cur) {
  if (!prev || !cur) return 0
  let i = 0
  while (i < prev.length && i < cur.length && prev[i] === cur[i]) i++
  return i
}

/**
 * 命题 3.6.2 / 二 2.3：缓存的有效价格倍数。
 * @param totalCalls 总调用次数 @param writes 缓存写入次数 @param hits 缓存命中次数
 * @param readPrice 命中价（相对未命中输入价） @param writePrice 写入价
 * @returns 前缀部分相对"全未命中"的价格倍数
 */
export function cacheEffectivePrice(totalCalls, writes, hits, readPrice = 0.1, writePrice = 1.25) {
  const misses = totalCalls - writes - hits
  if (misses < 0) throw new Error('写入与命中次数之和超过总调用次数')
  return (writes * writePrice + hits * readPrice + misses * 1) / totalCalls
}

/**
 * 定义 3.6.6 / 工具箱 5.2：归因差额。各维度之和与总量之差即未归因残余。
 * @param total 总量 @param parts 各维度值数组 @returns `{ gap, ratio }`
 */
export function attributionGap(total, parts) {
  const summed = parts.reduce((a, b) => a + b, 0)
  return { gap: total - summed, ratio: total === 0 ? 0 : (total - summed) / total }
}

/**
 * 命题 3.6.1：成本的可加性。同价格表下，合用量与分次算应当一致。
 * @param u1 第一次用量 @param u2 第二次用量 @param prices 价格表
 * @returns `{ separate, combined, equal }`
 */
export function costAdditive(u1, u2, prices = PRICES) {
  const separate = cost(u1, prices) + cost(u2, prices)
  const combined = cost({
    input: u1.input + u2.input,
    output: u1.output + u2.output,
    cacheWrite: u1.cacheWrite + u2.cacheWrite,
    cacheRead: u1.cacheRead + u2.cacheRead,
  }, prices)
  return { separate, combined, equal: Math.abs(separate - combined) < 1e-9 }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(42)} ${v}`)

  const u = { input: 20000, output: 500, cacheWrite: 0, cacheRead: 0 }
  line('cost(2 万输入 + 500 输出)', cost(u).toFixed(4))

  const marks = { enqueuedAt: 0, startedAt: 50, firstTokenAt: 400, lastTokenAt: 3000, toolDoneAt: 8000, toolMs: 4200 }
  const lp = latencyParts(marks)
  line('延迟四段', `排队 ${lp.queue} / 预填充 ${lp.prefill} / 生成 ${lp.decode} / 工具 ${lp.tool}`)
  line('延迟残余', lp.residual + ' 毫秒（总计 ' + lp.total + '，调度与网络）')

  line('命中长度（第 4 位起不同）', hitLength('abcXYZ', 'abcABC'))
  line('命中长度（完全相同）', hitLength('abc', 'abc'))
  line('命中长度（无缓存）', hitLength('', 'abc'))

  line('有效价格倍数（1 写 9 读）', cacheEffectivePrice(10, 1, 9).toFixed(3))
  line('相对未命中节省', (1 / cacheEffectivePrice(10, 1, 9)).toFixed(2) + ' 倍')
  line('全未命中的倍数', cacheEffectivePrice(10, 0, 0).toFixed(3))
  line('全命中的倍数（理想）', cacheEffectivePrice(10, 0, 10).toFixed(3))

  const samples = [100, 105, 98, 102, 3000]
  line('均值', mean(samples).toFixed(1))
  line('P95', JSON.stringify(quantile(samples, 0.95)))

  line('归因差额', JSON.stringify(attributionGap(8000, [50, 350, 2600, 5000])))
  line('护栏越界', JSON.stringify(guardrails({ latencyP95: 3000, cost: 1.2 }, { latencyP95: 2000, cost: 5 })))
  line('成本可加性', JSON.stringify(costAdditive(u, u).equal))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
