// 2.7 会话日志与循环的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/**
 * 定义 2.7.1：只追加的事件日志，顺序号由日志本身分配。
 */
export class SessionLog {
  #events = []
  #brokenTail = false

  /** @returns 当前事件数组的副本 */
  get events() { return [...this.#events] }

  /** @returns 读取时是否遇到过不完整的尾行 */
  get brokenTail() { return this.#brokenTail }

  /**
   * 追加一条事件。
   * @param event 形如 `{ type, ...payload }`
   * @returns 分配的顺序号
   */
  append(event) {
    const seq = this.#events.length + 1
    this.#events.push({ seq, ...event })
    return seq
  }

  /**
   * 从 NDJSON 文本读回事件，遇到解析失败即停止。
   * @param text NDJSON 文本
   * @returns 本次读回的事件数
   */
  readFrom(text) {
    let count = 0
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      try {
        this.#events.push(JSON.parse(line))
        count++
      } catch {
        // 只追加的日志里不完整只可能出现在尾部，因此解析失败即停止
        this.#brokenTail = true
        break
      }
    }
    return count
  }
}

/**
 * 定义 2.7.2：派生视图——从最后一个压缩点之后算起，并把压缩点转成摘要。
 * @param events 事件数组
 * @returns 消息数组
 */
export function deriveMessages(events) {
  const compactions = events.filter((e) => e.type === 'session/compaction')
  const last = compactions[compactions.length - 1]
  const from = last ? events.indexOf(last) : 0
  return events.slice(from).flatMap((e) => {
    if (e.type === 'session/user') return [{ role: 'user', content: e.text }]
    if (e.type === 'session/assistant') return [{ role: 'assistant', content: e.text, toolCalls: e.toolCalls ?? [] }]
    if (e.type === 'session/tool-result') return [{ role: 'tool', toolCallId: e.callId, content: e.content }]
    if (e.type === 'session/compaction') return [{ role: 'user', content: `（此前历史的摘要）${e.summary}` }]
    return []
  })
}

/**
 * 命题 2.7.1：从日志重建当时的请求内容。
 * @param events 事件数组
 * @returns `{ messages, tools, systemPrompt }`
 */
export function rebuildRequest(events) {
  const toolsChanges = events.filter((e) => e.type === 'session/tools-changed')
  const promptChanges = events.filter((e) => e.type === 'session/system-prompt')
  return {
    messages: deriveMessages(events),
    tools: toolsChanges.length ? toolsChanges[toolsChanges.length - 1].tools : [],
    systemPrompt: promptChanges.length ? promptChanges[promptChanges.length - 1].text : '',
  }
}

/**
 * 命题 2.7.2：调用数与结果数必须相等，被拦截的调用也计入。
 * @param events 事件数组
 * @returns `{ calls, results, missing, ok }`
 */
export function checkPairing(events) {
  const calls = events.filter((e) => e.type === 'session/assistant').flatMap((e) => e.toolCalls ?? [])
  const results = events.filter((e) => e.type === 'session/tool-result')
  const resultIds = new Set(results.map((e) => e.callId))
  const missing = calls.filter((c) => !resultIds.has(c.id)).map((c) => c.id)
  return { calls: calls.length, results: results.length, missing, ok: calls.length === results.length && missing.length === 0 }
}

/**
 * 定义 2.7.4 / 命题 2.7.2：工具执行的唯一出口——三种结局都产出结果。
 * @param call 工具调用
 * @param tools `{ [name]: () => { ok, content } | { blocked: true } }`
 * @returns `{ ok, content }`
 */
export async function executeOne(call, tools) {
  if (call.blocked) return { ok: false, content: `调用 ${call.name} 被拒绝` }
  const impl = tools[call.name]
  if (!impl) return { ok: false, content: `没有名为 ${call.name} 的工具` }
  try {
    const r = await impl(call.arguments ?? '{}')
    return r.ok === false ? { ok: false, content: r.error } : { ok: true, content: String(r.content ?? r) }
  } catch (err) {
    return { ok: false, content: `实现抛出异常：${err.message}` }
  }
}

/**
 * 定义 2.7.5：循环的两层终止条件。
 * @param session 会话日志
 * @param provider 形如 `{ respond(messages) }` 的假提供者
 * @param tools 工具表
 * @param maxSteps 步数上限
 * @returns `{ ok, steps, reason }`
 */
export async function runTurn(session, provider, tools, maxSteps = 4) {
  for (let step = 1; step <= maxSteps; step++) {
    const res = await provider.respond(deriveMessages(session.events))
    session.append({ type: 'session/assistant', text: res.content, toolCalls: res.toolCalls ?? [] })
    if ((res.toolCalls ?? []).length === 0) {
      session.append({ type: 'session/end-turn', step, reason: 'no-tool-calls' })
      return { ok: true, steps: step, reason: 'no-tool-calls' }
    }
    for (const call of res.toolCalls) {
      const outcome = await executeOne(call, tools)
      session.append({ type: 'session/tool-result', callId: call.id, ok: outcome.ok, content: outcome.content })
    }
  }
  session.append({ type: 'session/end-turn', step: maxSteps, reason: 'step-limit' })
  return { ok: false, steps: maxSteps, reason: 'step-limit' }
}

/**
 * 命题 2.7.3：每步重传全部历史时的总输入。
 * @param tokensPerStep 每步新增的 token 数
 * @param steps 步数
 * @returns 总输入 token 数
 */
export function transmitCost(tokensPerStep, steps) {
  return (tokensPerStep * steps * (steps + 1)) / 2
}

/**
 * 命题 2.7.4：水位线的两种写入顺序在崩溃后的后果。
 * @param order `'apply-first'` 或 `'watermark-first'`
 * @returns `{ applied, watermark, missing }`
 */
export function watermarkDemo(order) {
  const batch = [1, 2, 3]
  const applied = []
  let watermark = 0
  if (order === 'watermark-first') watermark = batch.length
  for (const x of batch) {
    if (applied.length === 1) break      // 应用到第一条之后崩溃
    applied.push(x)
    if (order === 'apply-first') watermark = x
  }
  const missing = batch.slice(applied.length, watermark).length
  return { applied: applied.length, watermark, missing }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export async function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('2.7 会话日志与循环 · 算例（SA-31）')
  rows.push('')

  rows.push('[1] 追加与读取')
  const log = new SessionLog()
  log.append({ type: 'session/user', text: '读一下 a.md' })
  log.append({ type: 'session/assistant', text: '', toolCalls: [{ id: 'c1', name: 'read', arguments: '{"path":"a.md"}' }] })
  log.append({ type: 'session/tool-result', callId: 'c1', ok: true, content: '内容' })
  line('追加后的事件数', log.events.length)
  line('顺序号', log.events.map((e) => e.seq).join(', '))
  const text = log.events.map((e) => JSON.stringify(e)).join('\n') + '\n{"seq":4,"type":"session/as'
  const reread = new SessionLog()
  line('尾部不完整行时的读回条数', reread.readFrom(text))
  line('是否检测到不完整的尾部', reread.brokenTail)
  rows.push('')

  rows.push('[2] 派生与配对')
  const events = log.events
  line('派生出的消息数', deriveMessages(events).length)
  const withCompaction = [
    ...events.slice(0, 2),
    { seq: 3, type: 'session/compaction', atSeq: 2, summary: '前两步' },
    { seq: 4, type: 'session/user', text: '继续' },
  ]
  line('压缩点之后的派生消息数', deriveMessages(withCompaction).length)
  line('压缩点是否把自己算成一条摘要', deriveMessages(withCompaction)[0].content.startsWith('（此前历史的摘要）'))

  const paired = new SessionLog()
  paired.append({ type: 'session/assistant', text: '', toolCalls: [
    { id: 'a', name: 'read' },
    { id: 'b', name: 'write', blocked: true },
    { id: 'c', name: 'boom' },
  ] })
  const tools = {
    read: async () => ({ ok: true, content: '内容' }),
    boom: async () => { throw new Error('内部缺陷') },
  }
  for (const call of paired.events[0].toolCalls) {
    const outcome = await executeOne(call, tools)
    paired.append({ type: 'session/tool-result', callId: call.id, ok: outcome.ok, content: outcome.content })
  }
  const pairing = checkPairing(paired.events)
  line('调用数与结果数', `${pairing.calls} / ${pairing.results}`)
  line('配对是否完整', pairing.ok)
  line('被拦截的调用是否产出结果', paired.events.some((e) => e.type === 'session/tool-result' && e.callId === 'b'))
  line('抛异常的调用是否产出结果', paired.events.some((e) => e.type === 'session/tool-result' && e.callId === 'c'))
  rows.push('')

  rows.push('[3] 收敛')
  const normal = new SessionLog()
  const twoStep = {
    n: 0,
    async respond() {
      this.n++
      return this.n === 1 ? { content: '', toolCalls: [{ id: 'c1', name: 'read' }] } : { content: '完成', toolCalls: [] }
    },
  }
  const okTurn = await runTurn(normal, twoStep, tools)
  line('正常终止在第几步', okTurn.steps)
  line('正常终止的原因', okTurn.reason)
  line('正常终止时日志是否记录原因', normal.events.some((e) => e.type === 'session/end-turn' && e.reason === 'no-tool-calls'))

  const looping = new SessionLog()
  const alwaysCall = {
    n: 0,
    async respond() { this.n++; return { content: '', toolCalls: [{ id: `c${this.n}`, name: 'read' }] } },
  }
  const limitTurn = await runTurn(looping, alwaysCall, tools, 4)
  line('达到上限在第几步', limitTurn.steps)
  line('达到上限的原因', limitTurn.reason)
  line('达到上限时日志是否记录原因', looping.events.some((e) => e.type === 'session/end-turn' && e.reason === 'step-limit'))
  line('上限回合的配对数', `${checkPairing(looping.events).calls} / ${checkPairing(looping.events).results}`)
  rows.push('')

  rows.push('[4] 重建与成本')
  const rebuilt = rebuildRequest(withCompaction)
  line('重建出的消息数', rebuilt.messages.length)
  line('重建出的工具清单', rebuilt.tools.length)
  line('没有工具变化事件时重建的工具数', rebuildRequest(events).tools.length)
  line('10 步的总输入（m=500）', transmitCost(500, 10))
  line('20 步的总输入（m=500）', transmitCost(500, 20))
  line('两者之比', (transmitCost(500, 20) / transmitCost(500, 10)).toFixed(2))
  rows.push('')

  rows.push('[5] 水位线')
  const applyFirst = watermarkDemo('apply-first')
  line('先应用后更新：已应用 / 水位线', `${applyFirst.applied} / ${applyFirst.watermark}`)
  line('先应用后更新：崩溃后的缺失条数', applyFirst.missing)
  const markFirst = watermarkDemo('watermark-first')
  line('先更新后应用：已应用 / 水位线', `${markFirst.applied} / ${markFirst.watermark}`)
  line('先更新后应用：崩溃后的缺失条数', markFirst.missing)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
