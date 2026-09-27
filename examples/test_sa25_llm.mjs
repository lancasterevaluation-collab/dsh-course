// 2.1 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  ROLES, ERROR_ACTIONS, retryableCodes, classIsSufficient, toWireMessages,
  parseArguments, vendorConceptCount, transmitCost, prefixCacheSaving,
  parseFailure, wireFieldMapping, reconstructMessages,
} from './sa25_llm.mjs'

let pass = 0
let fail = 0
const near = (a, b, tol, label) => {
  if (Math.abs(a - b) <= tol) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${a}，期望 ${b}`)
}
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}`)
}
const ok = (c, label) => {
  if (c) { pass++; return }
  fail++
  console.log(`不通过：${label}`)
}
const throws = (fn, label) => {
  try { fn() } catch { pass++; return }
  fail++
  console.log(`不通过：${label} —— 未抛错`)
}

// 定义 2.1.2：四种位置
eq(ROLES, ['system', 'user', 'assistant', 'tool'], '消息有四种位置')
eq(ROLES.length, 4, '位置数量为 4')

// 定义 2.1.5：按处置分类
eq(Object.keys(ERROR_ACTIONS).length, 8, '错误有八个类别')
eq(retryableCodes(), ['overloaded', 'rate_limited', 'server_error'], '可重试的三个类别')
eq(retryableCodes().length, 3, '可重试类别数为 3')
eq(ERROR_ACTIONS.rate_limited.action, 'wait-longer', '限流应当等更久')
eq(ERROR_ACTIONS.overloaded.action, 'wait-longer', '超载应当等更久')
eq(ERROR_ACTIONS.server_error.action, 'retry-fast', '服务端错误应当快速重试')
eq(ERROR_ACTIONS.unknown.retryable, false, '未知错误不重试')
eq(ERROR_ACTIONS.unknown.action, 'fail-conservative', '未知错误走保守路径')
eq(ERROR_ACTIONS.invalid_request.retryable, false, '请求无效不重试')
eq(ERROR_ACTIONS.auth_failed.retryable, false, '认证失败不重试')
eq(ERROR_ACTIONS.network_unreachable.retryable, false, '网络不可达不重试')
eq(ERROR_ACTIONS.invalid_tool_arguments.retryable, false, '参数不合法不重试')
ok(ERROR_ACTIONS.rate_limited.retryable && ERROR_ACTIONS.overloaded.retryable, '两类等待型错误都可重试')

// 定义 2.1.5：分类充分性
eq(classIsSufficient([
  { class: 'transient', action: 'wait-longer' },
  { class: 'transient', action: 'wait-longer' },
  { class: 'fatal', action: 'fail' },
]), [], '同类同处置时判为充分')
eq(classIsSufficient([
  { class: 'transient', action: 'wait-longer' },
  { class: 'transient', action: 'retry-fast' },
]), ['transient'], '同类出现两种处置时被检出')
eq(classIsSufficient([]), [], '空条目判为充分')

// 定义 2.1.3：线格式翻译
const wire = toWireMessages([
  { role: 'system', content: '你是一个助手。' },
  { role: 'user', content: '读 package.json' },
  { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'read_file', arguments: '{"path":"package.json"}' }] },
  { role: 'tool', content: '{"name":"dsh-mini"}', toolCallId: 'c1' },
])
eq(wire.length, 4, '翻译不改变消息条数')
eq(wire[0].role, 'system', 'system 消息原样翻译')
ok(!('tool_calls' in wire[0]), '无工具调用时不产生 tool_calls 字段')
eq(wire[2].tool_calls[0].function.name, 'read_file', '工具名被嵌进 function 一层')
ok(typeof wire[2].tool_calls[0].function.arguments === 'string', '参数在翻译后仍是字符串')
eq(wire[3].tool_call_id, 'c1', '工具结果的引用被翻译成线格式字段名')
ok(!('toolCallId' in wire[3]), '内部字段名不进入线格式')

// 命题 2.1.4 / 2.1.5：边界解析
eq(parseArguments('{"path":"a.md"}', 'read_file').path, 'a.md', '合法对象被解析')
eq(parseArguments('{}', 'read_file').constructor, Object, '空对象被接受')
eq(parseArguments('{"a":{"b":1}}', 'x').a.b, 1, '嵌套结构被解析')
throws(() => parseArguments('{"path":"a.md"', 'read_file'), '截断的 JSON 抛错')
throws(() => parseArguments('[]', 'read_file'), '数组抛错')
throws(() => parseArguments('null', 'read_file'), 'null 抛错')
throws(() => parseArguments('12', 'read_file'), '数字抛错')
let msg = ''
try { parseArguments('{"path":"a.md"', 'read_file') } catch (e) { msg = e.message }
ok(msg.includes('read_file'), '错误信息含工具名')
ok(msg.includes('{"path":"a.md"'), '错误信息含原始字符串')
ok(msg.includes('不是合法 JSON'), '错误信息区分“不是 JSON”')
let msg2 = ''
try { parseArguments('[]', 'glob') } catch (e) { msg2 = e.message }
ok(msg2.includes('不是对象'), '错误信息区分“不是对象”')
ok(msg2.includes('glob'), '不是对象的错误也含工具名')

