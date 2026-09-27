// 2.4 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  EventBus, isIgnorable, unstableFields, broadcastCost,
} from './sa28_events.mjs'

let pass = 0
let fail = 0
const near = (a, b, tol, label) => {
  if (Math.abs(a - b) <= tol) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${a}，期望 ${b}`)
}
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}`)
}
const ok = (c, label) => {
  if (c) { pass++; return }
  fail++
  console.log(`不通过：${label}`)
}

// 定义 2.4.1：广播
{
  const bus = new EventBus()
  const seen = []
  bus.on('n', (p) => { seen.push(p.id) })
  bus.on('n', (p) => { seen.push(p.id) })
  bus.on('n', (p) => { seen.push(p.id) })
  const count = await bus.emit('n', { id: 7 })
  eq(count, 3, '广播返回被调用的监听器个数')
  eq(seen, [7, 7, 7], '每个监听器收到同一个载荷')
  eq(bus.calls.length, 3, '调用被记录')
  eq(await bus.emit('none', null), 0, '没有监听器时广播返回零')
}
{
  const bus = new EventBus()
  const order = []
  bus.on('n', () => { order.push(1); return '忽略我' })
  bus.on('n', () => { order.push(2) })
  await bus.emit('n', null)
  eq(order, [1, 2], '广播忽略返回值，不改变后续执行')
}

// 定义 2.4.3：瀑布与短路
{
  const bus = new EventBus()
  bus.on('r', async (v, next) => next(v.toUpperCase()))
  bus.on('r', async (v, next) => next(v + '!'))
  const r = await bus.waterfall('r', 'hi')
  eq(r.value, 'HI!', '瀑布逐层传递改写后的值')
  eq(r.completed, true, '全部监听器都放行时链走完')
  eq(r.stoppedAt, -1, '走完时短路位置为 -1')
}
{
  const bus = new EventBus()
  const executed = []
  bus.on('r', async (v, next) => { executed.push(1); return next(v + '1') })
  bus.on('r', async () => { executed.push(2); return '被短路' })
  bus.on('r', async (v, next) => { executed.push(3); return next(v + '3') })
  const r = await bus.waterfall('r', '')
  eq(r.stoppedAt, 1, '短路发生在第二个监听器')
  eq(r.completed, false, '短路时链未走完')
  eq(executed, [1, 2], '短路后的监听器未执行')
  eq(3 - executed.length, 1, '短路后未执行的监听器数为 1')
  eq(r.value, '被短路', '短路时调用方拿到中断处的值')
}

// 命题 2.4.3：原样传回不算短路
{
  const bus = new EventBus()
  bus.on('p', async (v, next) => next(v))
  bus.on('p', async (v, next) => next(v + '!'))
  const r = await bus.waterfall('p', 'x')
  eq(r.completed, true, '原样传回不被判为短路')
  eq(r.value, 'x!', '原样传回后链继续')
}
{
  const bus = new EventBus()
  bus.on('p', async (v, next) => next(v))
  const r = await bus.waterfall('p', 42)
  eq(r.value, 42, '原样传回相同值也不算短路')
}

// 定义 2.4.2：顺序
{
  const bus = new EventBus()
  const order = []
  bus.on('o', () => { order.push('低') }, 10)
  bus.on('o', () => { order.push('高') }, 30)
  bus.on('o', () => { order.push('中') }, 20)
  await bus.emit('o', null)
  eq(order, ['高', '中', '低'], '执行次序按优先级从大到小')
  eq(bus.listeners('o').map((e) => e.priority), [30, 20, 10], '监听器清单已按优先级排序')
}
{
  const bus = new EventBus()
  const order = []
  bus.on('s', () => { order.push(1) }, 5)
  bus.on('s', () => { order.push(2) }, 5)
  bus.on('s', () => { order.push(3) }, 5)
  await bus.emit('s', null)
  eq(order, [1, 2, 3], '同优先级保持注册顺序')
}
{
  const bus = new EventBus()
  const order = []
  bus.on('m', () => { order.push('先低') }, 1)
  bus.on('m', () => { order.push('后高') }, 2)
  await bus.emit('m', null)
  eq(order, ['后高', '先低'], '优先级压过注册顺序')
}

