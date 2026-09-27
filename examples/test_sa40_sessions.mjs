// 5.2 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  estimate, admit, fifoWait, roundRobinWait, schedule, LeaseRegistry, closeSession,
} from './sa40_sessions.mjs'

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

// 命题 5.2.2：调度与公平性
{
  const work = [10, 2, 2]
  const fifo = fifoWait(work)
  eq(fifo.waits, [0, 10, 12], '先来先服务的等待是 0、10、12')
  eq(fifo.total, 14, '总时长 14')
  const rr = roundRobinWait(work, 2)
  eq(rr.first, [0, 2, 4], '轮转的首次响应是 0、2、4')
  eq(rr.total, 14, '轮转的总时长同样 14')
  ok(rr.first[1] < fifo.waits[1], '轮转让第二位更早得到响应')
  ok(rr.first[2] < fifo.waits[2], '轮转让第三位更早得到响应')
  near(fifo.waits[1] / rr.first[1], 5, 1e-9, '第二位的等待相差五倍')
  const rr4 = roundRobinWait(work, 4)
  eq(rr4.first, [0, 4, 6], '时间片为 4 时的首次响应')
  eq(rr4.total, 14, '时间片不影响总时长')
  eq(fifoWait([]).waits, [], '空工作列表没有等待')
  eq(fifoWait([5]).total, 5, '单个会话的总时长是它的工作量')
}
{
  eq(estimate({ tokens: 120 }), 120, '估算取值')
  eq(estimate({}), 0, '缺 tokens 时估算为零')
}

// 定义 5.2.3：配额准入
{
  const session = { id: 's1', running: 2, quota: { maxConcurrent: 3, maxTokensPerMinute: 1000 } }
  const base = { config: { globalMaxConcurrent: 10 }, globalConcurrent: () => 1, tokensInWindow: () => 0 }
  eq(admit(session, base, { tokens: 100 }).ok, true, '未超限时准入')
  const full = admit(session, { ...base, globalConcurrent: () => 10 }, { tokens: 1 })
  eq(full.ok, false, '全局并发满时拒绝')
  eq(full.reason, '全局并发已满', '全局拒绝的原因')
  eq(full.retryAfter, 1000, '全局拒绝的等待建议')
  const busy = admit({ ...session, running: 3 }, base, { tokens: 1 })
  eq(busy.reason, '会话并发已满', '会话并发满时拒绝')
  eq(busy.retryAfter, 500, '会话拒绝的等待建议')
  const rate = admit(session, { ...base, tokensInWindow: () => 950 }, { tokens: 100 })
  eq(rate.reason, '速率超限', '速率超限时拒绝')
  eq(rate.retryAfter, 60000, '速率拒绝的等待建议')
  ok(rate.retryAfter > full.retryAfter && full.retryAfter > busy.retryAfter, '等待建议按拒绝类型递增')
  eq(admit(session, { ...base, tokensInWindow: () => 900 }, { tokens: 100 }).ok, true, '恰好等于上限时准入')
  eq(admit(session, { ...base, tokensInWindow: () => 901 }, { tokens: 100 }).ok, false, '超过上限一元时拒绝')
}

// 定义 5.2.4：调度
{
  const sessions = [
    { id: 'a', state: 'running', preset: 'coding' },
    { id: 'b', state: 'running', preset: 'qa' },
    { id: 'c', state: 'closed', preset: 'coding' },
  ]
  const presetOf = (p) => ({ coding: { priority: 1 }, qa: { priority: 5 } }[p])
  const credits = (id) => ({ a: 1, b: 1, c: 0 }[id] ?? 0)
  eq(schedule(sessions, presetOf, credits), 'b', '高优先级的会话先被选中')
  const noCredits = schedule(sessions, presetOf, (id) => ({ a: 1, b: 0 }[id] ?? 0))
  eq(noCredits, 'a', '高优先级没有配额时轮到下一个')
  eq(schedule([{ id: 'x', state: 'closed', preset: 'coding' }], presetOf, credits), null, '没有可执行会话时返回 null')
  eq(schedule([], presetOf, credits), null, '空列表返回 null')
}

// 定义 5.2.5：租约
{
  const leases = new LeaseRegistry(60000)
  const first = leases.acquire('ws', 'a', 0)
  eq(first.queued, false, '首次获取直接成功')
  eq(first.lease.mode, 'exclusive', '租约是独占模式')
  eq(first.lease.expiresAt, 60000, '过期时间是获取时间加租约时长')
  const conflict = leases.acquire('ws', 'b', 100)
  eq(conflict.queued, true, '冲突时排队')
  eq(conflict.position, 1, '第一个排队者的位置是 1')
  eq(conflict.lease, null, '排队时不产生租约')
  eq(leases.acquire('ws', 'c', 200).position, 2, '第二个排队者的位置是 2')
  eq(leases.acquire('ws', 'a', 300).queued, false, '同一持有者重复获取直接成功')
  const after = leases.acquire('ws', 'b', 60301)
  eq(after.queued, false, '租约过期后可被他人获取')
  eq(after.lease.holder, 'b', '新租约的持有者是请求者')
  leases.release('ws')
  eq(leases.leaseOf('ws'), undefined, '释放后没有租约')
  ok(leases.acquire('ws', 'c', 60400).queued === false, '释放后可立即获取')
}

// 定义 5.2.6 / 命题 5.2.5：回收
{
  const registry = { state: null, setState(id, s) { this.state = s }, remove() { this.removed = true } }
  const ctx = {
    graceMs: 5000,
    cancelScope: () => 3,
    release: (l) => l,
    disposeContainer: () => {},
    flushMetrics: () => {},
    listRegistrations: () => [
      { scope: 'sc1', what: 'tool/read', plugin: 'a', expectedAfterDispose: false },
      { scope: 'sc1', what: 'logger', plugin: 'l', expectedAfterDispose: true },
      { scope: 'other', what: 'x', plugin: 'y', expectedAfterDispose: false },
    ],
  }
  const handle = { id: 's1', scope: { id: 'sc1' }, container: {}, leases: ['ws1', 'ws2'] }
  const report = closeSession(handle, registry, ctx)
  eq(report.leaked.length, 1, '未释放项只有一项')
  ok(report.leaked[0].includes('tool/read'), '未释放项含注册名')
  ok(report.leaked[0].includes('a'), '未释放项含来源插件')
  eq(registry.state, 'closed', '回收后状态是已关闭')
  eq(report.cancelled, 3, '取消返回被取消的操作数')
  eq(report.released.length, 2, '释放了两个租约')
  eq(registry.removed, true, '会话从注册表移除')
  ok(!report.leaked.some((l) => l.includes('logger')), '期望存活的注册不计入泄漏')
  ok(!report.leaked.some((l) => l.includes('other')), '其他作用域的注册不计入')
}
{
  const registry = { state: null, setState(id, s) { this.state = s }, remove() {} }
  const ctx = {
    graceMs: 0, cancelScope: () => 0, release: () => {}, disposeContainer: () => {},
    flushMetrics: () => {}, listRegistrations: () => [],
  }
  const report = closeSession({ id: 's', scope: { id: 'x' }, container: {}, leases: [] }, registry, ctx)
  eq(report.leaked, [], '没有残留时报告为空')
  eq(report.cancelled, 0, '没有子操作时取消数为零')
}

// 量级关系
{
  near(fifoWait([10, 2, 2]).total, roundRobinWait([10, 2, 2], 2).total, 0, '两种策略总时长相同')
  ok(roundRobinWait([10, 2, 2], 2).first[2] < fifoWait([10, 2, 2]).waits[2], '轮转改善的是等待分布')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
