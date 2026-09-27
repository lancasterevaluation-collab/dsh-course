/**
 * 2.1 构建题判分：按契约逐条检查 llm.mjs。
 *
 * 对应 CS336 的 tests/：判分器不是评分表，而是一组能被反复运行的检查。
 * 每个用例对应 CONTRACT.md 里的一条承诺或不变量，注释里标出编号。
 *
 * 用法：
 *   node tests/t2-build.mjs                                  用 kit/src/llm.mjs
 *   $env:IMPL='../grade/llm.reference.mjs'                   用参考答案（PowerShell）
 *   node tests/t2-build.mjs --verbose                        打印每个用例的细节
 *
 * ★ IMPL 是相对【本文件】解析的，所以引用 kit 里要用 ../kit/src/llm.mjs。
 */

import { readFileSync } from 'node:fs'

const IMPL = process.env.IMPL ?? '../kit/src/llm.mjs'
const VERBOSE = process.argv.includes('--verbose')

const mod = await import(new URL(IMPL, import.meta.url).href)
const { LLMError, parseArguments, MockProvider, RETRYABLE_CODES } = mod

/** 用例表：每项 { 名称, 权重, 契约条款, 检查函数 }。检查函数返回 '' 表示通过。 */
const CASES = [
  {
    name: 'A1 · 合法 JSON 对象 → 返回该对象',
    weight: 12,
    clause: '承诺 4 第一条',
    run: () => {
      const got = parseArguments('{"path":"a.txt","n":3}', 'read_file')
      if (got?.path !== 'a.txt' || got?.n !== 3) return `期望 {path:'a.txt',n:3}，得到 ${JSON.stringify(got)}`
      return ''
    },
  },
  {
    name: 'A2 · 不是合法 JSON → 抛 invalid_tool_arguments',
    weight: 12,
    clause: '承诺 4 第二条',
    run: () => {
      try {
        parseArguments('{"path":"a.txt"', 'read_file')
        return '没有抛错'
      } catch (e) {
        if (!(e instanceof LLMError)) return `抛的不是 LLMError，而是 ${e?.constructor?.name}`
        if (e.code !== 'invalid_tool_arguments') return `code 是 ${e.code}，应为 invalid_tool_arguments`
        return ''
      }
    },
  },
  {
    name: 'A3 · ★ 合法 JSON 但不是对象 → 也要抛错',
    weight: 18,
    clause: '承诺 4 第三条（最容易漏的一条）',
    run: () => {
      // 四种非对象：数组、null、数字、字符串
      const bad = ['[1,2]', 'null', '42', '"abc"']
      const failed = []
      for (const raw of bad) {
        try {
          parseArguments(raw, 'read_file')
          failed.push(raw)
        } catch (e) {
          if (!(e instanceof LLMError) || e.code !== 'invalid_tool_arguments') {
            failed.push(`${raw}（抛了 ${e?.code ?? e?.constructor?.name}）`)
          }
        }
      }
      return failed.length ? `这些输入没有正确抛错：${failed.join('、')}` : ''
    },
  },
  {
    name: 'A4 · 错误信息含工具名与原始字符串',
    weight: 10,
    clause: '承诺 10',
    run: () => {
      try {
        parseArguments('{"path":"secret.txt"', 'my_special_tool')
        return '没有抛错'
      } catch (e) {
        if (!e.message.includes('my_special_tool')) return '错误信息里没有工具名'
        if (!e.message.includes('{"path":"secret.txt"')) return '错误信息里没有原始字符串'
        return ''
      }
    },
  },
  {
    name: 'A5 · parseArguments 是纯函数',
    weight: 6,
    clause: '承诺 8',
    run: () => {
      const a = parseArguments('{"x":1}', 't')
      const b = parseArguments('{"x":1}', 't')
      if (a === b) return '两次返回同一个对象（说明有共享状态）'
      if (JSON.stringify(a) !== JSON.stringify(b)) return '两次结果不一致'
      return ''
    },
  },
  {
    name: 'B1 · 三个可重试 code 的 retryable 为 true',
    weight: 10,
    clause: '承诺 5',
    run: () => {
      const wrong = []
      for (const code of ['rate_limited', 'overloaded', 'server_error']) {
        const e = new LLMError(code, 'x')
        if (e.retryable !== true) wrong.push(`${code}=${e.retryable}`)
      }
      return wrong.length ? `这些应当是 true：${wrong.join('、')}` : ''
    },
  },
  {
    name: 'B2 · 不可重试 code 的 retryable 为 false',
    weight: 10,
    clause: '承诺 5 + 不变量 2',
    run: () => {
      const wrong = []
      for (const code of ['invalid_request', 'invalid_tool_arguments', 'auth_failed', 'network_unreachable', 'unknown']) {
        const e = new LLMError(code, 'x')
        if (e.retryable !== false) wrong.push(`${code}=${e.retryable}`)
      }
      return wrong.length ? `这些应当是 false：${wrong.join('、')}` : ''
    },
  },
  {
    name: 'B3 · retryable 由 code 推出（不变量 1）',
    weight: 10,
    clause: '不变量 1',
    run: () => {
      // 同一个 code 构造两次，中间的 RETRYABLE_CODES 若被实现依赖成实例状态，这里会发现
      const e1 = new LLMError('rate_limited', 'x')
      const e2 = new LLMError('invalid_request', 'x')
      if (e1.retryable === true && e2.retryable === false) return ''
      return `retryable 与 code 不一致：rate_limited=${e1.retryable} invalid_request=${e2.retryable}`
    },
  },
  {
    name: 'B4 · retryAfterMs 原样保留',
    weight: 8,
    clause: '承诺 6',
    run: () => {
      const withVal = new LLMError('rate_limited', 'x', { retryAfterMs: 30000 })
      const without = new LLMError('rate_limited', 'x')
      if (withVal.retryAfterMs !== 30000) return `传 30000 读出来 ${withVal.retryAfterMs}`
      if (without.retryAfterMs !== undefined) return `没传时读出来 ${without.retryAfterMs}，应为 undefined`
      return ''
    },
  },
  {
    name: 'B5 · name 是 LLMError',
    weight: 4,
    clause: '承诺 9',
    run: () => (new LLMError('unknown', 'x').name === 'LLMError' ? '' : 'name 不是 LLMError'),
  },
  {
    name: 'C1 · MockProvider 按脚本顺序返回',
    weight: 10,
    clause: '承诺 3',
    run: async () => {
      const p = new MockProvider([
        { kind: 'ok', toolCalls: [{ id: 'c1', name: 'read_file', arguments: '{"path":"a"}' }] },
        { kind: 'ok', content: '答案是 42' },
      ])
      const r1 = await p.chat({ messages: [] })
      const r2 = await p.chat({ messages: [] })
      if (r1.toolCalls?.[0]?.name !== 'read_file') return '第一次调用没有返回脚本里的工具调用'
      if (r2.content !== '答案是 42') return `第二次调用得到 ${JSON.stringify(r2.content)}`
      return ''
    },
  },
  {
    name: 'C2 · ★ 脚本用尽时抛错，而不是返回空响应',
    weight: 16,
    clause: '承诺 7（反直觉的一条）',
    run: async () => {
      const p = new MockProvider([{ kind: 'ok', content: 'hi' }])
      await p.chat({ messages: [] })
      try {
        const r = await p.chat({ messages: [] })
        return `没有抛错，而是返回了 ${JSON.stringify(r)}`
      } catch (e) {
        if (!(e instanceof LLMError)) return `抛的不是 LLMError，而是 ${e?.constructor?.name}`
        return ''
      }
    },
  },
  {
    name: 'C3 · 脚本项是错误时抛出来',
    weight: 6,
    clause: '承诺 3',
    run: async () => {
      const err = new LLMError('rate_limited', '限流了')
      const p = new MockProvider([{ kind: 'error', error: err }])
      try {
        await p.chat({ messages: [] })
        return '没有抛错'
      } catch (e) {
        return e === err ? '' : `抛的不是脚本里那个错误`
      }
    },
  },
  {
    name: 'C4 · 响应可以被 JSON 往返',
    weight: 8,
    clause: '不变量 3',
    run: async () => {
      const p = new MockProvider([{ kind: 'ok', content: 'hi', toolCalls: [{ id: 'c1', name: 't', arguments: '{}' }] }])
      const r = await p.chat({ messages: [] })
      const back = JSON.parse(JSON.stringify(r))
      if (JSON.stringify(back) !== JSON.stringify(r)) return '往返之后结构变了'
      if (back.toolCalls?.[0]?.id !== 'c1') return '往返之后工具调用丢了'
      return ''
    },
  },
  {
    name: 'D1 · 导出的 RETRYABLE_CODES 与 retryable 一致',
    weight: 8,
    clause: '承诺 5（导出清单）',
    run: () => {
      if (!Array.isArray(RETRYABLE_CODES)) return `RETRYABLE_CODES 不是数组，而是 ${typeof RETRYABLE_CODES}`
      for (const code of RETRYABLE_CODES) {
        if (new LLMError(code, 'x').retryable !== true) return `${code} 在列表里但 retryable 为 false`
      }
      return ''
    },
  },
]

