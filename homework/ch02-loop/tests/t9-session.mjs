// 2.7 会话日志与循环 · 判分器
//
// 用法：
//   node tests/t9-session.mjs
//   $env:IMPL='../grade/session.reference.mjs'; node tests/t9-session.mjs
//
// IMPL 相对【本文件】解析。判据逐条对应 kit/CONTRACT-session.md。

import { readFileSync } from 'node:fs'

const IMPL = process.env.IMPL ?? '../kit/src/session.mjs'
const VERBOSE = process.argv.includes('--verbose')

const mod = await import(new URL(IMPL, import.meta.url).href)
const { appendEvent, readLog, deriveMessages, pairingComplete, shouldStop } = mod

const CASES = [
  {
    name: 'E1 · 追加后顺序号是 1,2,3',
    clause: '契约 1',
    weight: 10,
    run: () => {
      let events = []
      events = appendEvent(events, { type: 'user', text: 'a' })
      events = appendEvent(events, { type: 'assistant', text: 'b' })
      events = appendEvent(events, { type: 'tool-call', id: 'c1', name: 'read' })
      const seq = events.map((e) => e.seq).join(',')
      return seq === '1,2,3' ? '' : `顺序号是 ${seq}，期望 1,2,3`
    },
  },
  {
    name: 'E2 · 追加不修改原数组',
    clause: '契约 1',
    weight: 10,
    run: () => {
      const before = appendEvent([], { type: 'user' })
      const after = appendEvent(before, { type: 'assistant' })
      return before.length === 1 && after.length === 2 ? '' : '追加修改了原数组'
    },
  },
  {
    name: 'E3 · 尾部不完整 → 截断并报告',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const lines = [
        JSON.stringify({ seq: 1, type: 'user' }),
        JSON.stringify({ seq: 2, type: 'assistant' }),
        JSON.stringify({ seq: 3, type: 'tool-call', id: 't' }),
        '{"seq": 4, "type": "tool-res',
      ]
      const { events, truncated } = readLog(lines)
      return events.length === 3 && truncated === true
        ? ''
        : `读回 ${events.length} 条、truncated=${truncated}，期望 3 条且 true`
    },
  },
  {
    name: 'E4 · 尾部不完整时前面的记录全部保留',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const lines = [JSON.stringify({ seq: 1 }), '半行', JSON.stringify({ seq: 2 })]
      const { events } = readLog(lines)
      // 中间那行坏了，但合法行都要在。
      return events.length === 2 ? '' : `读回 ${events.length} 条，期望保留 2 条合法记录`
    },
  },
  {
    name: 'E5 · 派生：使用者与助手消息',
    clause: '契约 3',
    weight: 10,
    run: () => {
      const messages = deriveMessages([
        { seq: 1, type: 'user', text: 'a' },
        { seq: 2, type: 'assistant', text: 'b' },
      ])
      return messages.length === 2 && messages[0].role === 'user' && messages[1].role === 'assistant'
        ? ''
        : `派生出的消息是 ${JSON.stringify(messages)}`
    },
  },
  {
    name: 'E6 · 派生：工具调用与结果成对',
    clause: '契约 3',
    weight: 10,
    run: () => {
      const messages = deriveMessages([
        { seq: 1, type: 'tool-call', id: 'c1', name: 'read' },
        { seq: 2, type: 'tool-result', id: 'c1', result: 'ok' },
      ])
      const call = messages.find((m) => m.toolCall === 'c1' && m.role === 'assistant')
      const result = messages.find((m) => m.toolCall === 'c1' && m.role === 'tool')
      return call && result ? '' : `派生出的消息是 ${JSON.stringify(messages)}`
    },
  },
  {
    name: 'E7 · ★ 压缩点派生成一条摘要消息',
    clause: '契约 3（最容易漏的一条）',
    weight: 10,
    run: () => {
      const messages = deriveMessages([
        { seq: 1, type: 'user', text: 'a' },
        { seq: 2, type: 'compaction', text: '前文的摘要' },
        { seq: 3, type: 'assistant', text: 'b' },
      ])
      const summary = messages.filter((m) => m.summary === true)
      return messages.length === 3 && summary.length === 1
        ? ''
        : `派生 ${messages.length} 条消息、其中摘要 ${summary.length} 条，期望 3 条且 1 条摘要`
    },
  },
  {
    name: 'E8 · ★ 配对完整（含被拦截的调用）',
    clause: '契约 4',
    weight: 10,
    run: () => {
      const events = [
        { seq: 1, type: 'tool-call', id: 'c1' },
        { seq: 2, type: 'tool-result', id: 'c1', ok: true },
        { seq: 3, type: 'tool-call', id: 'c2' },
        { seq: 4, type: 'tool-result', id: 'c2', ok: false, result: '被守卫拒绝' },
      ]
      return pairingComplete(events) === true ? '' : '被拦截的调用也算结果，配对应为完整'
    },
  },
  {
    name: 'E9 · ★ 缺失结果的调用被判为不完整',
    clause: '契约 4',
    weight: 10,
    run: () => {
      const events = [
        { seq: 1, type: 'tool-call', id: 'c1' },
        { seq: 2, type: 'tool-result', id: 'c1' },
        { seq: 3, type: 'tool-call', id: 'c2' },
      ]
      return pairingComplete(events) === false ? '' : 'c2 没有结果，配对应判为不完整'
    },
  },
  {
    name: 'E10 · 收敛判断',
    clause: '契约 5',
    weight: 10,
    run: () => {
      const done = shouldStop({ toolCalls: [] })
      const cont = shouldStop({ toolCalls: [{ id: 'c1' }] })
      if (done?.stop !== true || done?.reason !== 'no-tool-calls') {
        return `无工具调用时得到 ${JSON.stringify(done)}，期望 { stop: true, reason: 'no-tool-calls' }`
      }
      return cont?.stop === false ? '' : `有工具调用时得到 ${JSON.stringify(cont)}，期望 stop=false`
    },
  },
]

