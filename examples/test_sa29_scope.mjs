// 2.5 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  Scope, PLACEMENT_RULES, layerOf, misplacedStates, visibleIntersection, leakDemo,
} from './sa29_scope.mjs'

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

// 定义 2.5.1：作用域的形状
{
  const root = new Scope(null, 'root')
  const child = new Scope(root, 'child')
  eq(root.parent, null, '根作用域没有父')
  eq(child.parent, root, '子作用域指向父')
  eq(root.children.length, 1, '父作用域记录了子作用域')
  eq(child.children.length, 0, '新作用域没有子')
  eq(child.name, 'child', '作用域名可读')
  ok(typeof root.id === 'object', '身份是一个对象')
  ok(root.id !== child.id, '不同作用域的身份不同')
}

// 定义 2.5.2 / 命题 2.5.1 / 2.5.2：可见性与覆盖
{
  const root = new Scope(null, 'root')
  root.provide('config', 'root.config')
  root.provide('pool', 'root.pool')
  root.provide('core-tools', 'root.tools')
  root.provide('version', 'root.version')
  const a = new Scope(root, 'A')
  a.provide('history-a', 'A.history')
  a.provide('cwd-a', 'A.cwd')
  const b = new Scope(root, 'B')
  b.provide('history-b', 'B.history')
  b.provide('cwd-b', 'B.cwd')
  eq(root.visibleNames().length, 4, '根作用域可见 4 项')
  eq(a.visibleNames().length, 6, '会话 A 可见 6 项')
  eq(b.visibleNames().length, 6, '会话 B 可见 6 项')
  eq(visibleIntersection(a, b).length, 4, '两个会话可见集合的交集为 4 项')
  eq(a.lookup('history-b').impl, undefined, '会话 A 看不到 B 的注册')
  eq(b.lookup('history-a').impl, undefined, '会话 B 看不到 A 的注册')
  eq(a.lookup('history-a').impl, 'A.history', '会话 A 看到自己的注册')
  eq(a.lookup('nope').impl, undefined, '未知名字查到 undefined')
  eq(a.lookup('config').impl, 'root.config', '子作用域可见父作用域的服务')
  eq(a.lookup('config').layer, 'root', '命中位置记录为父作用域')
}
{
  const root = new Scope(null, 'root')
  root.provide('x', 'parent')
  const child = new Scope(root, 'child')
  child.provide('x', 'child')
  eq(child.lookup('x').impl, 'child', '子作用域覆盖父作用域的同名服务')
  eq(child.lookup('x').layer, 'child', '覆盖时命中子作用域')
  root.provide('x', 'parent2')
  eq(child.lookup('x').impl, 'child', '父作用域改注册不影响子的覆盖')
  eq(root.lookup('x').impl, 'parent2', '父作用域看到自己的新注册')
}
{
  const parent = new Scope(null, 'parent')
  const left = new Scope(parent, 'left')
  const right = new Scope(parent, 'right')
  left.provide('only-left', 1)
  eq(right.lookup('only-left').impl, undefined, '兄弟作用域互相看不到')
  eq(left.lookup('only-left').impl, 1, '自己注册的仍然可见')
}

// 定义 2.5.3：隔离标记
{
  const root = new Scope(null, 'root')
  root.provide('session-log', 'root.log')
  const child = new Scope(root, 'child')
  child.mark('session-log')
  const r = child.lookup('session-log')
  eq(r.impl, undefined, '被标记的名字不参与向上查找')
  eq(r.stopped, true, '查找因标记而停止')
  eq(r.visited, 1, '被标记时只访问了本层')
  eq(root.lookup('session-log').impl, 'root.log', '父作用域自己仍可查得')
  child.provide('session-log', 'child.log')
  eq(child.lookup('session-log').impl, 'child.log', '本层注册时标记不影响可见性')
  const other = new Scope(child, 'other')
  eq(other.lookup('session-log').impl, 'child.log', '标记只作用于标记它的那一层')
}
{
  const root = new Scope(null, 'root')
  const child = new Scope(root, 'child')
  eq(child.lookup('missing').stopped, false, '未标记的失败查找不报告停止')
  eq(child.lookup('missing').visited, 2, '未命中时访问了整条父链')
}