// 命题 2.1.6：可替换性判据
eq(vendorConceptCount(['LLMRequest', 'LLMResponse', 'ChatMessage', 'ToolCall']).count, 0, '本系统概念零泄漏')
eq(vendorConceptCount(['LLMRequest', 'DeepSeekBody']).count, 1, '厂商名被检出')
eq(vendorConceptCount(['LLMRequest', 'tool_call_id']).count, 1, '厂商字段名被检出')
eq(vendorConceptCount(['deepseek', 'openai', 'anthropic']).count, 3, '多家厂商名全部命中')
eq(vendorConceptCount(['choices']).count, 1, '线格式字段 choices 被检出')
eq(vendorConceptCount([]).count, 0, '空类型集合无泄漏')

// 命题 2.1.2：重传的二次增长
eq(transmitCost(800, 50).total, 1020000, '50 轮累计重传 1020000')
eq(transmitCost(800, 50).lastTurn, 40000, '第 50 轮单轮读入 40000')
eq(transmitCost(800, 100).total, 4040000, '100 轮累计重传 4040000')
const ratio = transmitCost(800, 100).total / transmitCost(800, 50).total
ok(ratio > 3.9 && ratio < 4, '轮数翻倍使总量接近四倍（有限轮数下略小于四）')
eq(transmitCost(800, 1).total, 800, '一轮的累计量等于单轮量')
eq(transmitCost(0, 50).total, 0, '每轮零新增时累计为零')

// 命题 2.1.2 的推论：前缀缓存
eq(prefixCacheSaving(800, 50).withCache, 40000, '缓存后读入 40000')
eq(prefixCacheSaving(800, 50).withoutCache, 1020000, '无缓存读入 1020000')
near(prefixCacheSaving(800, 50).saved, 1 - 2 / 51, 1e-12, '节省比例等于 1 - 2/(n+1)')
ok(prefixCacheSaving(800, 50).saved > 0.96, '50 轮时节省超过 96%')
ok(prefixCacheSaving(800, 100).saved > prefixCacheSaving(800, 50).saved, '轮数越多节省比例越高')

// 命题 2.1.4：解析失败概率
near(parseFailure(0.01, 10), 0.0956, 1e-4, '10 次调用失败概率 0.0956')
near(parseFailure(0.01, 100), 0.6340, 1e-4, '100 次调用失败概率 0.6340')
eq(parseFailure(0, 100), 0, '单次不可能失败时总概率为零')
eq(parseFailure(1, 1), 1, '必然失败时概率为一')
near(parseFailure(0.1, 100), 0.99997, 1e-5, 'p=0.1 时 100 次几乎必然失败')
ok(parseFailure(0.01, 100) > parseFailure(0.01, 10), '概率随调用次数单调增')

// 定义 2.1.3：翻译点数量
eq(wireFieldMapping().length, 4, '线格式字段映射共四处')
eq(wireFieldMapping()[0], { internal: 'toolCalls', wire: 'tool_calls' }, '第一处映射正确')
ok(wireFieldMapping().some((m) => m.wire === 'tool_call_id'), '包含 tool_call_id 映射')

// 命题 2.1.3：日志重建
const complete = reconstructMessages([
  { type: 'message', role: 'user', content: '读 package.json' },
  { type: 'message', role: 'assistant', content: '', toolCallId: 'c1' },
  { type: 'message', role: 'tool', content: '{"name":"dsh-mini"}', toolCallId: 'c1' },
])
ok(complete.complete, '完整日志可重建')
eq(complete.messages.length, 3, '重建出三条消息')
eq(complete.messages[1].toolCallId, 'c1', '配对信息被重建')
const partial = reconstructMessages([
  { type: 'message', role: 'user', content: 'hi' },
  { type: 'derived', modelVisible: true },
])
ok(!partial.complete, '含未记录输入时不可重建')
eq(partial.unlogged.length, 1, '未记录输入被列出')
ok(reconstructMessages([{ type: 'derived' }]).complete, '不可见事件不影响重建')
eq(reconstructMessages([]).messages, [], '空日志重建出空消息序列')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
