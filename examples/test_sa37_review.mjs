// 4.6 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  missRate, shouldReview, buildTaskSet, rotateTaskSet, coverage, gateOnCoverage, stability,
} from './sa37_review.mjs'

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

// 命题 4.6.1：漏检率
{
  near(missRate(0.05, 20), 0.358, 0.001, '20 个任务的漏检率约 0.358')
  near(missRate(0.05, 50), 0.077, 0.001, '50 个任务的漏检率约 0.077')
  near(missRate(0.05, 100), 0.0059, 0.0001, '100 个任务的漏检率约 0.0059')
  near(missRate(0.05, 200), 0.000035, 0.000001, '200 个任务的漏检率约 0.000035')
  eq(missRate(0.05, 0), 1, '没有任务时必然漏检')
  eq(missRate(1, 50), 0, '必然退化时不会漏检')
  ok(missRate(0.05, 100) < missRate(0.05, 50), '任务越多漏检越低')
  near(missRate(0.05, 50) - 0.95 ** 50, 0, 1e-12, '与 (1-p)^n 一致')
}

// 定义 4.6.2：三种触发
{
  const cfg = { now: 110, reviewInterval: 5, burstWindow: 10, burstCount: 3 }
  const base = { lastReviewAt: 100, failures: [], metrics: {}, thresholds: {} }
  eq(shouldReview(base, cfg).kind, 'time', '周期到时按时间触发')
  eq(shouldReview(base, cfg).reason, '周期到', '时间触发的原因')
  const burst = { ...base, lastReviewAt: 108, failures: [{ kind: 'a', at: 105 }, { kind: 'a', at: 106 }, { kind: 'a', at: 107 }] }
  eq(shouldReview(burst, cfg).kind, 'event', '同类失败聚集时按事件触发')
  ok(shouldReview(burst, cfg).reason.includes('3'), '原因含次数')
  const notEnough = { ...base, lastReviewAt: 108, failures: [{ kind: 'a', at: 105 }, { kind: 'a', at: 106 }] }
  eq(shouldReview(notEnough, cfg) === null, true, '次数不够时不按事件触发')
  const old = { ...base, lastReviewAt: 108, failures: [{ kind: 'a', at: 90 }, { kind: 'a', at: 91 }, { kind: 'a', at: 92 }] }
  eq(shouldReview(old, cfg) === null, true, '窗口外的事件不计入')
  const breach = { ...base, lastReviewAt: 108, metrics: { cost: 12 }, thresholds: { cost: 10 } }
  eq(shouldReview(breach, cfg).kind, 'threshold', '指标越界时按阈值触发')
  const quiet = { ...base, lastReviewAt: 108, metrics: { cost: 1 }, thresholds: { cost: 10 } }
  eq(shouldReview(quiet, cfg), null, '三者都不满足时不触发')
  const both = { ...base, lastReviewAt: 100, metrics: { cost: 12 }, thresholds: { cost: 10 } }
  eq(shouldReview(both, cfg).kind, 'time', '时间优先于阈值（严重程度递增的判定顺序）')
}

