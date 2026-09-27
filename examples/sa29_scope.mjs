// 2.5 作用域与隔离的算例。
// 每个导出函数或类方法对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/** 定义 2.5.4：作用范围到层级名的映射。 */
export const PLACEMENT_RULES = [
  { extent: 'global', layer: 'root', example: '代码版本、启动时间、资源池' },
  { extent: 'session', layer: 'session', example: '会话历史、工作目录' },
  { extent: 'task', layer: 'task', example: '本次任务的临时状态' },
]

/**
 * 定义 2.5.4：作用范围对应的层级名。
 * @param extent 作用范围（global / session / task）
 * @returns 层级名；未知范围返回 null
 */
export function layerOf(extent) {
  return PLACEMENT_RULES.find((r) => r.extent === extent)?.layer ?? null
}

/**
 * 定义 2.5.4：找出被放错层级的状态。
 * @param states 形如 `{ name, extent, placed }` 的状态清单
 * @returns 放错的状态名数组
 */
export function misplacedStates(states) {
  return states.filter((s) => layerOf(s.extent) !== s.placed).map((s) => s.name)
}

/**
 * 定义 2.5.1 / 2.5.2 / 2.5.5：一个作用域。
 *
 * 它带身份、父引用、子集合、注册表与 effect 列表。
 */
export class Scope {
  #id = {}
  #parent = null
  #children = new Set()
  #entries = new Map()
  #effects = []
  #marks = new Set()
  #name = 'root'

  /**
   * @param parent 父作用域，为空表示根
   * @param name 作用域名（用于诊断与次序记录）
   */
  constructor(parent = null, name = 'root') {
    this.#parent = parent
    this.#name = name
    if (parent) parent.#children.add(this)
  }