// 定义 2.5.5 / 命题 2.5.3：退出顺序
{
  const root = new Scope(null, 'root')
  const session = new Scope(root, 'session')
  const task = new Scope(session, 'task')
  root.provide('a', 1)
  session.provide('b', 2)
  task.provide('c', 3)
  const d = root.dispose()
  eq(d.order, ['task', 'session', 'root'], '退出次序是子先于父')
  eq(d.failures.length, 0, '无失败项')
  eq(root.lookup('a').impl, undefined, '退出后本层服务不再可见')
  eq(session.lookup('b').impl, undefined, '子作用域的服务也已撤销')
}
{
  const s = new Scope(null, 's')
  const order = []
  s.effect(() => order.push(1))
  s.effect(() => order.push(2))
  s.effect(() => order.push(3))
  s.dispose()
  eq(order, [3, 2, 1], '同一作用域内按注册逆序撤销')
}
{
  const s = new Scope(null, 'f')
  const done = []
  s.effect(() => done.push(1))
  s.effect(() => { throw new Error('撤销失败') })
  s.effect(() => done.push(3))
  const r = s.dispose()
  eq(r.failures.length, 1, '一个撤销抛错被记录')
  eq(done, [3, 1], '抛错不中断其余清理')
  eq(3 - r.failures.length, 2, '失败隔离后成功两个')
}
{
  const s = new Scope(null, 'empty')
  eq(s.dispose().order, ['empty'], '空作用域的退出次序只有自己')
  eq(s.dispose().failures.length, 0, '重复退出没有失败')
}
{
  const root = new Scope(null, 'root')
  const a = new Scope(root, 'a')
  const b = new Scope(root, 'b')
  a.effect(() => {})
  b.effect(() => {})
  const d = root.dispose()
  eq(d.order, ['b', 'a', 'root'], '多个子作用域按创建的逆序退出')
  eq(root.children.length, 0, '退出后子集合被清空')
}

// 定义 2.5.4：作用范围与放置
{
  eq(PLACEMENT_RULES.length, 3, '作用范围有三类')
  eq(layerOf('global'), 'root', '全体事实放根')
  eq(layerOf('session'), 'session', '会话事实放会话层')
  eq(layerOf('task'), 'task', '任务事实放任务层')
  eq(layerOf('unknown'), null, '未知作用范围返回 null')
  eq(misplacedStates([
    { name: '版本', extent: 'global', placed: 'root' },
    { name: '历史', extent: 'session', placed: 'session' },
  ]), [], '放对位置时没有违规')
  eq(misplacedStates([
    { name: '工作目录', extent: 'session', placed: 'root' },
    { name: '连接池', extent: 'global', placed: 'session' },
  ]), ['工作目录', '连接池'], '两种放错都被列出')
}

// 命题 2.5.5：层数与查找代价
{
  const l0 = new Scope(null, 'l0')
  const l1 = new Scope(l0, 'l1')
  const l2 = new Scope(l1, 'l2')
  l2.provide('mine', 'x')
  eq(l2.lookup('mine').visited, 1, '自己命中只访问一层')
  l0.provide('base', 'y')
  eq(l2.lookup('base').visited, 3, '命中根时访问三层')
  eq(l2.lookup('nope').visited, 3, '未命中时访问三层')
  ok(l2.lookup('base').visited > l1.lookup('base').visited, '层数越深查找代价越大')
}

// 命题 2.5.4：复用身份的代价
{
  const s = new Scope(null, 'reused')
  const off1 = s.provide('svc', '第一次装载')
  const off2 = s.provide('svc', '第二次装载')
  eq(s.entries.size, 1, '同名服务覆盖后只有一条')
  off1()
  eq(s.entries.size, 0, '同身份下撤销一次会误伤第二次装载')
  void off2
}
{
  const a = new Scope(null, 'a')
  const b = new Scope(null, 'b')
  const offA = a.provide('svc', 'A')
  b.provide('svc', 'B')
  offA()
  eq(b.entries.size, 1, '不同身份之间不会误伤')
}

// 命题 2.5.6：约定隔离的边界
{
  const leak = leakDemo()
  eq(leak.one, '/proj/one', '会话 A 第一次读到自己的值')
  eq(leak.two, '/proj/two', '会话 B 读到自己设置的值')
  eq(leak.oneAgain, '/proj/two', '会话 A 再次读取时看到了 B 的写入')
  eq(leak.leaked, true, '直接引用全局对象的模块发生了串扰')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