console.log('══ 2.7 会话日志与循环 · 构建题判分（按契约逐条检查）══')
console.log(`实现：${IMPL}`)
console.log('')

const IMPL_SOURCE = readFileSync(new URL(IMPL, import.meta.url), 'utf8')
const UNFILLED = /\bTODO\s*\d/.test(IMPL_SOURCE)
if (UNFILLED) console.log('实现仍是模板（含 TODO 标记），按未作答记 0 分。\n')

const missing = ['appendEvent', 'readLog', 'deriveMessages', 'pairingComplete', 'shouldStop'].filter(
  (name) => typeof mod[name] !== 'function',
)
if (missing.length > 0) {
  console.log(`❌ 实现缺少导出：${missing.join(', ')}`)
  console.log('')
  console.log(`总分：0 / ${CASES.reduce((sum, c) => sum + c.weight, 0)}`)
  process.exit(1)
}

let earned = 0
let total = 0
for (const c of CASES) {
  total += c.weight
  let why = ''
  if (UNFILLED) {
    why = '实现仍是模板（含 TODO 标记）'
  } else {
    try {
      why = c.run() || ''
    } catch (e) {
      why = `检查本身抛错：${e?.message ?? e}`
    }
  }
  if (why) {
    console.log(`❌ ${c.name}`)
    console.log(`   （${c.clause}）`)
    console.log(`   ${why}`)
  } else {
    earned += c.weight
    if (VERBOSE) console.log(`✅ ${c.name}  （${c.clause}）`)
  }
}

const pct = total > 0 ? earned / total : 0
const bar = '█'.repeat(Math.round(pct * 20)).padEnd(20, '░')
console.log('')
console.log(`${bar}  ${earned} / ${total}  （${Math.round(pct * 100)}%）`)
console.log('')
console.log(`总分：${earned} / ${total}`)
process.exit(earned === total ? 0 : 1)