// 定义 4.6.3 / 命题 4.6.4：任务集
{
  const samples = [
    { id: 't1', kind: 'code', check: 'x', stability: 1 },
    { id: 't2', kind: 'code', check: 'x', stability: 0.95 },
    { id: 't3', kind: 'doc', check: 'x', stability: 0.92 },
    { id: 't4', kind: 'doc', check: 'x', stability: 0.5 },
    { id: 't5', kind: 'chore', check: null, stability: 1 },
    { id: 't6', kind: 'chore', check: 'x', stability: 1 },
  ]
  const built = buildTaskSet(samples, 4)
  eq(built.length, 4, '构建出四个任务')
  ok(!built.some((t) => t.id === 't4'), '不稳定任务被剔除')
  ok(!built.some((t) => t.id === 't5'), '没有检查的任务被剔除')
  ok(new Set(built.map((t) => t.kind)).size >= 2, '分层覆盖多个 kind')
  eq(buildTaskSet(samples, 100).length, 4, '目标大于可用数量时取全部')
  eq(buildTaskSet([], 10).length, 0, '没有样本时任务集为空')
  eq(buildTaskSet(samples, 4, 0.99).length, 2, '提高稳定性下限后可用任务减少')
}
{
  const current = [
    { id: 'old1', kind: 'k', check: 'x', stability: 1 },
    { id: 'old2', kind: 'k', check: 'x', stability: 1 },
    { id: 'old3', kind: 'k', check: 'x', stability: 1 },
    { id: 'old4', kind: 'k', check: 'x', stability: 1 },
  ]
  const samples = [
    { id: 'n1', kind: 'k', check: 'x', stability: 1 },
    { id: 'n2', kind: 'k', check: 'x', stability: 1 },
    { id: 'n3', kind: 'k', check: 'x', stability: 1 },
  ]
  const rotated = rotateTaskSet(current, samples, 0.25)
  eq(rotated.length, 4, '替换后规模不变')
  eq(rotated.filter((t) => t.id.startsWith('old')).length, 3, '保留四分之三的旧任务')
  eq(rotated.filter((t) => t.id.startsWith('n')).length, 1, '加入一个新任务')
  eq(rotateTaskSet(current, samples, 0).length, 4, '比例为 0 时全部保留')
  ok(rotateTaskSet(current, samples, 0).every((t) => t.id.startsWith('old')), '比例为 0 时没有新任务')
}

// 定义 4.6.5 / 命题 4.6.2 / 4.6.3：覆盖率
{
  const mk = (state, dropReason) => ({ state, dropReason })
  eq(coverage([mk('done'), mk('done')]), 1, '全部完成时覆盖率为 1')
  eq(coverage([]), 1, '空集合的覆盖率为 1')
  eq(coverage([mk('done'), mk('done'), mk('todo'), mk('dropped', '不需要了')]), 0.75, '带理由的放弃计入覆盖')
  eq(coverage([mk('done'), mk('done'), mk('todo'), mk('dropped')]), 0.5, '无理由的放弃不计入')
  eq(coverage([mk('dropped', 'x'), mk('dropped')]), 0.5, '混合放弃时只算带理由的')
  eq(coverage([mk('doing'), mk('todo')]), 0, '全部进行中时覆盖率为 0')
}
{
  const mk = (state, dropReason) => ({ state, dropReason })
  eq(gateOnCoverage([mk('done'), mk('done'), mk('done'), mk('todo')], 0.75), true, '覆盖率达到阈值时允许新增')
  eq(gateOnCoverage([mk('done'), mk('done'), mk('todo'), mk('todo')], 0.75), false, '覆盖率低于阈值时禁止新增')
  eq(gateOnCoverage([], 0.75), true, '空集合允许新增')
}

// 命题 4.6.4：稳定性
{
  const runA = [true, true, false, true, true, true, true, true, true, true]
  const runB = [true, true, true, true, true, true, true, true, true, true]
  const s = stability(runA, runB)
  near(s.consistent, 0.9, 1e-9, '两次运行的一致度是 0.9')
  near(s.noise, 0.1, 1e-9, '成功率差异（噪声）是 0.1')
  eq(s.unstable, 1, '一个任务不稳定')
  const same = stability(runA, runA)
  eq(same.consistent, 1, '同一份结果的一致度是 1')
  eq(same.noise, 0, '同一份结果的噪声是 0')
  eq(same.unstable, 0, '同一份结果没有不稳定任务')
  eq(stability([], []).consistent, 0, '空结果的稳定度按零处理')
}
{
  near(missRate(0.05, 50), 0.077, 0.001, '五十个任务是漏检率的门槛值')
  ok(missRate(0.05, 50) < 0.1, '五十个任务把漏检压到一成以下')
  ok(missRate(0.05, 100) < 0.01, '一百个任务把漏检压到 1% 以下')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
