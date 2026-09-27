// 2.1 模型层与错误分类的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/** 定义 2.1.2：一条消息的四种位置。 */
export const ROLES = ['system', 'user', 'assistant', 'tool']

/**
 * 定义 2.1.5：错误按「遇到它该怎么办」分类，而不是按「它是什么」分类。
 *
 * 每个取值的 action 是处置动作，retryable 是 3.1 的重试机制唯一需要读的字段。
 */
export const ERROR_ACTIONS = {
  rate_limited: { action: 'wait-longer', retryable: true },
  overloaded: { action: 'wait-longer', retryable: true },
  server_error: { action: 'retry-fast', retryable: true },
  invalid_request: { action: 'fail', retryable: false },
  invalid_tool_arguments: { action: 'fail', retryable: false },
  auth_failed: { action: 'fail', retryable: false },
  network_unreachable: { action: 'fail', retryable: false },
  unknown: { action: 'fail-conservative', retryable: false },
}

/**
 * 定义 2.1.5：可重试的错误码。
 * @returns 可重试错误码的数组（按字母序）
 */
export function retryableCodes() {
  return Object.keys(ERROR_ACTIONS).filter((c) => ERROR_ACTIONS[c].retryable).sort()
}

/**
 * 定义 2.1.5：分类是否对处置充分——同一个类别里不能出现两种处置动作。
 * @param entries 形如 `[{ class, action }]` 的条目
 * @returns 处置不一致的类别名数组，空数组表示充分
 */
export function classIsSufficient(entries) {
  const byClass = new Map()
  for (const e of entries) {
    if (!byClass.has(e.class)) byClass.set(e.class, new Set())
    byClass.get(e.class).add(e.action)
  }
  return [...byClass.entries()].filter(([, a]) => a.size > 1).map(([c]) => c).sort()
}

/**
 * 定义 2.1.3：把本系统的消息翻译成厂商线格式。
 *
 * 这是整个文件里唯一允许出现厂商字段名的地方，因此「换一家厂商要改多少」的答案是确定的。
 * @param messages 本系统的消息数组
 * @returns 线格式消息数组
 */
