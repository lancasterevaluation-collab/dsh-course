// 2.5 作用域与隔离 · 判分器
//
// 用法：
//   node tests/t7-scope.mjs
//   $env:IMPL='../grade/scope.reference.mjs'; node tests/t7-scope.mjs
//
// IMPL 相对【本文件】解析。判据逐条对应 kit/CONTRACT-scope.md。

import { readFileSync } from 'node:fs'

const IMPL = process.env.IMPL ?? '../kit/src/scope.mjs'
const VERBOSE = process.argv.includes('--verbose')

const mod = await import(new URL(IMPL, import.meta.url).href)
const createScope = mod.createScope

const CASES = [
  {
    name: 'C1 · 自身注册可解析',
    clause: '契约 1',
    weight: 10,
    run: () => {
      const root = createScope()
      root.define('cfg', 1)
      return root.lookup('cfg') === 1 ? '' : '本作用域注册后查不到'
    },
  },
  {
    name: 'C2 · 子作用域能查到父的注册（层级查找）',
    clause: '契约 1',
    weight: 10,
    run: () => {
      const root = createScope()
      root.define('cfg', 1)
      const child = root.child()
      return child.lookup('cfg') === 1 ? '' : '层级查找没有向上找到父的注册'
    },
  },
  {
    name: 'C3 · 子作用域覆盖父的同名（子胜出）',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const root = createScope()
      root.define('log', 'parent')
      const child = root.child()
      child.define('log', 'child')
      return child.lookup('log') === 'child' ? '' : '子作用域没有遮蔽父的同名值'
    },
  },
  {
    name: 'C4 · 父作用域不受子覆盖影响',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const root = createScope()
      root.define('log', 'parent')
      const child = root.child()
      child.define('log', 'child')
      return root.lookup('log') === 'parent' ? '' : '父作用域被子的覆盖影响了'
    },
  },
  {
    name: 'C5 · ★ 隔离标记切断向上查找',
    clause: '契约 3（最容易漏的一条）',
    weight: 10,
    run: () => {
      const root = createScope()
      root.define('net', 'real')
      const child = root.child()
      child.shield('net')
      return child.lookup('net') === undefined ? '' : '被隔离的名字仍然穿透到了父作用域'
    },
  },
  {
    name: 'C6 · 隔离标记不影响父作用域自身',
    clause: '契约 3',
    weight: 10,
    run: () => {
      const root = createScope()
      root.define('net', 'real')
      const child = root.child()
      child.shield('net')
      return root.lookup('net') === 'real' ? '' : '父作用域自己也被隔离标记挡住了'
    },
  },
  {
    name: 'C7 · 隔离标记不挡自有注册',
    clause: '契约 3',
    weight: 10,
    run: () => {
      const root = createScope()
      root.define('net', 'real')
      const child = root.child()
      child.shield('net')
      child.define('net', 'offline')
      return child.lookup('net') === 'offline' ? '' : '子作用域自己注册的值也被隔离标记挡住了'
    },
  },
  {
    name: 'C8 · 兄弟作用域互不可见',
    clause: '契约 4',
    weight: 10,
    run: () => {
      const root = createScope()
      const a = root.child()
      const b = root.child()
      a.define('sessionState', 1)
      return b.lookup('sessionState') === undefined ? '' : '兄弟作用域互相看到了对方的注册'
    },
  },
  {
    name: 'C9 · ★ 退出顺序：子先于父',
    clause: '契约 5',
    weight: 10,
    run: () => {
      const root = createScope()
      const session = root.child()
      const task = session.child()
      const order = root.dispose().map((scope) => (scope === root ? 'root' : scope === session ? 'session' : scope === task ? 'task' : '?'))
      return order.join(',') === 'task,session,root' ? '' : `退出顺序是 ${order.join(',')}，期望 task,session,root`
    },
  },
  {
    name: 'C10 · 退出后不可解析',
    clause: '契约 5',
    weight: 10,
    run: () => {
      const root = createScope()
      root.define('cfg', 1)
      root.dispose()
      return root.lookup('cfg') === undefined ? '' : '退出后仍然能解析到值'
    },
  },
]

console.log('══ 2.5 作用域与隔离 · 构建题判分（按契约逐条检查）══')
console.log(`实现：${IMPL}`)
console.log('')

const IMPL_SOURCE = readFileSync(new URL(IMPL, import.meta.url), 'utf8')
const UNFILLED = /\bTODO\s*\d/.test(IMPL_SOURCE)
if (UNFILLED) console.log('实现仍是模板（含 TODO 标记），按未作答记 0 分。\n')

if (typeof createScope !== 'function') {
  console.log('❌ 实现没有导出 createScope')
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