// ── 静态检查：承诺 1（接口上没有厂商概念）────────────────
const VENDOR_WORDS = /deepseek|openai|anthropic|claude|gpt|qwen|moonshot|zhipu/i

function staticCheck() {
  let src
  try {
    src = readFileSync(new URL(IMPL, import.meta.url), 'utf8')
  } catch {
    return { ok: false, why: `读不到实现文件 ${IMPL}` }
  }
  // 只看导出名字与注释之外的标识符；这里用一个务实的判据：
  // 源码里出现的厂商字样必须全部在注释里（以 // 或 * 开头的行）。
  const offenders = []
  for (const [i, line] of src.split('\n').entries()) {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
    if (VENDOR_WORDS.test(line)) offenders.push(`第 ${i + 1} 行`)
  }
  if (offenders.length) {
    return { ok: false, why: `厂商字样出现在代码里（应为注释）：${offenders.join('、')}` }
  }
  return { ok: true, why: '代码行里没有厂商字样' }
}

// ── 执行 ────────────────────────────────────────────────
console.log('')
console.log('══ 2.1 模型层 · 构建题判分（按契约逐条检查）══')
console.log(`实现：${IMPL}`)
console.log('')

let earned = 0
let total = 0
const failures = []

// 前置校验：实现仍是模板时直接判 0 分。
// 否则"否定式判据"（例如"代码里不出现厂商字样"）会在空实现上白送分——
// 这些判据问的是"有没有做错"，而空实现什么都没做，自然不算错。
const IMPL_SOURCE = readFileSync(new URL(IMPL, import.meta.url), 'utf8')
const UNFILLED = /\bTODO\s*\d/.test(IMPL_SOURCE)
if (UNFILLED) console.log('实现仍是模板（含 TODO 标记），按未作答记 0 分。\n')

