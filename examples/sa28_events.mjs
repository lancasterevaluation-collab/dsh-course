// 2.4 事件与扩展点的算例。
// 每个导出函数或类方法对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/**
 * 定义 2.4.2 / 命题 2.4.5：一条监听器带优先级、注册序号与归属。
 *
 * 执行次序由 (priority, seq) 按字典序决定，因此同优先级内保持注册顺序。
 */
export class EventBus {
  #listeners = new Map()
  #seq = 0
  #calls = []

  /** @returns 被记录下来的调用序列（事件名） */
  get calls() { return [...this.#calls] }

  /** 清空调用记录。@returns 无 */
  clearCalls() { this.#calls = [] }

  /**
   * 注册一个监听器。
   * @param name 事件名
   * @param fn 监听器实现
   * @param priority 优先级，数值大的先执行
   * @param owner 归属对象
   * @returns 撤销函数
   */
  on(name, fn, priority = 0, owner = null) {
    const list = this.#listeners.get(name) ?? []
    const entry = { fn, priority, seq: this.#seq++, owner }
    list.push(entry)
    // 稳定排序：优先级数值大的先执行，同优先级按注册序号
    list.sort((a, b) => b.priority - a.priority || a.seq - b.seq)
    this.#listeners.set(name, list)
    return () => {
      const cur = this.#listeners.get(name) ?? []
      this.#listeners.set(name, cur.filter((e) => e !== entry))
    }
  }

  /**
   * 当前某个事件的监听器（按执行次序）。
   * @param name 事件名
   * @returns 监听器条目数组
   */
  listeners(name) {
    return [...(this.#listeners.get(name) ?? [])]
  }

  /**
   * 定义 2.4.1：广播——顺序调用全部监听器，忽略返回值。
   * @param name 事件名
   * @param payload 载荷
   * @returns 被调用的监听器个数
   */
  async emit(name, payload) {
    let count = 0
    for (const entry of [...(this.#listeners.get(name) ?? [])]) {
      this.#calls.push(name)
      await entry.fn(payload)
      count++
    }
    return count
  }

  /**
   * 定义 2.4.3 / 命题 2.4.3：瀑布——逐层传值，短路按「是否调用过 next」判定。
   * @param name 事件名
   * @param value 初始值
   * @returns `{ value, stoppedAt, completed }`，stoppedAt 为短路处的下标
   */
  async waterfall(name, value) {
    let acc = value
    const list = [...(this.#listeners.get(name) ?? [])]
    for (const [i, entry] of list.entries()) {
      let advanced = false
      this.#calls.push(name)
      acc = await entry.fn(acc, (next) => { advanced = true; return next })
      if (!advanced) return { value: acc, stoppedAt: i, completed: false }
    }
    return { value: acc, stoppedAt: -1, completed: true }
  }

  /**
   * 命题 2.4.5：按归属摘除监听器。
   * @param owner 归属对象
   * @returns 被摘除的监听器个数
   */
  offOwner(owner) {
    let removed = 0
    for (const [name, list] of this.#listeners) {
      const kept = list.filter((e) => e.owner !== owner)
      removed += list.length - kept.length
      this.#listeners.set(name, kept)
    }
    return removed
  }
}

/**
 * 定义 2.4.5：可忽略性由派生结果的不变性判定。
 * @param event 待判定的事件
 * @param derive 从日志派生结果的纯函数
 * @returns 跳过该事件是否不改变派生结果
 */
export function isIgnorable(event, derive) {
  return JSON.stringify(derive([event])) === JSON.stringify(derive([]))
}

/**
 * 定义 2.4.6：载荷里不属于稳定字段的部分。
 * @param payload 载荷
 * @param stableFields 稳定字段白名单
 * @returns 不稳定字段名数组
 */
export function unstableFields(payload, stableFields) {
  return Object.keys(payload).filter((k) => !stableFields.includes(k))
}

/**
 * 命题 2.4.1 的成本口径：广播的总调用次数。
 * @param listenerCount 监听器数量
 * @param broadcastCount 广播次数
 * @returns 总调用次数
 */
export function broadcastCost(listenerCount, broadcastCount) {
  return listenerCount * broadcastCount
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export async function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('2.4 事件与扩展点 · 算例（SA-28）')
  rows.push('')

  rows.push('[1] 广播与 waterfall')
  const bus = new EventBus()
  const seen = []
  bus.on('notice', (p) => { seen.push('a') })
  bus.on('notice', (p) => { seen.push('b') })
  bus.on('notice', (p) => { seen.push('c') })
  const emitted = await bus.emit('notice', { id: 1 })
  line('广播的调用次数', emitted)
  line('广播的监听器都收到同一个载荷', seen.length === 3)

  const chain = new EventBus()
  chain.on('rewrite', async (v, next) => next(v.toUpperCase()))
  chain.on('rewrite', async (v, next) => next(v + '!'))
  const wf = await chain.waterfall('rewrite', 'hi')
  line('waterfall 的终值', wf.value)
  line('waterfall 是否走完', wf.completed)
  rows.push('')

  rows.push('[2] 短路')
  const sc = new EventBus()
  const executed = []
  sc.on('r', async (v, next) => { executed.push(1); return next(v + '1') })
  sc.on('r', async () => { executed.push(2); return '被短路' })
  sc.on('r', async (v, next) => { executed.push(3); return next(v + '3') })
  const short = await sc.waterfall('r', '')
  line('链在第几个监听器处短路', short.stoppedAt)
  line('短路后未执行的监听器数', 3 - executed.length)
  line('短路时的值', short.value)

  const passthrough = new EventBus()
  passthrough.on('p', async (v, next) => next(v))
  passthrough.on('p', async (v, next) => next(v + '!'))
  const pt = await passthrough.waterfall('p', 'x')
  line('原样传回是否被判为短路', !pt.completed)
  line('原样传回后的终值', pt.value)
  rows.push('')

  rows.push('[3] 顺序')
  const prio = new EventBus()
  const order = []
  prio.on('o', () => { order.push('低') }, 10)
  prio.on('o', () => { order.push('高') }, 30)
  prio.on('o', () => { order.push('中') }, 20)
  await prio.emit('o', null)
  line('执行次序（优先级从大到小）', order.join(', '))

  const stable = new EventBus()
  const stab = []
  stable.on('s', () => { stab.push('先注册') }, 5)
  stable.on('s', () => { stab.push('后注册') }, 5)
  await stable.emit('s', null)
  line('同优先级保持注册顺序', stab.join(' → '))
  rows.push('')

  rows.push('[4] 归属与撤销')
  const owned = new EventBus()
  const ownerA = { name: '部件 A' }
  const ownerB = { name: '部件 B' }
  owned.on('e', () => {}, 0, ownerA)
  owned.on('e', () => {}, 0, ownerA)
  owned.on('e', () => {}, 0, ownerB)
  const removed = owned.offOwner(ownerA)
  line('退出一个归属后摘掉的监听器数', removed)
  line('退出后原归属的监听器数', owned.listeners('e').filter((e) => e.owner === ownerA).length)
  line('另一个归属的监听器数', owned.listeners('e').filter((e) => e.owner === ownerB).length)
  const single = owned.on('f', () => {}, 0, ownerB)
  single()
  line('撤销再撤销后的监听器数', owned.listeners('f').filter((e) => e.owner === ownerB).length)
  rows.push('')

  rows.push('[5] 可忽略与载荷')
  const derive = (log) => log
    .filter((e) => e.type !== 'usage')
    .map((e) => (e.type === 'compact' ? '<摘要>' : e.text))
    .join('|')
  line('统计事件是否可忽略', isIgnorable({ type: 'usage', tokens: 10 }, derive))
  line('压缩点事件是否可忽略', isIgnorable({ type: 'compact', from: 3 }, derive))
  line('两个可忽略事件一起删除仍等价', derive([{ type: 'usage', tokens: 1 }, { type: 'usage', tokens: 2 }]) === derive([]))
  line('不稳定字段', unstableFields({ path: 'a.md', retryCount: 2 }, ['path']).join(', '))
  line('全部字段稳定时的不稳定字段数', unstableFields({ path: 'a.md' }, ['path']).length)
  rows.push('')

  rows.push('[6] 广播成本')
  line('10 个监听器 × 5 次广播', broadcastCost(10, 5))
  line('20 个监听器 × 5 次广播', broadcastCost(20, 5))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
