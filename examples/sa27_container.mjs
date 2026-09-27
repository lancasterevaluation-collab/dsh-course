// 2.3 容器与依赖注入的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/** 定义 2.3.6：五个生命周期阶段。 */
export const PHASES = ['before-register', 'registered', 'ready', 'disposing', 'disposed']

/**
 * 定义 2.3.1：服务表里的一条记录——实现、主人、作用域。
 * @param impl 实现
 * @param owner 注册者
 * @param scope 所属作用域
 * @returns 条目对象
 */
export function makeEntry(impl, owner, scope) {
  return { impl, owner, scope }
}

/**
 * 定义 2.3.2 / 2.3.3：返回一个幂等的撤销函数，撤销时判断归属。
 * @param table 服务表
 * @param name 服务名
 * @param entry 本次注册写入的条目
 * @returns 撤销函数
 */
export function makeDisposer(table, name, entry) {
  let done = false
  return () => {
    if (done) return
    done = true
    const current = table.get(name)
    if (current && current.owner === entry.owner) table.delete(name)
  }
}

/**
 * 命题 2.3.1 的反面：按名字无条件删除。
 * @param table 服务表
 * @param name 服务名
 * @returns 撤销函数
 */
export function naiveDisposer(table, name) {
  let done = false
  return () => {
    if (done) return
    done = true
    table.delete(name)
  }
}

/**
 * 定义 2.3.4 / 命题 2.3.4：按注册次序的逆序执行撤销，并逐个捕获失败。
 * @param disposers 撤销函数数组（按注册次序）
 * @returns `{ succeeded, failures }`
 */
export function disposeAll(disposers) {
  const failures = []
  let succeeded = 0
  for (const d of [...disposers].reverse()) {
    try {
      d()
      succeeded++
    } catch (err) {
      failures.push(err)
    }
  }
  return { succeeded, failures }
}

/**
 * 定义 2.3.5：一个作用域——自己的表、一条父链、一批撤销函数。
 */
export class Scope {
  #parent = null
  #table = new Map()
  #disposers = []
  #name = 'root'

  /**
   * @param parent 父作用域，为空表示根
   * @param name 作用域名（用于错误信息）
   */
  constructor(parent = null, name = 'root') {
    this.#parent = parent
    this.#name = name
  }

