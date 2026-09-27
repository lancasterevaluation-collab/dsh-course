/**
 * 参考答案：模型层的可替换 provider 抽象 + 错误分类。
 *
 * 这份实现的每一处都对应 CONTRACT.md 里的一条——注释里标出了是哪一条。
 * 它有两个用途：
 *   ① 验证判分器本身（跑它应当得满分——否则是判分器有问题）；
 *   ② 作为"合格实现长什么样"的参照。
 *
 * 验证：node tests/t2-build.mjs（默认读 kit/src/llm.mjs）
 *       IMPL=../grade/llm.reference.mjs node tests/t2-build.mjs
 */

/** 可重试的 code。承诺 5、不变量 1 都依据它。 */
export const RETRYABLE_CODES = ['rate_limited', 'overloaded', 'server_error']

/**
 * 模型层的错误。
 *
 * 承诺 9：name 固定为 'LLMError'，便于在日志里识别来源。
 * 承诺 6：retryAfterMs 原样保留（不变量：不加上限，见"不承诺 4"）。
 * 不变量 1：retryable 由 code 推出，所以两者不可能不一致。
 */
export class LLMError extends Error {
  #code
  #retryAfterMs

  constructor(code, message, options) {
    super(message)
    this.name = 'LLMError' // 承诺 9
    this.#code = code
    this.#retryAfterMs = options?.retryAfterMs // 承诺 6
  }

  get code() {
    return this.#code
  }

  /** 承诺 5：由 code 决定，不由调用方决定。 */
  get retryable() {
    return RETRYABLE_CODES.includes(this.#code)
  }

  get retryAfterMs() {
    return this.#retryAfterMs
  }
}

/**
 * 把工具调用的参数字符串解析成对象。
 *
 * 承诺 4、承诺 8（纯函数）、承诺 10（错误信息含工具名与前若干字符）。
 *
 * 注意它【不】校验 schema——那是工具系统的职责（"不承诺 1"）。
 *
 * @param {string} raw 模型给的原始字符串
 * @param {string} toolName 出错时用于定位的工具名
 * @returns {Record<string, unknown>} 解析后的参数对象
 * @throws {LLMError} raw 不是合法 JSON，或解析结果不是对象时
 */
export function parseArguments(raw, toolName) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    // 空 catch 里说清是什么错：模型生成了不合法的 JSON（常见于输出被截断）
    throw new LLMError(
      'invalid_tool_arguments',
      `工具 ${toolName} 的参数不是合法 JSON：${String(raw).slice(0, 120)}`, // 承诺 10
    )
  }
  // 承诺 4 的第三条：合法 JSON 但不是对象（数组、null、数字、字符串）同样要报错。
  // 这一条最容易被读漏——因为 JSON.parse 成功了，看起来已经"解析成功"。
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LLMError(
      'invalid_tool_arguments',
      `工具 ${toolName} 的参数不是对象：${String(raw).slice(0, 120)}`,
    )
  }
  return parsed
}

/**
 * 厂商线格式的翻译。**这是全文件唯一允许出现厂商字段名的地方**（讲义 1.4）。
 *
 * 注意它不导出：线格式是内部细节，不该出现在任何接口上（承诺 1）。
 *
 * @param {readonly object[]} messages 本系统的消息
 * @returns {object[]} 厂商线格式的消息
 */
function toWireMessages(messages) {
  return messages.map((m) => {
    const wire = { role: m.role, content: m.content }
    if (m.toolCallId) wire.tool_call_id = m.toolCallId
    if (m.toolCalls?.length) {
      wire.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }))
    }
    return wire
  })
}

/** 让"翻译函数存在但只被内部使用"这件事被静态检查看到。 */
export const __internal = { toWireMessages }

/**
 * 测试用的 provider。
 *
 * 承诺 1 的活证据：因为接口上没有厂商概念，所以这个不联网的实现能直接替换真实 provider。
 * 承诺 3：按脚本顺序返回。
 * 承诺 7：脚本用尽时抛错，而不是返回空响应。
 */
export class MockProvider {
  #steps
  #cursor = 0

  constructor(steps) {
    this.#steps = steps ?? []
    this.name = 'mock'
  }

  /**
   * @param {{ messages: readonly object[] }} _request 请求（Mock 不读它，但签名要与接口一致）
   * @returns {Promise<object>} 响应
   * @throws {LLMError} 脚本用尽，或脚本项本身是一个错误时
   */
  async chat(_request) {
    const step = this.#steps[this.#cursor]
    this.#cursor += 1
    if (!step) {
      // 承诺 7：抛错而不是返回空成功。理由见契约——那会让"脚本写少了"伪装成"模型返回空内容"。
      throw new LLMError('unknown', `MockProvider 的脚本已用尽（第 ${this.#cursor} 次调用）`)
    }
    if (step.kind === 'error') throw step.error
    // 不变量 3：这个返回值可以被 JSON 往返。
    return {
      content: step.content ?? '',
      toolCalls: step.toolCalls ?? [],
      usage: step.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }
  }
}