// 命题 2.4.5：归属与撤销
{
  const bus = new EventBus()
  const ownerA = { name: 'A' }
  const ownerB = { name: 'B' }
  bus.on('e', () => {}, 0, ownerA)
  bus.on('e', () => {}, 0, ownerA)
  bus.on('e', () => {}, 0, ownerB)
  eq(bus.listeners('e').length, 3, '三个监听器已注册')
  const removed = bus.offOwner(ownerA)
  eq(removed, 2, '按归属摘除两个监听器')
  eq(bus.listeners('e').filter((e) => e.owner === ownerA).length, 0, '原归属的监听器清零')
  eq(bus.listeners('e').filter((e) => e.owner === ownerB).length, 1, '另一个归属的监听器保留')
}
{
  const bus = new EventBus()
  const owner = { name: 'A' }
  const off = bus.on('f', () => {}, 0, owner)
  off()
  eq(bus.listeners('f').length, 0, '撤销函数摘掉自己的监听器')
  off()
  eq(bus.listeners('f').length, 0, '重复撤销不报错')
}
{
  const bus = new EventBus()
  const seen = []
  const off = bus.on('g', () => { seen.push(1) })
  await bus.emit('g', null)
  off()
  await bus.emit('g', null)
  eq(seen.length, 1, '撤销之后不再被调用')
}
{
  const bus = new EventBus()
  const seen = []
  bus.on('h', () => { seen.push(1) })
  bus.on('h', () => { seen.push(2) })
  const off = bus.on('h', () => { seen.push(3) })
  await bus.emit('h', null)
  eq(seen.length, 3, '注册几个就调用几次')
  off()
  const seen2 = []
  const bus2Empty = seen.length
  await bus.emit('h', null)
  eq(seen.length, bus2Empty + 2, '撤销一个之后只剩两个被调用')
  void seen2
}
{
  const bus = new EventBus()
  bus.on('i', () => {}, 0, { name: 'X' })
  const off = bus.on('i', () => {}, 0, { name: 'X' })
  eq(bus.listeners('i').length, 2, '同一名字下两个不同归属')
  off()
  eq(bus.listeners('i').length, 1, '撤销只摘掉自己那一条')
}

// 定义 2.4.5：可忽略性
{
  const derive = (log) => log
    .filter((e) => e.type !== 'usage')
    .map((e) => (e.type === 'compact' ? '<摘要>' : e.text))
    .join('|')
  eq(isIgnorable({ type: 'usage', tokens: 10 }, derive), true, '统计事件可忽略')
  eq(isIgnorable({ type: 'compact', from: 3 }, derive), false, '压缩点事件不可忽略')
  eq(derive([{ type: 'usage', tokens: 1 }, { type: 'usage', tokens: 2 }]), derive([]), '两个可忽略事件一起删除仍等价')
  eq(derive([{ type: 'compact' }]), '<摘要>', '压缩点改变派生结果')
}
{
  const derive = (log) => log.map((e) => e.text).join('|')
  eq(isIgnorable({ type: 'note', text: 'a' }, derive), false, '普通事件也会改变派生结果')
  eq(isIgnorable({ type: 'skip', text: '' }, derive), true, '空文本事件不影响派生结果')
}

// 定义 2.4.6：载荷稳定字段
eq(unstableFields({ path: 'a.md', retryCount: 2 }, ['path']), ['retryCount'], '临时计数不是稳定字段')
eq(unstableFields({ path: 'a.md' }, ['path']), [], '只有稳定字段时无违规')
eq(unstableFields({}, ['path']), [], '空载荷无违规')
eq(unstableFields({ a: 1, b: 2 }, ['a', 'b']), [], '全部字段都在白名单里')
eq(unstableFields({ a: 1, b: 2, c: 3 }, ['a']).length, 2, '多个临时字段全部列出')

// 命题 2.4.1 的成本口径
eq(broadcastCost(10, 5), 50, '10 个监听器 5 次广播共 50 次调用')
eq(broadcastCost(3, 1), 3, '一次广播的调用次数等于监听器数')
eq(broadcastCost(0, 100), 0, '没有监听器则没有调用')
ok(broadcastCost(10, 5) < broadcastCost(20, 5), '监听器翻倍使成本翻倍')
near(broadcastCost(10, 5) / broadcastCost(10, 1), 5, 1e-9, '广播次数与成本成正比')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