for (const c of CASES) {
  total += c.weight
  let why = ''
  if (UNFILLED) {
    why = '实现仍是模板（含 TODO 标记）'
  } else {
    try {
      why = (await c.run()) || ''
    } catch (e) {
      why = `检查本身抛错：${e?.message ?? e}`
    }
  }
  if (why) {
    failures.push(c.name)
    console.log(`❌ ${c.name}`)
    console.log(`   （${c.clause}）`)
    console.log(`   ${why}`)
  } else {
    earned += c.weight
    if (VERBOSE) console.log(`✅ ${c.name}  （${c.clause}）`)
  }
}

// 静态检查单列，因为它检查的是源码而不是行为
{
  total += 12
  const r = UNFILLED ? { ok: false, why: '实现仍是模板（含 TODO 标记）' } : staticCheck()
  if (r.ok) {
    earned += 12
    if (VERBOSE) console.log(`✅ E1 · ★ 代码行里不出现厂商字样  （承诺 1）`)
  } else {
    failures.push('E1')
    console.log(`❌ E1 · ★ 代码行里不出现厂商字样  （承诺 1）`)
    console.log(`   ${r.why}`)
  }
}

const pct = total > 0 ? earned / total : 0
const bar = '█'.repeat(Math.round(pct * 20)).padEnd(20, '░')
console.log('')
console.log(`${bar}  ${earned} / ${total}  （${Math.round(pct * 100)}%）`)
console.log('')

if (failures.length === 0) {
  console.log('优秀——行为稳定，可以认为这一项已经做好。')
} else if (pct >= 0.7) {
  console.log(`还差几项：${failures.join('、')}。用 --verbose 看通过的项。`)
} else {
  console.log('★ 远未完成。建议先读 CONTRACT.md，特别是标着"最容易漏"的那几条。')
}

console.log('')
console.log('（对照参考答案：IMPL=../grade/llm.reference.mjs node tests/t2-build.mjs）')
console.log('')

process.exit(pct >= 0.5 ? 0 : 1)
