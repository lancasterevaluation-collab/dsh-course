// Part F · 派发与外部工具
//
// 对应讲义：5.4 多智能体与外部工具。契约：见 ../CONTRACT.md 的「Part F」。
//
// 起步状态：四个函数都抛错。三条核心判据：
//   不可提权、未识别外部错误不盲目重试、容量限制在协议里声明而不是回收时裁剪。

/**
 * 构造派发协议。
 *
 * 契约要点：
 *   - 四个要素缺一即抛错，信息含缺的那个字段名（目标/上下文/约束/产出格式）
 *   - context.notGive 为空 → 抛错（信息含「不给什么」）
 *   - outputFormat.maxChars 缺失或 <= 0 → 抛错（信息含「容量」）
 *   - depth = (parent.depth ?? 0) + 1；parentTask = parent.goal
 *   - 默认预算 { maxTokens: 50000, maxToolCalls: 30 }
 *
 * 提示：四个要素各防一类失败——缺目标则做错方向，缺上下文则返工，
 *       缺约束则越界改动，缺产出格式则结果用不上（讲义 5.4 的 0.1）。
 *
 * @param {{ id: string, goal: string, tools: string[], depth?: number, constraints?: string[] }} parent
 * @param {object} spec
 * @returns {object}
 */
export function buildDelegation(parent, spec) {
  throw new Error('未实现：buildDelegation')
}

/**
 * 派发的三条限制。
 *
 * 契约要点（顺序：深度 → 子任务数 → 全局并发）：
 *   - 深度越界 → reason 含「深度」
 *   - 子任务数越界 → reason 含「子任务」
 *   - 全局满 → reason 含「全局」
 *
 * @param {object} parent
 * @param {object} ctx
 * @returns {{ ok: boolean, reason?: string }}
 */
export function admitDelegation(parent, ctx) {
  throw new Error('未实现：admitDelegation')
}

/**
 * 回收子 agent 的结果。
 *
 * 契约要点：
 *   - kind 为 text 时 result 必须是字符串；list 时必须是数组；否则 ok:false 且 retryable:true（reason 含「格式」）
 *   - text 超出 maxChars → 裁剪并置 truncated: true
 *   - 成功时 meta 含 childId、tokens、turns
 *
 * 提示：格式校验在**回收时**，而容量限制在**协议里**（生成时）——两者的分工是
 *       "限制发生在生成时比发生在回收时更有效"（讲义 5.4 的 1.2）。
 *
 * @param {{ id: string, result: any, tokens?: number, turns?: number }} child
 * @param {{ kind: string, maxChars: number }} format
 * @param {object} ctx
 * @returns {object}
 */
export function collectResult(child, format, ctx) {
  throw new Error('未实现：collectResult')
}

/**
 * 外部错误归一化。
 *
 * 契约要点：
 *   - ECONNREFUSED/ECONNRESET/timeout/ETIMEDOUT → retryable
 *   - ENOENT/InvalidRequest/EPROTO → fatal
 *   - **未识别 → fatal 且 needsHuman: true**（保守默认，不盲目重试）
 *   - message 非空且含 server 名
 *
 * 提示：这一步的意义是让外部失败复用内部的错误分类与重试策略——
 *       没有它时，每接一个外部系统就多一种错误处理（讲义 5.4 的 1.5）。
 *
 * @param {{ code?: string, message?: string }} err
 * @param {string} server
 * @returns {{ kind: string, message: string, needsHuman: boolean }}
 */
export function normalizeExternalError(err, server) {
  throw new Error('未实现：normalizeExternalError')
}