export function toWireMessages(messages) {
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

/**
 * 命题 2.1.4 / 2.1.5：在参数进入系统的边界处解析，失败立刻报错并带上定位信息。
 * @param raw 模型给出的原始字符串
 * @param toolName 出错时用于定位的工具名
 * @returns 解析后的对象
 * @throws 当 raw 不是合法 JSON，或解析结果不是对象时
 */
export function parseArguments(raw, toolName) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    // 空 catch 说明是什么错：模型生成了不合法 JSON（常见于输出被截断）
    throw new Error(`工具 ${toolName} 的参数不是合法 JSON：${raw.slice(0, 120)}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`工具 ${toolName} 的参数不是对象：${raw.slice(0, 120)}`)
  }
  return parsed
}

/** 线格式里出现厂商字段名的位置。这个列表的长度就是「换一家要改多少」的答案。 */
const VENDOR_TOKENS = ['deepseek', 'openai', 'anthropic', 'tool_call_id', 'tool_calls', 'choices']

/**
 * 命题 2.1.6：可替换性判据——接口类型闭包中不得出现任何厂商专有概念。
 *
 * 检查是大小写不敏感的，因为泄漏往往以字段名的形式出现，而字段名的写法会变。
 * @param typeNames 接口类型闭包中的类型名与成员名
 * @returns `{ count, hits }`，count 为命中的名字个数
 */
export function vendorConceptCount(typeNames) {
  const hits = typeNames.filter((t) => VENDOR_TOKENS.some((v) => String(t).toLowerCase().includes(v)))
  return { count: hits.length, hits }
}

/**
 * 命题 2.1.2：每轮重传全部历史时的累计读入量。
 * @param tokensPerTurn 每轮新增的 token 数
 * @param turns 轮数
 * @returns `{ lastTurn, total }`
 */
export function transmitCost(tokensPerTurn, turns) {
  return {
    lastTurn: tokensPerTurn * turns,
    total: (tokensPerTurn * turns * (turns + 1)) / 2,
  }
}

/**
 * 命题 2.1.2 的推论：前缀被缓存时只需传增量。
 * @param tokensPerTurn 每轮新增的 token 数
 * @param turns 轮数
 * @returns `{ withCache, withoutCache, saved }`，saved 为节省比例
 */
export function prefixCacheSaving(tokensPerTurn, turns) {
  const withoutCache = transmitCost(tokensPerTurn, turns).total
  const withCache = tokensPerTurn * turns
  return { withCache, withoutCache, saved: 1 - withCache / withoutCache }
}

/**
 * 命题 2.1.4：n 次调用中至少出现一次不合法参数的概率。
 * @param perCall 单次调用的失败概率
 * @param calls 调用次数
 * @returns 至少失败一次的概率
 */
export function parseFailure(perCall, calls) {
  return 1 - (1 - perCall) ** calls
}

/**
 * 定义 2.1.3：内部字段与线格式字段的对应关系。
 * @returns 映射条目数组，长度即需要收在一处的翻译点数量
 */
export function wireFieldMapping() {
  return [
    { internal: 'toolCalls', wire: 'tool_calls' },
    { internal: 'toolCallId', wire: 'tool_call_id' },
    { internal: 'toolCalls[].name', wire: 'tool_calls[].function.name' },
    { internal: 'toolCalls[].arguments', wire: 'tool_calls[].function.arguments' },
  ]
}

/**
 * 命题 2.1.3：从会话日志重建模型当时看到的输入。
 *
 * 只有被记录的消息能重建；任何「模型可见但没有对应日志事件」的输入都会使重建不完整。
 * @param events 日志事件数组，事件形如 `{ type, role?, content?, modelVisible? }`
 * @returns `{ messages, complete, unlogged }`
 */
export function reconstructMessages(events) {
  const messages = []
  const unlogged = []
  for (const e of events) {
    if (e.type === 'message') {
      const m = { role: e.role, content: e.content }
      if (e.toolCallId) m.toolCallId = e.toolCallId
      messages.push(m)
    } else if (e.modelVisible) {
      unlogged.push(e)
    }
  }
  return { messages, complete: unlogged.length === 0, unlogged }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('2.1 模型层与错误分类 · 算例（SA-25）')
  rows.push('')

  rows.push('[1] 消息位置与错误处置')
  line('位置数量', ROLES.length + '（' + ROLES.join(', ') + '）')
  line('错误类别数量', Object.keys(ERROR_ACTIONS).length)
  line('可重试类别', retryableCodes().length + '（' + retryableCodes().join(', ') + '）')
  line('限流的处置动作', ERROR_ACTIONS.rate_limited.action)
  line('服务端错误的处置动作', ERROR_ACTIONS.server_error.action)
  line('未知错误的处置动作', ERROR_ACTIONS.unknown.action + '（retryable=' + ERROR_ACTIONS.unknown.retryable + '）')
  line('分类充分性检查（同类同处置）', JSON.stringify(classIsSufficient([
    { class: 'transient', action: 'wait-longer' },
    { class: 'transient', action: 'wait-longer' },
    { class: 'fatal', action: 'fail' },
  ])))
  line('分类充分性检查（混入异类）', JSON.stringify(classIsSufficient([
    { class: 'transient', action: 'wait-longer' },
    { class: 'transient', action: 'retry-fast' },
  ])))
  rows.push('')

  rows.push('[2] 重传的二次增长与缓存节省')
  line('50 轮累计重传 @ m=800', transmitCost(800, 50).total)
  line('第 50 轮的单轮读入', transmitCost(800, 50).lastTurn)
  line('轮数翻倍（n=100）的累计', transmitCost(800, 100).total)
  line('翻倍倍率', (transmitCost(800, 100).total / transmitCost(800, 50).total).toFixed(1) + ' 倍')
  line('前缀缓存后的读入', prefixCacheSaving(800, 50).withCache)
  line('节省比例', (prefixCacheSaving(800, 50).saved * 100).toFixed(1) + '%')
  rows.push('')

  rows.push('[3] 参数解析的失败概率')
  line('10 次调用至少失败一次 @ p=0.01', (parseFailure(0.01, 10) * 100).toFixed(1) + '%')
  line('100 次调用至少失败一次 @ p=0.01', (parseFailure(0.01, 100) * 100).toFixed(1) + '%')
  line('100 次调用至少失败一次 @ p=0.10', (parseFailure(0.1, 100) * 100).toFixed(1) + '%')
  rows.push('')

  rows.push('[4] 厂商边界')
  line('类型闭包中的厂商概念数', vendorConceptCount(['LLMRequest', 'LLMResponse', 'ChatMessage', 'ToolCall']).count)
  line('泄漏样本的命中数', vendorConceptCount(['ChatMessage', 'DeepSeekBody', 'tool_call_id']).count)
  line('线格式字段映射处数', wireFieldMapping().length + '（收在一个函数里）')
  rows.push('')

  rows.push('[5] 日志重建')
  const complete = reconstructMessages([
    { type: 'message', role: 'user', content: '读 package.json' },
    { type: 'message', role: 'assistant', content: '', toolCallId: 'c1' },
  ])
  line('完整日志可重建', complete.complete)
  const partial = reconstructMessages([
    { type: 'message', role: 'user', content: '读 package.json' },
    { type: 'derived', modelVisible: true },
  ])
  line('含未记录输入时可重建', partial.complete)
  line('未记录事件数', partial.unlogged.length)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
