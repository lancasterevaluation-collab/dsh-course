// 2.6 装配与配置组合 · 判分器
//
// 用法：
//   node tests/t8-compose.mjs
//   $env:IMPL='../grade/compose.reference.mjs'; node tests/t8-compose.mjs
//
// IMPL 相对【本文件】解析。判据逐条对应 kit/CONTRACT-compose.md。

import { readFileSync } from 'node:fs'

const IMPL = process.env.IMPL ?? '../kit/src/compose.mjs'
const VERBOSE = process.argv.includes('--verbose')

const mod = await import(new URL(IMPL, import.meta.url).href)
const { merge, resolveConfig } = mod

const layer = (obj) => JSON.parse(JSON.stringify(obj))

const CASES = [
  {
    name: 'D1 · 深合并保留未冲突的键',
    clause: '契约 1',
    weight: 10,
    run: () => {
      const out = merge({ a: 1, b: 2 }, { b: 3 })
      return out.a === 1 && out.b === 3 ? '' : `结果是 ${JSON.stringify(out)}，期望保留 a 且 b 被覆盖`
    },
  },
  {
    name: 'D2 · 嵌套对象也深合并',
    clause: '契约 1',
    weight: 10,
    run: () => {
      const out = merge({ retry: { count: 3, backoff: 2 } }, { retry: { count: 5 } })
      return out.retry?.count === 5 && out.retry?.backoff === 2
        ? ''
        : `结果是 ${JSON.stringify(out.retry)}，期望 count=5 且保留 backoff=2`
    },
  },
  {
    name: 'D3 · 数组整体替换',
    clause: '契约 2',
    weight: 10,
    run: () => {
      const out = merge({ tools: ['read', 'write', 'exec'] }, { tools: ['read'] })
      return Array.isArray(out.tools) && out.tools.length === 1 && out.tools[0] === 'read'
        ? ''
        : `结果是 ${JSON.stringify(out.tools)}，期望被整体替换成 ["read"]`
    },
  },
  {
    name: 'D4 · ★ 数组支持"减少"元素',
    clause: '契约 2（元素级合并做不到这一点）',
    weight: 10,
    run: () => {
      const out = merge({ allow: ['a', 'b', 'c'] }, { allow: [] })
      return Array.isArray(out.allow) && out.allow.length === 0
        ? ''
        : `结果是 ${JSON.stringify(out.allow)}，期望空数组——上层要能收窄范围`
    },
  },
  {
    name: 'D5 · 不修改 base 入参',
    clause: '契约 3',
    weight: 10,
    run: () => {
      const base = { a: 1, nested: { x: 1 } }
      const snapshot = JSON.stringify(base)
      merge(base, { a: 2, nested: { y: 2 } })
      return JSON.stringify(base) === snapshot ? '' : `base 被改成了 ${JSON.stringify(base)}`
    },
  },
  {
    name: 'D6 · 不修改 override 入参',
    clause: '契约 3',
    weight: 10,
    run: () => {
      const override = { nested: { y: 2 } }
      const snapshot = JSON.stringify(override)
      merge({ nested: { x: 1 } }, override)
      return JSON.stringify(override) === snapshot ? '' : 'override 被改动了'
    },
  },
  {
    name: 'D7 · ★ 结合律成立',
    clause: '契约 4',
    weight: 10,
    run: () => {
      const a = { x: 1, y: { p: 1 } }
      const b = { y: { q: 2 } }
      const c = { z: 3 }
      const left = JSON.stringify(merge(merge(a, b), c))
      const right = JSON.stringify(merge(a, merge(b, c)))
      return left === right ? '' : `两种分组结果不同：${left} vs ${right}`
    },
  },
  {
    name: 'D8 · ★ 空对象是单位元',
    clause: '契约 4',
    weight: 10,
    run: () => {
      const a = { x: 1, y: { p: 1 } }
      const left = JSON.stringify(merge(a, {}))
      const right = JSON.stringify(merge({}, a))
      return left === JSON.stringify(a) && right === JSON.stringify(a)
        ? ''
        : `merge(a, {}) = ${left}，merge({}, a) = ${right}`
    },
  },
  {
    name: 'D9 · 来源追踪覆盖全部键',
    clause: '契约 5',
    weight: 10,
    run: () => {
      const layers = {
        builtin: { concurrency: 2, timeout: 30000 },
        user: { concurrency: 8 },
        project: { timeout: 60000 },
        session: {},
      }
      const { value, source } = resolveConfig(layer(layers))
      const keys = Object.keys(value)
      const missing = keys.filter((key) => !source || source[key] === undefined)
      return missing.length === 0 ? '' : `这些键没有来源：${missing.join(', ')}`
    },
  },
  {
    name: 'D10 · 来源标注的是最终生效的那一层',
    clause: '契约 5',
    weight: 10,
    run: () => {
      const layers = {
        builtin: { concurrency: 2, timeout: 30000 },
        user: { concurrency: 8 },
        project: { timeout: 60000 },
        session: {},
      }
      const { value, source } = resolveConfig(layer(layers))
      if (value.concurrency !== 8) return `concurrency 是 ${value.concurrency}，期望 8`
      if (value.timeout !== 60000) return `timeout 是 ${value.timeout}，期望 60000`
      if (source.concurrency !== 'user') return `concurrency 的来源是 ${source.concurrency}，期望 user`
      if (source.timeout !== 'project') return `timeout 的来源是 ${source.timeout}，期望 project`
      return ''
    },
  },
]

console.log('══ 2.6 装配与配置组合 · 构建题判分（按契约逐条检查）══')
console.log(`实现：${IMPL}`)
console.log('')

const IMPL_SOURCE = readFileSync(new URL(IMPL, import.meta.url), 'utf8')
const UNFILLED = /\bTODO\s*\d/.test(IMPL_SOURCE)
if (UNFILLED) console.log('实现仍是模板（含 TODO 标记），按未作答记 0 分。\n')

if (typeof merge !== 'function' || typeof resolveConfig !== 'function') {
  console.log('❌ 实现没有同时导出 merge 与 resolveConfig')
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