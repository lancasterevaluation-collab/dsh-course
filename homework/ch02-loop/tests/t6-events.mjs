// 2.4 事件与扩展点 · 判分器
//
// 用法：
//   node tests/t6-events.mjs
//   $env:IMPL='../grade/events.reference.mjs'; node tests/t6-events.mjs
//
// IMPL 相对【本文件】解析。判据逐条对应 kit/CONTRACT-events.md。

import { readFileSync } from 'node:fs'

const IMPL = process.env.IMPL ?? '../kit/src/events.mjs'
const VERBOSE = process.argv.includes('--verbose')

const mod = await import(new URL(IMPL, import.meta.url).href)
const createBus = mod.createBus

const CASES = [
  {
    name: 'B1 · on 返回可调用的取消函数',
    clause: '契约 1',
    weight: 10,
    run: () => {
      const bus = createBus()
      const off = bus.on('x', () => {})
      return typeof off === 'function' ? '' : 'on 没有返回取消函数'
    },
  },
  {
    name: 'B2 · 广播：所有监听器都收到同一个载荷',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const bus = createBus()
      const seen = []
      const payload = { id: 7 }
      bus.on('x', (p) => seen.push(p))
      bus.on('x', (p) => seen.push(p))
      bus.emit('x', payload)
      return seen.length === 2 && seen.every((p) => p === payload)
        ? ''
        : `收到 ${seen.length} 次，且不都是同一个载荷对象`
    },
  },
  {
    name: 'B3 · 同优先级按注册顺序',
    clause: '契约 2（稳定性）',
    weight: 10,
    run: () => {
      const bus = createBus()
      const order = []
      bus.on('x', () => order.push('a'))
      bus.on('x', () => order.push('b'))
      bus.emit('x', null)
      return order.join(',') === 'a,b' ? '' : `顺序是 ${order.join(',')}，期望 a,b`
    },
  },
  {
    name: 'B4 · 优先级从大到小',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const bus = createBus()
      const order = []
      bus.on('x', () => order.push('low'), { priority: 1 })
      bus.on('x', () => order.push('high'), { priority: 9 })
      bus.emit('x', null)
      return order.join(',') === 'high,low' ? '' : `顺序是 ${order.join(',')}，期望 high,low`
    },
  },
  {
    name: 'B5 · emit 返回调用次数',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const bus = createBus()
      bus.on('x', () => {})
      bus.on('x', () => {})
      return bus.emit('x', null) === 2 ? '' : 'emit 没有返回监听器调用次数'
    },
  },
  {
    name: 'B6 · waterfall 依次传递',
    clause: '契约 3',
    weight: 10,
    run: () => {
      const bus = createBus()
      bus.on('w', (v, next) => next(`${v}a`))
      bus.on('w', (v, next) => next(`${v}b`))
      const result = bus.waterfall('w', '')
      return result?.value === 'ab' ? '' : `终值是 ${result?.value}，期望 ab`
    },
  },
  {
    name: 'B7 · ★ 不调用 next 即短路',
    clause: '契约 4（最容易漏的一条）',
    weight: 10,
    run: () => {
      const bus = createBus()
      const ran = []
      bus.on('w', () => 'stop')
      bus.on('w', () => ran.push('second'))
      const result = bus.waterfall('w', '')
      return ran.length === 0 && result?.value === 'stop' && result?.completed === false
        ? ''
        : `后续执行了 ${ran.length} 次，completed=${result?.completed}，期望 0 次且 false`
    },
  },
  {
    name: 'B8 · ★ 原样传回不算短路',
    clause: '契约 4',
    weight: 10,
    run: () => {
      const bus = createBus()
      const ran = []
      bus.on('w', (v, next) => next(v))
      bus.on('w', (v, next) => {
        ran.push('second')
        return next(`${v}!`)
      })
      const result = bus.waterfall('w', 'x')
      return ran.length === 1 && result?.value === 'x!' && result?.completed === true
        ? ''
        : `后续执行 ${ran.length} 次、终值 ${result?.value}、completed=${result?.completed}`
    },
  },
  {
    name: 'B9 · ★ 取消订阅幂等',
    clause: '契约 1 + 5',
    weight: 10,
    run: () => {
      const bus = createBus()
      const off = bus.on('x', () => {})
      const first = off()
      const second = off()
      return first === true && second === false ? '' : `返回 ${first} / ${second}，期望 true / false`
    },
  },
  {
    name: 'B10 · 取消后不再收到通知',
    clause: '契约 5',
    weight: 10,
    run: () => {
      const bus = createBus()
      let calls = 0
      const off = bus.on('x', () => {
        calls += 1
      })
      bus.emit('x', null)
      off()
      bus.emit('x', null)
      return calls === 1 ? '' : `共收到 ${calls} 次，期望 1 次`
    },
  },
]

console.log('══ 2.4 事件与扩展点 · 构建题判分（按契约逐条检查）══')
console.log(`实现：${IMPL}`)
console.log('')

const IMPL_SOURCE = readFileSync(new URL(IMPL, import.meta.url), 'utf8')
const UNFILLED = /\bTODO\s*\d/.test(IMPL_SOURCE)
if (UNFILLED) console.log('实现仍是模板（含 TODO 标记），按未作答记 0 分。\n')

let earned = 0
let total = 0

if (typeof createBus !== 'function') {
  console.log('❌ 实现没有导出 createBus')
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