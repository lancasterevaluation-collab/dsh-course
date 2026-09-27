// 2.3 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  PHASES, makeEntry, makeDisposer, naiveDisposer, disposeAll, Scope,
  lookupWithCount, staticEdgeCount, locatedEdgeCount, ownershipLedger, PARTS, CountingMap,
} from './sa27_container.mjs'

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
const throws = (fn, label) => {
  try { fn() } catch { pass++; return }
  fail++
  console.log(`不通过：${label} —— 未抛错`)
}

// 定义 2.3.6：阶段
eq(PHASES.length, 5, '生命周期有五个阶段')
eq(PHASES[0], 'before-register', '首阶段是注册前')
eq(PHASES[4], 'disposed', '末阶段是卸载后')
ok(PHASES.indexOf('registered') < PHASES.indexOf('ready'), '已注册排在可用之前')

// 定义 2.3.1：条目
const ownerA = { name: '部件 A' }
const ownerB = { name: '部件 B' }
const entry = makeEntry('实现', ownerA, null)
eq(entry.impl, '实现', '条目带实现')
eq(entry.owner, ownerA, '条目带主人')
eq(entry.scope, null, '条目带作用域')

// 定义 2.3.2 / 命题 2.3.2：归属保护
const guarded = new Map()
const eA = makeEntry('A', ownerA, null)
guarded.set('llm', eA)
const disposeA = makeDisposer(guarded, 'llm', eA)
eq(guarded.size, 1, '注册后表中有条目')
const eB = makeEntry('B', ownerB, null)
guarded.set('llm', eB)
disposeA()
eq(guarded.size, 1, '覆盖后撤销旧条目，表仍有一条')
eq(guarded.get('llm').impl, 'B', '后来者的实现未被误删')
const disposeB = makeDisposer(guarded, 'llm', eB)
disposeB()
eq(guarded.size, 0, '后来者撤销后表为空')

// 命题 2.3.1：反例
const naive = new Map()
const nA = makeEntry('A', ownerA, null)
naive.set('llm', nA)
const naiveDispose = naiveDisposer(naive, 'llm')
naive.set('llm', makeEntry('B', ownerB, null))
naiveDispose()
eq(naive.size, 0, '按名字撤销删掉了后来者的条目（缺陷）')

// 定义 2.3.3 / 命题 2.3.4：幂等
const idem = new CountingMap()
const eIdem = makeEntry('x', ownerA, null)
idem.set('svc', eIdem)
const idemDispose = makeDisposer(idem, 'svc', eIdem)
idemDispose()
idemDispose()
idemDispose()
eq(idem.deletes, 1, '连续撤销三次只有一次真正删除')
eq(idem.size, 0, '撤销第一次之后条目已删除')
ok(makeDisposer(idem, 'svc', eIdem)() === undefined, '重复撤销不抛错且无返回值')

// 定义 2.3.4 / 命题 2.3.3：逆序
const order = []
const three = [1, 2, 3].map((i) => () => order.push(i))
const r = disposeAll(three)
eq(order, [3, 2, 1], '撤销按注册的逆序执行')
eq(r.succeeded, 3, '三个全部成功')
eq(r.failures.length, 0, '没有失败项')

// 失败隔离
const order2 = []
const mixed = [
  () => order2.push(1),
  () => { throw new Error('撤销失败') },
  () => order2.push(3),
]
const r2 = disposeAll(mixed)
eq(order2, [3, 1], '抛错的撤销被跳过，其余仍按逆序执行')
eq(r2.succeeded, 2, '失败隔离后成功两个')
eq(r2.failures.length, 1, '失败项被记录')
ok(r2.failures[0] instanceof Error, '失败项是原始错误')
eq(disposeAll([]).succeeded, 0, '空撤销列表的成功数为零')
eq(disposeAll([]).failures.length, 0, '空撤销列表没有失败')