  /** @returns 父作用域 */
  get parent() { return this.#parent }

  /** @returns 作用域名 */
  get name() { return this.#name }

  /** @returns 本作用域自己的服务表 */
  get table() { return this.#table }

  /** @returns 本作用域登记的注册数 */
  get registrations() { return this.#disposers.length }

  /**
   * 注册一个服务，返回它的撤销函数。
   * @param name 服务名
   * @param impl 实现
   * @param owner 归属对象（调用方传入，默认为本作用域）
   * @returns 撤销函数
   */
  provide(name, impl, owner = this) {
    const entry = makeEntry(impl, owner, this)
    this.#table.set(name, entry)
    const dispose = makeDisposer(this.#table, name, entry)
    this.#disposers.push(dispose)
    return dispose
  }

  /**
   * 沿父链查找服务。
   * @param name 服务名
   * @returns 实现；未找到时为 undefined
   */
  lookup(name) {
    let scope = this
    while (scope) {
      if (scope.#table.has(name)) return scope.#table.get(name).impl
      scope = scope.#parent
    }
    return undefined
  }

  /**
   * 对外查找：缺失时抛错，错误信息带上可见的名字清单。
   * @param name 服务名
   * @returns 实现
   * @throws 当服务不存在时
   */
  require(name) {
    const impl = this.lookup(name)
    if (impl === undefined) {
      const visible = this.visibleNames()
      throw new Error(`找不到服务 ${name}（作用域 ${this.#name} 可见：${visible.join(', ') || '无'}）`)
    }
    return impl
  }

  /** @returns 沿父链可见的全部服务名（按字典序） */
  visibleNames() {
    const names = new Set()
    let scope = this
    while (scope) {
      for (const n of scope.#table.keys()) names.add(n)
      scope = scope.#parent
    }
    return [...names].sort()
  }

  /**
   * 撤销本作用域的全部注册。
   * @returns `{ succeeded, failures }`
   */
  dispose() {
    return disposeAll(this.#disposers)
  }
}

/**
 * 命题 2.3.5：带计数的查找，用来验证查找代价与作用域深度成正比。
 * @param scope 起点作用域
 * @param name 服务名
 * @returns `{ impl, comparisons, scope }`
 */
export function lookupWithCount(scope, name) {
  let comparisons = 0
  let current = scope
  while (current) {
    comparisons++
    const entry = current.table.get(name)
    if (entry) return { impl: entry.impl, comparisons, scope: current.name }
    current = current.parent
  }
  return { impl: undefined, comparisons, scope: null }
}

/** 部件声明：注入的依赖写在声明里，定位器取的依赖只在执行时才知道。 */
export const PARTS = [
  { name: 'tools-plugin', injected: ['llm', 'logger'] },
  { name: 'guard-plugin', injected: ['tools'] },
  { name: 'session-plugin', injected: ['llm', 'tools'] },
  { name: 'locator-plugin', injected: [], located: ['config'] },
]

/**
 * 命题 2.3.6：静态可读的依赖边数。
 * @param parts 部件声明数组
 * @returns 注入声明的并集大小
 */
export function staticEdgeCount(parts) {
  return new Set(parts.flatMap((p) => p.injected ?? [])).size
}

/**
 * 命题 2.3.6：定位器取得的依赖在静态分析中能读出的边数。
 * @returns 恒为 0——依赖藏在函数体里，静态读不出来
 */
export function locatedEdgeCount() {
  return 0
}

/**
 * 归属账本：每个主人各留下多少条注册。
 * @param table 服务表
 * @returns `[[主人名, 条数]]`
 */
export function ownershipLedger(table, nameOf) {
  const ledger = new Map()
  for (const entry of table.values()) {
    const key = nameOf(entry.owner)
    ledger.set(key, (ledger.get(key) ?? 0) + 1)
  }
  return [...ledger.entries()].sort()
}

/** 记录 delete 调用次数的表，用于观察幂等撤销真正生效的次数。 */
export class CountingMap extends Map {
  /** @type {number} 累计的 delete 调用次数 */
  deletes = 0

  /**
   * @param key 键
   * @returns 是否真的删除了条目
   */
  delete(key) {
    this.deletes++
    return super.delete(key)
  }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('2.3 容器与依赖注入 · 算例（SA-27）')
  rows.push('')

  rows.push('[1] 覆盖与归属')
  const guarded = new Map()
  const a1 = { name: '部件 A' }
  const b1 = { name: '部件 B' }
  const e1 = makeEntry('A 的实现', a1, null)
  guarded.set('llm', e1)
  const dA1 = makeDisposer(guarded, 'llm', e1)
  const e2 = makeEntry('B 的实现', b1, null)
  guarded.set('llm', e2)
  const dB1 = makeDisposer(guarded, 'llm', e2)
  dA1()
  line('带归属撤销后表中条目数', `${guarded.size}（仍是后来者的）`)
  line('后来者仍能取到自己的服务', guarded.get('llm')?.impl === 'B 的实现')
  dB1()
  line('后来者撤销后条目数', guarded.size)

  const naive = new Map()
  const e3 = makeEntry('A 的实现', a1, null)
  naive.set('llm', e3)
  const nA = naiveDisposer(naive, 'llm')
  naive.set('llm', makeEntry('B 的实现', b1, null))
  nA()
  line('按名字撤销后表中条目数', `${naive.size}（缺陷：后来者的服务消失）`)
  rows.push('')

  rows.push('[2] 撤销次序与失败隔离')
  const order = []
  const three = [1, 2, 3].map((i) => () => order.push(i))
  const okResult = disposeAll(three)
  line('注册次序', '1, 2, 3')
  line('撤销次序', order.join(', '))
  line('全部成功时的失败数', okResult.failures.length)

  const order2 = []
  const mixed = [
    () => order2.push(1),
    () => { throw new Error('撤销失败') },
    () => order2.push(3),
  ]
  const mixedResult = disposeAll(mixed)
  line('失败隔离：本次撤销次序', order2.join(', '))
  line('失败隔离：成功数 / 总数', `${mixedResult.succeeded} / ${mixed.length}`)
  line('失败隔离：失败数', mixedResult.failures.length)
  rows.push('')

  rows.push('[3] 幂等与阶段')
  const table = new CountingMap()
  const entry = makeEntry('x', a1, null)
  table.set('svc', entry)
  const idem = makeDisposer(table, 'svc', entry)
  idem()
  idem()
  line('连续撤销两次的实际删除次数', table.deletes)
  line('撤销后条目数', table.size)
  line('阶段数量', PHASES.length)
  line('阶段列表', PHASES.join(' → '))
  rows.push('')

  rows.push('[4] 作用域')
  const root = new Scope(null, 'root')
  root.provide('llm', 'root 的模型层')
  const child = new Scope(root, 'child')
  child.provide('tools', 'child 的工具表')
  const sibling = new Scope(root, 'sibling')
  line('子作用域可见父作用域的服务', child.lookup('llm') === 'root 的模型层')
  line('父作用域看不到子作用域的服务', root.lookup('tools') === undefined)
  line('兄弟作用域互相不可见', sibling.lookup('tools') === undefined)
  line('子作用域的可见名字', child.visibleNames().join(', '))
  line('子作用域登记的注册数', child.registrations)

  const deep3 = new Scope(new Scope(new Scope(root, 's1'), 's2'), 's3')
  deep3.provide('only-here', 'x')
  deep3.parent.provide('mid', 'x')
  const hit2 = lookupWithCount(deep3, 'mid')
  line('深度 3 的链命中第 2 层的比较次数', hit2.comparisons)
  line('深度 3 的链命中自己的比较次数', lookupWithCount(deep3, 'only-here').comparisons)
  const miss = lookupWithCount(deep3, 'nope')
  line('深度 3 的链未命中的比较次数', miss.comparisons)
  let message = ''
  try { deep3.require('nope') } catch (err) { message = err.message }
  line('查找失败的错误信息含可见名字', message.includes('only-here'))
  const childResult = child.dispose()
  line('子作用域退出后成功撤销数', childResult.succeeded)
  line('父作用域的服务仍在', root.lookup('llm') === 'root 的模型层')
  rows.push('')

  rows.push('[5] 依赖可读性')
  line('注入声明的静态可读边数', staticEdgeCount(PARTS))
  line('定位器取得的依赖静态可读边数', locatedEdgeCount())
  line('部件数', PARTS.length)
  row5Ownership()
  function row5Ownership() {
    const t = new Map()
    t.set('a', makeEntry(1, a1, null))
    t.set('b', makeEntry(2, b1, null))
    t.set('c', makeEntry(3, a1, null))
    line('归属账本', JSON.stringify(ownershipLedger(t, (o) => o.name)))
  }

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