  /** @returns 身份标识（归属判断的依据） */
  get id() { return this.#id }

  /** @returns 父作用域 */
  get parent() { return this.#parent }

  /** @returns 作用域名 */
  get name() { return this.#name }

  /** @returns 子作用域数组 */
  get children() { return [...this.#children] }

  /** @returns 本层的注册表 */
  get entries() { return this.#entries }

  /** @returns 本层登记的 effect 数 */
  get registrations() { return this.#effects.length }

  /**
   * 注册一个服务。
   * @param name 服务名
   * @param impl 实现
   * @returns 撤销函数
   */
  provide(name, impl) {
    const entry = { impl, owner: this, scope: this }
    this.#entries.set(name, entry)
    const undo = () => {
      const cur = this.#entries.get(name)
      if (cur && cur.owner === entry.owner) this.#entries.delete(name)
    }
    this.#effects.push(undo)
    return undo
  }

  /**
   * 登记一个可撤销副作用。
   * @param undo 撤销函数
   * @returns 无
   */
  effect(undo) { this.#effects.push(undo) }

  /**
   * 定义 2.5.3：给某个名字加隔离标记。
   * @param name 服务名
   * @returns 无
   */
  mark(name) { this.#marks.add(name) }

  /**
   * 定义 2.5.2 / 2.5.3：沿父链查找。
   * @param name 服务名
   * @returns `{ impl, layer, visited, stopped }`
   */
  lookup(name) {
    const visited = []
    let cur = this
    while (cur) {
      if (cur.#entries.has(name)) {
        return { impl: cur.#entries.get(name).impl, layer: cur.#name, visited: visited.length + 1, stopped: false }
      }
      visited.push(cur.#name)
      if (cur.#marks.has(name)) return { impl: undefined, layer: null, visited: visited.length, stopped: true }
      cur = cur.#parent
    }
    return { impl: undefined, layer: null, visited: visited.length, stopped: false }
  }

  /** @returns 沿父链可见的全部服务名（按字典序） */
  visibleNames() {
    const names = new Set()
    let cur = this
    while (cur) {
      for (const n of cur.#entries.keys()) names.add(n)
      cur = cur.#parent
    }
    return [...names].sort()
  }

  /**
   * 定义 2.5.5：先子后父，同层逆序，失败汇总。
   * @returns `{ order, failures }`
   */
  dispose() {
    const failures = []
    const order = []
    for (const child of [...this.#children].reverse()) {
      const r = child.dispose()
      failures.push(...r.failures)
      order.push(...r.order)
    }
    for (const undo of [...this.#effects].reverse()) {
      try { undo() } catch (err) { failures.push(err) }
    }
    order.push(this.#name)
    this.#children.clear()
    return { order, failures }
  }
}

/**
 * 命题 2.5.1：两个作用域可见集合的交集大小。
 * @param a 作用域
 * @param b 作用域
 * @returns 交集里的名字（按字典序）
 */
export function visibleIntersection(a, b) {
  const setB = new Set(b.visibleNames())
  return a.visibleNames().filter((n) => setB.has(n))
}

/**
 * 命题 2.5.6：约定隔离的边界——直接引用全局对象的模块。
 * @returns `{ one, two, leaked }`，leaked 表示第一次读取的值被后来的写入改变
 */
export function leakDemo() {
  const globalState = { cwd: '/tmp' }
  // 两个会话各自建了一个对象，而它们构造时捕获了同一个引用
  const makeTool = () => ({ read: () => globalState.cwd })
  const toolA = makeTool()
  const toolB = makeTool()
  globalState.cwd = '/proj/one'
  const one = toolA.read()
  globalState.cwd = '/proj/two'
  const two = toolB.read()
  const oneAgain = toolA.read()
  return { one, two, oneAgain, leaked: oneAgain !== one }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('2.5 作用域与隔离 · 算例（SA-29）')
  rows.push('')

  rows.push('[1] 可见性与覆盖')
  const root = new Scope(null, 'root')
  root.provide('config', 'root.config')
  root.provide('pool', 'root.pool')
  root.provide('core-tools', 'root.tools')
  root.provide('version', 'root.version')
  const sessionA = new Scope(root, 'sessionA')
  sessionA.provide('history-a', 'A.history')
  sessionA.provide('cwd-a', 'A.cwd')
  const sessionB = new Scope(root, 'sessionB')
  sessionB.provide('history-b', 'B.history')
  sessionB.provide('cwd-b', 'B.cwd')
  line('根的可见名字数', root.visibleNames().length)
  line('会话 A 的可见名字数', sessionA.visibleNames().length)
  line('会话 B 的可见名字数', sessionB.visibleNames().length)
  line('两者可见集合的交集大小', visibleIntersection(sessionA, sessionB).length)
  line('会话 A 看不到 B 的注册', sessionA.lookup('history-b').impl === undefined)
  line('会话 B 看不到 A 的注册', sessionB.lookup('history-a').impl === undefined)

  const over = new Scope(root, 'over')
  over.provide('config', 'over.config')
  line('子作用域覆盖父作用域的同名服务', over.lookup('config').impl === 'over.config')
  line('覆盖后命中的层级', over.lookup('config').layer)
  rows.push('')

  rows.push('[2] 隔离标记')
  root.provide('session-log', 'root.log')
  sessionA.mark('session-log')
  const blocked = sessionA.lookup('session-log')
  line('被标记名字在子作用域的查找', `${blocked.impl === undefined ? '失败' : '命中'}（${blocked.stopped ? '因标记停止' : '未停止'}）`)
  line('被标记名字的查找访问层数', blocked.visited)
  line('被标记名字在父作用域仍可查得', root.lookup('session-log').impl === 'root.log')
  sessionA.provide('session-log', 'A.log')
  line('子作用域自己注册后被标记名字的可见性', `${sessionA.lookup('session-log').impl === 'A.log' ? '可见' : '不可见'}`)
  rows.push('')

  rows.push('[3] 退出顺序')
  const r0 = new Scope(null, 'root')
  const s1 = new Scope(r0, 'session')
  const t1 = new Scope(s1, 'task')
  r0.provide('a', 1)
  s1.provide('b', 2)
  t1.provide('c', 3)
  const disposed = r0.dispose()
  line('退出次序（子先于父）', disposed.order.join(', '))
  line('退出后的失败数', disposed.failures.length)
  line('退出后根作用域的服务不再可见', r0.lookup('a').impl === undefined)

  const same = new Scope(null, 'same')
  const inner = []
  same.effect(() => inner.push(1))
  same.effect(() => inner.push(2))
  same.effect(() => inner.push(3))
  same.dispose()
  line('同一作用域内按注册逆序', inner.join(', '))

  const failing = new Scope(null, 'failing')
  failing.effect(() => { throw new Error('撤销失败') })
  failing.effect(() => {})
  failing.effect(() => {})
  const fr = failing.dispose()
  line('某个撤销抛错后其余仍然执行', `${3 - fr.failures.length} / 3`)
  rows.push('')

  rows.push('[4] 查找代价与放置')
  const deep = new Scope(new Scope(new Scope(null, 'l0'), 'l1'), 'l2')
  deep.provide('only-here', 'x')
  line('深度 2 的链命中自己的比较次数', deep.lookup('only-here').visited)
  line('深度 2 的链未命中时的比较次数', deep.lookup('nope').visited)
  const states = [
    { name: '代码版本', extent: 'global', placed: 'root' },
    { name: '会话历史', extent: 'session', placed: 'session' },
    { name: '任务临时状态', extent: 'task', placed: 'task' },
    { name: '工作目录', extent: 'session', placed: 'root' },
    { name: '连接池', extent: 'global', placed: 'session' },
  ]
  line('作用范围对应的层级', layerOf('session'))
  line('放错层级的状态', misplacedStates(states).join(', '))
  rows.push('')

  rows.push('[5] 复用与泄漏')
  const reused = new Scope(null, 'reused')
  const off1 = reused.provide('svc', '第一次装载')
  const off2 = reused.provide('svc', '第二次装载')
  off1()
  line('同身份两次装载后撤销一次，剩余条目数', reused.entries.size)
  void off2
  const leak = leakDemo()
  line('泄漏演示：会话 A 第一次读取', leak.one)
  line('泄漏演示：会话 B 写入后 A 再读', leak.oneAgain)
  line('泄漏演示：A 观察到了 B 的写入', leak.leaked)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
