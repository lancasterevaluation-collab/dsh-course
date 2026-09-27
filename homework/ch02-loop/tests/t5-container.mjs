// 2.3 容器与依赖注入 · 判分器
//
// 用法：
//   node tests/t5-container.mjs                     用 kit/src/container.mjs
//   $env:IMPL='../grade/container.reference.mjs'; node tests/t5-container.mjs
//
// IMPL 相对【本文件】解析。判据逐条对应 kit/CONTRACT-container.md。

import { readFileSync } from 'node:fs'

const IMPL = process.env.IMPL ?? '../kit/src/container.mjs'
const VERBOSE = process.argv.includes('--verbose')

const mod = await import(new URL(IMPL, import.meta.url).href)
const createContainer = mod.createContainer

/** 每条判据返回空字符串表示通过，否则返回失败原因。 */
const CASES = [
  {
    name: 'A1 · register 返回带 dispose 的句柄',
    clause: '契约 1',
    weight: 10,
    run: () => {
      const c = createContainer()
      const h = c.register('logger', { tag: 'L' })
      return h && typeof h.dispose === 'function' ? '' : 'register 没有返回带 dispose 的句柄'
    },
  },
  {
    name: 'A2 · resolve 拿到注册的值',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const c = createContainer()
      const value = { tag: 'L' }
      c.register('logger', value)
      return c.resolve('logger') === value ? '' : 'resolve 拿到的不是注册进去的那个值'
    },
  },
  {
    name: 'A3 · 同名后注册者胜出',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const c = createContainer()
      c.register('logger', { tag: 'first' })
      const second = { tag: 'second' }
      c.register('logger', second)
      return c.resolve('logger') === second ? '' : '同名注册后拿到的不是后来者'
    },
  },
  {
    name: 'A4 · 按句柄撤销只影响那一次注册',
    clause: '契约 1（最容易漏的一条）',
    weight: 10,
    run: () => {
      const c = createContainer()
      const first = { tag: 'first' }
      c.register('logger', first)
      const h2 = c.register('logger', { tag: 'second' })
      h2.dispose()
      return c.resolve('logger') === first ? '' : '撤销后来者之后，前者没有恢复可见'
    },
  },
  {
    name: 'A5 · 撤销后该名字不可解析',
    clause: '契约 1',
    weight: 10,
    run: () => {
      const c = createContainer()
      const h = c.register('logger', { tag: 'L' })
      h.dispose()
      return c.resolve('logger') === undefined ? '' : '撤销后仍然能解析到值'
    },
  },
  {
    name: 'A6 · 撤销幂等',
    clause: '契约 5',
    weight: 10,
    run: () => {
      const c = createContainer()
      const h = c.register('logger', { tag: 'L' })
      const first = h.dispose()
      const second = h.dispose()
      return first === true && second === false ? '' : `两次撤销返回 ${first} / ${second}，期望 true / false`
    },
  },
  {
    name: 'A7 · disposeAll 按注册逆序执行',
    clause: '契约 3',
    weight: 10,
    run: () => {
      const c = createContainer()
      const handles = [c.register('a', 1), c.register('b', 2), c.register('c', 3)]
      const order = []
      handles.forEach((h, index) => {
        const original = h.dispose.bind(h)
        h.dispose = () => {
          order.push(index + 1)
          return original()
        }
      })
      c.disposeAll(handles)
      return order.join(',') === '3,2,1' ? '' : `撤销顺序是 ${order.join(',')}，期望 3,2,1`
    },
  },
  {
    name: 'A8 · 一次撤销失败不阻断其余',
    clause: '契约 4',
    weight: 10,
    run: () => {
      const c = createContainer()
      const handles = [c.register('a', 1), c.register('b', 2), c.register('c', 3)]
      const original = handles[1].dispose.bind(handles[1])
      handles[1].dispose = () => {
        throw new Error('boom')
      }
      const result = c.disposeAll(handles)
      handles[1].dispose = original
      return result.succeeded === 2 ? '' : `成功撤销 ${result.succeeded} 次，期望 2 次`
    },
  },
  {
    name: 'A9 · 失败被汇总到 failures',
    clause: '契约 4',
    weight: 10,
    run: () => {
      const c = createContainer()
      const handles = [c.register('a', 1), c.register('b', 2)]
      handles[1].dispose = () => {
        throw new Error('boom')
      }
      const result = c.disposeAll(handles)
      return Array.isArray(result.failures) && result.failures.length === 1
        ? ''
        : `failures 里记录了 ${result.failures?.length ?? '非数组'} 条，期望 1 条`
    },
  },
  {
    name: 'A10 · disposeAll 返回汇总结构',
    clause: '契约 3 + 4',
    weight: 10,
    run: () => {
      const c = createContainer()
      const handles = [c.register('a', 1)]
      const result = c.disposeAll(handles)
      return result && typeof result.succeeded === 'number' && Array.isArray(result.failures)
        ? ''
        : 'disposeAll 没有返回 { succeeded, failures }'
    },
  },
]

console.log('══ 2.3 容器与依赖注入 · 构建题判分（按契约逐条检查）══')
console.log(`实现：${IMPL}`)
console.log('')

let earned = 0
let total = 0
const failures = []

// 前置校验：实现仍是模板时整份记 0 分。
// 否则"否定式判据"会在空实现上白送分（见 homework/README.md 的判分规则）。
const IMPL_SOURCE = readFileSync(new URL(IMPL, import.meta.url), 'utf8')
const UNFILLED = /\bTODO\s*\d/.test(IMPL_SOURCE)
if (UNFILLED) console.log('实现仍是模板（含 TODO 标记），按未作答记 0 分。\n')

if (typeof createContainer !== 'function') {
  console.log('❌ 实现没有导出 createContainer')
  console.log('')
  console.log(`总分：0 / ${CASES.reduce((sum, c) => sum + c.weight, 0)}`)
  process.exit(1)
}

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
    failures.push(c.name)
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