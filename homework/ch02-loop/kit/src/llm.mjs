/**
 * 2.1 构建题 · 按契约实现模型层。
 *
 * ★ 你的依据是 ../CONTRACT.md，不是这份骨架的注释。
 *   骨架只给出结构与错误类，每一处 TODO 都要你自己判断怎么写。
 *
 * 判分：node tests/t2-build.mjs
 * 参考：../grade/llm.reference.mjs（做完再看）
 */

/** TODO 1：写出可重试的 code 列表。
 *  依据：契约的承诺 5。注意它会被 retryable 用到，也会被导出给外部检查。 */
export const RETRYABLE_CODES = []

/**
 * 模型层的错误。这一处已经给好了——因为它的形状由契约固定（承诺 5、6、9）。
 *
 * @param {string} code 错误的分类
 * @param {string} message 给人看的信息
 * @param {{ retryAfterMs?: number }} [options] 对方建议的等待时长
 */
export class LLMError extends Error {
  #code
  #retryAfterMs

  constructor(code, message, options) {
    super(message)
    this.name = 'LLMError'
    this.#code = code
    this.#retryAfterMs = options?.retryAfterMs
  }

  get code() {
    return this.#code
  }

  /**
   * TODO 2：判断这个错误可不可重试。
   *
   * ★ 这一处必须【由 code 推出】，不能写成构造时传入的布尔值。
   *   为什么？看契约的不变量 1。
   */
  get retryable() {
    throw new Error('TODO 2：还没有实现 retryable')
  }

  get retryAfterMs() {
    return this.#retryAfterMs
  }
}

/**
 * 解析工具调用的参数。
 *
 * TODO 3：实现它。
 *
 * ★ 三个情形要分清（契约的承诺 4）：
 *   ① 合法 JSON 且是对象 → 返回它
 *   ② 不是合法 JSON → 抛错
 *   ③ 是合法 JSON 但不是对象（数组 / null / 数字 / 字符串）→ 也要抛错
 *   第三种最容易被漏——因为 JSON.parse 成功了，看起来已经"解析成功"。
 *
 * ★ 错误信息里要带什么？看契约的承诺 10。
 *
 * @param {string} raw 模型给的原始字符串
 * @param {string} toolName 出错时用于定位的工具名
 * @returns {Record<string, unknown>}
 */
export function parseArguments(raw, toolName) {
  throw new Error('TODO 3：还没有实现 parseArguments')
}

/**
 * TODO 4：实现厂商线格式的翻译。
 *
 * ★ 它是整个文件里【唯一】允许出现厂商字段名的地方（讲义 1.4）。
 *   要翻译的字段有四处：toolCalls / toolCalls[].name / toolCalls[].arguments / toolCallId。
 *   讲义 1.8 有那张对照表。
 *
 * ★ 它不该被导出——契约的承诺 1 要求接口上没有厂商概念。
 *
 * @param {readonly object[]} messages
 * @returns {object[]}
 */
function toWireMessages(messages) {
  throw new Error('TODO 4：还没有实现 toWireMessages')
}

/**
 * 测试用的 provider。
 *
 * TODO 5：实现 chat()：按脚本顺序返回响应。
 * TODO 6：脚本用尽时的行为——★ 看契约的承诺 7，它有一个反直觉的要求。
 * TODO 7：脚本项是错误时抛出来（`step.kind === 'error'`）。
 */
export class MockProvider {
  #steps
  #cursor = 0

  constructor(steps) {
    this.#steps = steps ?? []
    this.name = 'mock'
  }

  /**
   * @param {{ messages: readonly object[] }} _request
   * @returns {Promise<object>}
   */
  async chat(_request) {
    throw new Error('TODO 5：还没有实现 chat')
  }
}