// 定义 2.3.5：作用域
const root = new Scope(null, 'root')
root.provide('llm', 'root.llm')
root.provide('logger', 'root.logger')
const child = new Scope(root, 'child')
child.provide('tools', 'child.tools')
const sibling = new Scope(root, 'sibling')
eq(root.parent, null, '根作用域没有父')
eq(child.parent, root, '子作用域指向父')
eq(child.name, 'child', '作用域名可读')
eq(child.lookup('llm'), 'root.llm', '子作用域可见父作用域的服务')
eq(child.lookup('tools'), 'child.tools', '子作用域可见自己的服务')
eq(root.lookup('tools'), undefined, '父作用域看不到子作用域的服务')
eq(sibling.lookup('tools'), undefined, '兄弟作用域互相不可见')
eq(sibling.lookup('llm'), 'root.llm', '兄弟作用域都能看到父作用域的服务')
eq(child.visibleNames(), ['llm', 'logger', 'tools'], '可见名字按字典序')
eq(root.visibleNames(), ['llm', 'logger'], '根的可见名字')
eq(child.registrations, 1, '子作用域登记了一条')
eq(root.registrations, 2, '根作用域登记了两条')
eq(child.require('llm'), 'root.llm', 'require 沿父链取到服务')
let message = ''
try { child.require('nope') } catch (err) { message = err.message }
ok(message.includes('nope'), '查找失败的错误信息含服务名')
ok(message.includes('child'), '查找失败的错误信息含作用域名')
ok(message.includes('tools'), '查找失败的错误信息含可见名字')

// 覆盖与撤销的作用域行为
const over = new Scope(null, 'over')
const off1 = over.provide('svc', 'first', ownerA)
const off2 = over.provide('svc', 'second', ownerB)
eq(over.lookup('svc'), 'second', '同作用域内后者覆盖前者')
off1()
eq(over.lookup('svc'), 'second', '撤销被覆盖的那条不影响当前条目')
off2()
eq(over.lookup('svc'), undefined, '撤销当前条目后查找失败')
throws(() => over.require('svc'), '已撤销的服务 require 抛错')

// 子作用域退出不影响父作用域
const p = new Scope(null, 'p')
p.provide('keep', 'keep')
const c = new Scope(p, 'c')
c.provide('temp', 'temp')
const cResult = c.dispose()
eq(cResult.succeeded, 1, '子作用域退出撤销了自己的注册')
eq(c.lookup('temp'), undefined, '子作用域的服务已撤销')
eq(p.lookup('keep'), 'keep', '父作用域的服务不受影响')

// 命题 2.3.5：查找代价
const s1 = new Scope(root, 's1')
const s2 = new Scope(s1, 's2')
const s3 = new Scope(s2, 's3')
s3.provide('only-here', 'x')
const hit = lookupWithCount(s3, 'only-here')
eq(hit.comparisons, 1, '自己作用域命中只比较一次')
eq(hit.scope, 's3', '命中的作用域是自己')
const rootHit = lookupWithCount(s3, 'llm')
eq(rootHit.comparisons, 4, '深度 3 的链命中根时比较四次')
const miss = lookupWithCount(s3, 'nope')
eq(miss.comparisons, 4, '深度 3 的链未命中比较四次')
eq(miss.impl, undefined, '未命中时返回 undefined')

// 由父链深度决定的比较次数：在共享父作用域上注册后，从深层命中的次数
const deepRoot = new Scope(null, 'deepRoot')
deepRoot.provide('base', 'base')
const d1 = new Scope(deepRoot, 'd1')
const d2 = new Scope(d1, 'd2')
const d3 = new Scope(d2, 'd3')
eq(lookupWithCount(d3, 'base').comparisons, 4, '从深度 3 命中根需要比较四次')
eq(lookupWithCount(d2, 'base').comparisons, 3, '从深度 2 命中根需要比较三次')
eq(lookupWithCount(d1, 'base').comparisons, 2, '从深度 1 命中根需要比较两次')
eq(lookupWithCount(deepRoot, 'base').comparisons, 1, '根自己命中只比较一次')

// 命题 2.3.6：依赖可读性
eq(staticEdgeCount(PARTS), 3, '注入声明的静态可读边数为 3')
eq(locatedEdgeCount(), 0, '定位器取得的依赖静态可读边数为 0')
eq(PARTS.length, 4, '算例里有四个部件')
eq(staticEdgeCount([]), 0, '没有部件时边数为零')
eq(staticEdgeCount([{ name: 'x', injected: ['a', 'a'] }]), 1, '重复声明的依赖只算一条边')

// 归属账本
const ledgerTable = new Map()
ledgerTable.set('a', makeEntry(1, ownerA, null))
ledgerTable.set('b', makeEntry(2, ownerB, null))
ledgerTable.set('c', makeEntry(3, ownerA, null))
eq(ownershipLedger(ledgerTable, (o) => o.name), [['部件 A', 2], ['部件 B', 1]], '归属账本按主人计数')
eq(ownershipLedger(new Map(), (o) => o.name), [], '空表没有归属记录')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
