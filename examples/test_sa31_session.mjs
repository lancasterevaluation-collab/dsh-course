// 2.7 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  SessionLog, deriveMessages, rebuildRequest, checkPairing, executeOne, runTurn,
  transmitCost, watermarkDemo,
} from './sa31_session.mjs'

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

// 定义 2.7.1：追加与读取
{
  const log = new SessionLog()
  eq(log.append({ type: 'session/user', text: 'a' }), 1, '第一条的顺序号是 1')
  eq(log.append({ type: 'session/user', text: 'b' }), 2, '第二条的顺序号是 2')
  eq(log.append({ type: 'session/user', text: 'c' }), 3, '第三条的顺序号是 3')
  eq(log.events.length, 3, '追加后有三条事件')
  eq(log.events.map((e) => e.seq), [1, 2, 3], '顺序号连续')
  eq(log.events[0].type, 'session/user', '事件类型被保留')
  eq(log.brokenTail, false, '没有坏行时标志为假')
}
{
  const log = new SessionLog()
  const text = [
    '{"seq":1,"type":"session/user","text":"a"}',
    '{"seq":2,"type":"session/user","text":"b"}',
    '{"seq":3,"type":"session/user","text":"c"}',
    '{"seq":4,"type":"session/as',
  ].join('\n')
  eq(log.readFrom(text), 3, '尾部不完整行时的读回条数是 3')
  eq(log.brokenTail, true, '检测到不完整的尾部')
  eq(log.events.length, 3, '坏行之后的内容不被读入')
}
{
  const log = new SessionLog()
  eq(log.readFrom(''), 0, '空文本读回零条')
  eq(log.readFrom('\n\n'), 0, '只有空行时读回零条')
  eq(log.readFrom('{"seq":1,"type":"x"}'), 1, '单行文本读回一条')
}

// 定义 2.7.2 / 命题 2.7.1：派生与重建
{
  const events = [
    { seq: 1, type: 'session/user', text: '读一下' },
    { seq: 2, type: 'session/assistant', text: '', toolCalls: [{ id: 'c1', name: 'read' }] },
    { seq: 3, type: 'session/tool-result', callId: 'c1', ok: true, content: '内容' },
  ]
  const msgs = deriveMessages(events)
  eq(msgs.length, 3, '三条事件派生出三条消息')
  eq(msgs[0].role, 'user', '第一条是 user')
  eq(msgs[1].role, 'assistant', '第二条是 assistant')
  eq(msgs[2].role, 'tool', '第三条是 tool')
  eq(msgs[2].toolCallId, 'c1', '工具结果带配对标识')
  eq(msgs[1].toolCalls.length, 1, 'assistant 带工具调用')
}
{
  const events = [
    { seq: 1, type: 'session/user', text: '旧' },
    { seq: 2, type: 'session/user', text: '更旧' },
    { seq: 3, type: 'session/compaction', atSeq: 2, summary: '前两条' },
    { seq: 4, type: 'session/user', text: '新' },
  ]
  const msgs = deriveMessages(events)
  eq(msgs.length, 2, '压缩点之后只剩两条派生消息')
  ok(msgs[0].content.startsWith('（此前历史的摘要）'), '压缩点转成一条摘要消息')
  eq(msgs[1].content, '新', '压缩点之后的事件被保留')
  ok(!msgs.some((m) => m.content === '旧'), '被压缩的历史不再出现在派生视图里')
  eq(events.length, 4, '日志本身没有被改写')
}
{
  const events = [
    { seq: 1, type: 'session/tools-changed', tools: ['read', 'write'] },
    { seq: 2, type: 'session/system-prompt', text: '你是助手' },
    { seq: 3, type: 'session/user', text: 'hi' },
    { seq: 4, type: 'session/tools-changed', tools: ['read'] },
  ]
  const r = rebuildRequest(events)
  eq(r.tools, ['read'], '重建使用最近一次工具变化')
  eq(r.systemPrompt, '你是助手', '重建使用系统提示')
  eq(r.messages.length, 1, '重建出消息数组')
  eq(rebuildRequest([{ seq: 1, type: 'session/user', text: 'x' }]).tools, [], '没有工具变化时工具清单为空')
  eq(rebuildRequest([]).messages, [], '空日志重建出空消息')
}

