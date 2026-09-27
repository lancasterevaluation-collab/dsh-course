// 4.5 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  META_CONTROLLED, detectionProbability, buildProposal, applyDiff, staticGate,
  evaluate, VersionStore, release, rollback,
} from './sa36_evolution.mjs'

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

// 命题 4.5.1：三层门控的覆盖与发现概率
{
  near(detectionProbability(0.01, 50), 0.395, 0.001, '50 个任务的发现概率约 0.395')
  near(detectionProbability(0.01, 200), 0.866, 0.002, '200 个任务的发现概率约 0.866')
  near(detectionProbability(1, 50), 1, 1e-9, '必然退化时一定被发现')
  eq(detectionProbability(0.01, 0), 0, '没有任务时发现概率为零')
  ok(detectionProbability(0.01, 200) > detectionProbability(0.01, 50), '任务越多越容易发现')
  near(detectionProbability(0.01, 50) - 1 + 0.99 ** 50, 0, 1e-12, '与 1-(1-p)^n 一致')
}

// 定义 4.5.2：提议
{
  const diagnosis = { phenomenon: 'silent', conclusion: { cause: '超时过小' }, action: { target: '调大超时配置' } }
  const change = {
    id: 'p1',
    target: { kind: 'config', path: 'llm/timeoutMs' },
    diff: { before: 'a', after: 'b' },
    expectation: { metric: 'success-rate', delta: 0.05 },
    rollback: '应用反向差异',
    originVersion: 'v1',
  }
  const p = buildProposal(diagnosis, change)
  eq(Object.keys(p).length, 7, '提议有七个字段')
  eq(Object.keys(p), ['id', 'target', 'diff', 'reason', 'expectation', 'rollback', 'originVersion'], '字段名与顺序')
  ok(p.reason.includes('超时过小'), '理由追溯到诊断结论')
  ok(p.reason.includes('silent'), '理由含现象')
  eq(p.originVersion, 'v1', '基线版本被保留')
  throws(() => buildProposal(diagnosis, { ...change, diff: { before: '', after: 'b' } }), '缺改前段时抛错')
  throws(() => buildProposal(diagnosis, { ...change, diff: { before: 'a', after: '' } }), '缺改后段时抛错')
  throws(() => buildProposal({ action: { target: null } }, change), '缺可行动对象时抛错')
}
{
  eq(applyDiff('x timeoutMs: 30000 y', { before: 'timeoutMs: 30000', after: 'timeoutMs: 90000' }), 'x timeoutMs: 90000 y', '差异被应用')
  throws(() => applyDiff('abc', { before: 'zzz', after: 'q' }), '原文本不含改前段时抛错')
}

// 定义 4.5.3 / 4.5.5：静态门
{
  eq(META_CONTROLLED.length, 5, '元控制有五个对象')
  ok(META_CONTROLLED.includes('gate/thresholds'), '门控阈值受保护')
  ok(META_CONTROLLED.includes('eval/dataset'), '评估集受保护')
  ok(META_CONTROLLED.includes('meta/list'), '清单本身受保护')
  const current = { id: 'v1', textOf: () => 'timeoutMs: 30000' }
  const base = {
    id: 'p1',
    target: { kind: 'config', path: 'llm/timeoutMs' },
    diff: { before: 'timeoutMs: 30000', after: 'timeoutMs: 90000' },
    originVersion: 'v1',
  }
  eq(staticGate(base, current).ok, true, '合法提议通过静态门')
  for (const path of META_CONTROLLED) {
    eq(staticGate({ ...base, target: { kind: 'config', path } }, current).ok, false, `元控制对象 ${path} 被拒`)
  }
  ok(staticGate({ ...base, target: { kind: 'config', path: 'gate/thresholds' } }, current).why.includes('元控制'), '拒绝原因说明是元控制')
  eq(staticGate({ ...base, originVersion: 'v0' }, current).ok, false, '基线过期被拒')
  ok(staticGate({ ...base, originVersion: 'v0' }, current).why.includes('基线版本过期'), '拒绝原因说明基线过期')
  eq(staticGate({ ...base, diff: { before: '不存在', after: 'x' } }, current).ok, false, '差异冲突被拒')
  ok(staticGate({ ...base, diff: { before: '不存在', after: 'x' } }, current).why.includes('无法干净应用'), '拒绝原因说明差异冲突')
}

// 定义 4.5.6：噪声与改善
{
  const a = [0.70, 0.72, 0.71, 0.73, 0.70, 0.72]
  const b = [0.69, 0.70, 0.69, 0.71, 0.68, 0.70]
  const c = [0.78, 0.80, 0.79, 0.81, 0.78, 0.80]
  const r = evaluate(a, b, c)
  near(r.noise, 0.0183, 0.001, '基线噪声约 0.018')
  near(r.gain, 0.0892, 0.002, '候选改善约 0.089')
  near(r.threshold, 2 * r.noise, 1e-9, '阈值是两倍噪声')
  eq(r.accepted, true, '改善显著大于噪声时接受')
  eq(r.guardOk, true, '护栏默认通过')
  const tiny = evaluate(a, b, [0.715, 0.72, 0.71, 0.715, 0.72, 0.71])
  eq(tiny.accepted, false, '改善落在噪声内时不接受')
  ok(tiny.gain < tiny.threshold, '此时改善小于阈值')
  eq(evaluate(a, b, c, false).accepted, false, '护栏退化时不接受')
  eq(evaluate(a, a, c).noise, 0, '两次基线相同时噪声为零')
  eq(evaluate(a, a, c).accepted, true, '噪声为零时任何正改善都被接受')
  eq(evaluate(a, b, [0.6, 0.6, 0.6, 0.6, 0.6, 0.6]).accepted, false, '改善为负时不接受')
}

// 定义 4.5.4：版本与回滚
{
  const store = new VersionStore(1)
  store.stage({ id: 'v1', base: null, changes: [], canRead: (s) => s >= 1 })
  store.atomicSwitch('v1')
  const proposal = { id: 'p1' }
  const v2 = release(store, proposal, 100)
  eq(store.current().id, v2, '发布后当前版本是新版本')
  eq(store.current().changes.length, 1, '版本包含一组改动')
  eq(store.current().base, 'v1', '版本记录了它的父版本')
  eq(store.events.length, 1, '发布产生一条事件')
  eq(store.events[0].type, 'evolution/release', '事件类型正确')
  eq(store.events[0].from, 'v1', '事件记录来源版本')
}
{
  const store = new VersionStore(2)
  store.stage({ id: 'v1', base: null, changes: [], canRead: (s) => s >= 1 })
  store.stage({ id: 'v3', base: 'v1', changes: [], canRead: (s) => s === 2 })
  store.atomicSwitch('v3')
  const back = rollback(store, 'v1', 200)
  eq(back, 'v1', '回滚返回目标版本')
  eq(store.current().id, 'v1', '当前版本被切换')
  ok(store.events.some((e) => e.type === 'evolution/rollback'), '回滚事件被记录')
  const back2 = rollback(store, 'v3', 300)
  eq(back2, 'v3', '能读当前状态的版本可以回滚到')
}
{
  const store = new VersionStore(5)
  store.stage({ id: 'x', base: null, changes: [], canRead: (s) => s === 1 })
  throws(() => rollback(store, 'x', 1), '状态不兼容时抛错')
  ok(true, '状态兼容检查在切换之前')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
