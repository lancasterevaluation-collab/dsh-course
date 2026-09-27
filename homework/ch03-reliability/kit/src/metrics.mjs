// Part F · 可观测
//
// 对应讲义：3.6 可观测。
// 契约：见 ../CONTRACT.md 的「Part F」一节。
//
// 起步状态：四个函数都抛错。这一项的判据里有两条是"安静的陷阱"：
//   **cachedPromptTokens 缺失时按零命中**（不得抛错）、**空集合返回 0**（不得 NaN）。

/**
 * 三档成本。
 *
 * 契约要点：
 *   - missInput 用 (promptTokens - cached)；hitInput 用 cached；output 用 completionTokens。
 *   - cached = usage.cachedPromptTokens ?? 0（**缺失按零命中，不抛错**）。
 *   - cached > promptTokens 时按 promptTokens 截断（不得出现负的 missInput）。
 *
 * 提示：单价是"每百万 token"的单位，而三档的划分依据是讲义 3.6 的 1.3（缓存命中价明显低于未命中）。
 *
 * @param {{ promptTokens: number, completionTokens: number, cachedPromptTokens?: number }} usage
 * @param {{ missPerMTok: number, hitPerMTok: number, outPerMTok: number }} price
 * @returns {{ missInput: number, hitInput: number, output: number, total: number }}
 */
export function costOf(usage, price) {
  throw new Error('未实现：costOf')
}

/**
 * 把一次调用的耗时拆成四段。
 *
 * 契约要点：
 *   - queueMs = startedAt - at、firstTokenMs = firstTokenAt - startedAt、generateMs = finishedAt - firstTokenAt。
 *   - retryWaitMs = req.retryWaitMs ?? 0。
 *   - totalMs = finishedAt - at，且**四段之和等于 totalMs**。
 *   - 任一时间戳缺失时抛错，信息含「时间戳」。
 *
 * 提示：四段之和等于总耗时这条不变量会在你引入"其他耗时"时被打破——而它正是判据的意义：
 *       分解必须覆盖全部时间，否则有说不清的一段。
 *
 * @param {{ at: number, startedAt: number, firstTokenAt: number, finishedAt: number, retryWaitMs?: number }} req
 * @returns {{ queueMs: number, firstTokenMs: number, generateMs: number, retryWaitMs: number, totalMs: number }}
 */
export function latencyBreakdown(req) {
  throw new Error('未实现：latencyBreakdown')
}

/**
 * 缓存命中率：命中输入 token 占输入 token 总数的比例。
 *
 * 契约要点：
 *   - 分子是 cachedPromptTokens 之和，分母是 promptTokens 之和。
 *   - **空数组返回 0**；分母为 0 时返回 0。
 *   - 结果夹在 [0, 1]。
 *
 * 提示：这道题的陷阱是空集合上的除零——而它在"某类任务没有请求"时是真实会发生的。
 *
 * @param {Array<{ promptTokens: number, cachedPromptTokens?: number }>} usages
 * @returns {number}
 */
export function hitRate(usages) {
  throw new Error('未实现：hitRate')
}

/**
 * 汇总一批度量：token、成本、命中率、延迟分位数与两个维度的归因。
 *
 * 契约要点：
 *   - latency 用**最近秩法**（p95 取排序后第 ceil(0.95 * n) - 1 个）。
 *   - bySession 按 sessionId 分组；byTool 按 tool 分组（**没有 tool 的记录不计入**）。
 *   - 空数组时各项为 0（分位数四项为 0），两个分组为空对象。
 *
 * 提示：分位数用最近秩法的理由是它不插值（对一组离散观测更诚实）。写之前先手算一个 n=3 的例子。
 *
 * @param {Array<object>} records
 * @param {{ missPerMTok: number, hitPerMTok: number, outPerMTok: number }} price
 * @returns {object}
 */
export function summarize(records, price) {
  throw new Error('未实现：summarize')
}