// 定义 2.7.4 / 命题 2.7.2：配对
{
  const events = [
    { seq: 1, type: 'session/assistant', toolCalls: [{ id: 'a', name: 'read' }, { id: 'b', name: 'write' }] },
    { seq: 2, type: 'session/tool-result', callId: 'a', ok: true, content: 'x' },
    { seq: 3, type: 'session/tool-result', callId: 'b', ok: false, content: 'y' },
  ]
  const p = checkPairing(events)
  eq(p.calls, 2, '两个调用')
  eq(p.results, 2, '两条结果')
  eq(p.ok, true, '配对完整')
  eq(p.missing, [], '没有缺失的调用')
}
{
  const events = [
    { seq: 1, type: 'session/assistant', toolCalls: [{ id: 'a', name: 'read' }, { id: 'b', name: 'write' }] },
    { seq: 2, type: 'session/tool-result', callId: 'a', ok: true, content: 'x' },
  ]
  const p = checkPairing(events)
  eq(p.calls, 2, '两个调用')
  eq(p.results, 1, '只有一条结果')
  eq(p.ok, false, '配对不完整')
  eq(p.missing, ['b'], '缺失的调用被列出')
}
{
  eq(checkPairing([]).ok, true, '空日志视为配对完整')
  eq(checkPairing([{ seq: 1, type: 'session/user', text: 'x' }]).calls, 0, '没有调用时计数为零')
}
{
  // 结构保证：三种结局都产出结果
  const tools = {
    read: async () => ({ ok: true, content: '内容' }),
    denied: async () => ({ ok: false, error: '没有权限' }),
    boom: async () => { throw new Error('内部缺陷') },
  }
  eq((await executeOne({ id: 'a', name: 'read' }, tools)).ok, true, '正常返回是成功')
  eq((await executeOne({ id: 'b', name: 'denied' }, tools)).content, '没有权限', '返回失败时内容取错误文本')
  eq((await executeOne({ id: 'c', name: 'boom' }, tools)).ok, false, '实现抛异常时仍是失败值')
  ok((await executeOne({ id: 'c', name: 'boom' }, tools)).content.includes('内部缺陷'), '异常信息被保留')
  eq((await executeOne({ id: 'd', name: 'nope' }, tools)).ok, false, '未注册的工具返回失败')
  eq((await executeOne({ id: 'e', name: 'read', blocked: true }, tools)).ok, false, '被拦截的调用返回失败')
  ok((await executeOne({ id: 'e', name: 'read', blocked: true }, tools)).content.includes('被拒绝'), '被拦截的结果有内容')
}
{
  const log = new SessionLog()
  log.append({ type: 'session/assistant', toolCalls: [{ id: 'a', name: 'read' }, { id: 'b', name: 'read', blocked: true }, { id: 'c', name: 'boom' }] })
  const tools = { read: async () => ({ ok: true, content: 'x' }), boom: async () => { throw new Error('e') } }
  for (const call of log.events[0].toolCalls) {
    const outcome = await executeOne(call, tools)
    log.append({ type: 'session/tool-result', callId: call.id, ok: outcome.ok, content: outcome.content })
  }
  const p = checkPairing(log.events)
  eq(p.calls, 3, '三个调用')
  eq(p.results, 3, '三条结果（含被拦截与抛异常的）')
  eq(p.ok, true, '配对完整')
}

// 定义 2.7.5：收敛
{
  const log = new SessionLog()
  const provider = {
    n: 0,
    async respond() {
      this.n++
      return this.n === 1 ? { content: '', toolCalls: [{ id: 'c1', name: 'read' }] } : { content: '完成', toolCalls: [] }
    },
  }
  const r = await runTurn(log, provider, { read: async () => ({ ok: true, content: 'x' }) })
  eq(r.ok, true, '正常终止时返回成功')
  eq(r.steps, 2, '正常终止发生在第二步')
  eq(r.reason, 'no-tool-calls', '正常终止的原因是模型不再请求工具')
  ok(log.events.some((e) => e.type === 'session/end-turn' && e.reason === 'no-tool-calls'), '日志记录了终止原因')
  eq(checkPairing(log.events).ok, true, '正常终止时配对完整')
}
{
  const log = new SessionLog()
  const provider = {
    n: 0,
    async respond() { this.n++; return { content: '', toolCalls: [{ id: `c${this.n}`, name: 'read' }] } },
  }
  const r = await runTurn(log, provider, { read: async () => ({ ok: true, content: 'x' }) }, 4)
  eq(r.ok, false, '达到上限时返回失败')
  eq(r.steps, 4, '达到上限发生在第四步')
  eq(r.reason, 'step-limit', '达到上限的原因是步数用尽')
  ok(log.events.some((e) => e.type === 'session/end-turn' && e.reason === 'step-limit'), '日志记录了上限原因')
  eq(checkPairing(log.events).ok, true, '达到上限时配对仍然完整')
  eq(checkPairing(log.events).calls, 4, '四步共四次调用')
}
{
  const log = new SessionLog()
  const provider = { async respond() { return { content: '直接回答', toolCalls: [] } } }
  const r = await runTurn(log, provider, {})
  eq(r.steps, 1, '无工具调用时第一步即结束')
  eq(log.events.length, 2, '日志里有一条 assistant 与一条 end-turn')
}

// 命题 2.7.3：成本与步数
{
  eq(transmitCost(500, 10), 27500, '10 步的总输入是 27500')
  eq(transmitCost(500, 20), 105000, '20 步的总输入是 105000')
  near(transmitCost(500, 20) / transmitCost(500, 10), 3.82, 0.01, '两者之比约 3.82')
  eq(transmitCost(500, 1), 500, '一步的总输入等于单步量')
  ok(transmitCost(500, 20) / transmitCost(500, 10) < 4, '有限步数下倍率小于四')
}

// 命题 2.7.4：水位线的写入顺序
{
  const applyFirst = watermarkDemo('apply-first')
  eq(applyFirst.applied, 1, '先应用后更新：已应用一条')
  eq(applyFirst.watermark, 1, '先应用后更新：水位线也停在一条')
  eq(applyFirst.missing, 0, '先应用后更新不会有缺失')
  const markFirst = watermarkDemo('watermark-first')
  eq(markFirst.applied, 1, '先更新后应用：已应用一条')
  eq(markFirst.watermark, 3, '先更新后应用：水位线已推进到三条')
  eq(markFirst.missing, 2, '先更新后应用会产生两条缺失')
  ok(markFirst.missing > applyFirst.missing, '两种顺序的后果不对称')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
