// 4.4 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  classifyFailure, STRENGTH, COST_ORDER, score, rankCandidates, checkCandidateCount,
  conclude, verifyFix,
} from './sa35_diagnosis.mjs'

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

// 定义 4.4.1：三类失败与判定顺序
{
  eq(classifyFailure({ error: 'boom' }).kind, 'error', '有错误即报错类')
  eq(classifyFailure({ error: 'boom' }).detail, 'boom', '错误详情被保留')
  eq(classifyFailure({}, [{ name: 'no-null', passed: () => false }]).kind, 'silent', '检查不通过即静默错误结果')
  eq(classifyFailure({}, [{ name: 'a', passed: () => false }, { name: 'b', passed: () => false }]).detail, ['a', 'b'], '多个失败检查被列出')
  eq(classifyFailure({ goal: { met: () => false, summary: 's' } }).kind, 'goal-miss', '目标未达即第三类')
  eq(classifyFailure({ goal: { met: () => false, summary: 's' } }).detail, 's', '目标摘要被保留')
  eq(classifyFailure({ goal: { met: () => true } }), null, '三类都不成立时不算失败')
  eq(classifyFailure({}, []), null, '没有目标也没有检查时不算失败')
  eq(classifyFailure({}, [{ name: 'ok', passed: () => true }]), null, '检查通过时不算失败')
  eq(classifyFailure({ error: 'boom', goal: { met: () => false } }).kind, 'error', '报错优先于目标未达')
  eq(classifyFailure({ error: 'boom' }, [{ name: 'x', passed: () => false }]).kind, 'error', '报错优先于检查不通过')
  eq(classifyFailure({ goal: { met: () => false } }, [{ name: 'x', passed: () => false }]).kind, 'silent', '检查优先于目标未达')
}

// 定义 4.4.3：证据强度与得分
{
  eq(STRENGTH, { correlation: 1, counterfactual: 2, reproducible: 3 }, '三类证据的强度')
  eq(COST_ORDER, { low: 0, medium: 1, high: 2 }, '三档成本的次序')
  eq(score({ evidence: ['counterfactual', 'reproducible'] }), 5, '反事实加复现得 5')
  eq(score({ evidence: ['correlation'] }), 1, '时间相关得 1')
  eq(score({ evidence: [] }), 0, '没有证据得 0')
  eq(score({ evidence: ['correlation', 'correlation'] }), 2, '同类证据可累加')
  ok(STRENGTH.reproducible > STRENGTH.counterfactual, '复现强于反事实')
  ok(STRENGTH.counterfactual > STRENGTH.correlation, '反事实强于时间相关')
}

// 定义 4.4.2 / 命题 4.4.2：候选排序
{
  const candidates = [
    { cause: 'A', evidence: ['counterfactual', 'reproducible'], actionable: 'x', cost: 'low' },
    { cause: 'B', evidence: ['correlation'], actionable: 'y', cost: 'medium' },
    { cause: 'C', evidence: ['correlation'], actionable: null, cost: 'high' },
    { cause: 'D', evidence: ['correlation'], actionable: 'z', cost: 'low' },
  ]
  const ranked = rankCandidates(candidates)
  eq(ranked.length, 3, '不可行动的候选被过滤')
  ok(!ranked.some((c) => c.actionable === null), '结论里没有不可行动的候选')
  eq(ranked[0].cause, 'A', '得分最高的排第一')
  eq(score(ranked[0]), 5, '第一名的得分是 5')
  eq(ranked[1].cause, 'D', '同强度下低成本优先')
  eq(ranked[2].cause, 'B', '成本较高的排后面')
  eq(rankCandidates([]), [], '空候选返回空')
  eq(rankCandidates([{ cause: 'x', evidence: [], actionable: null, cost: 'low' }]), [], '全部不可行动时返回空')
}
{
  eq(checkCandidateCount([{ cause: 'a', evidence: ['correlation'] }, { cause: 'b', evidence: ['correlation'] }]).ok, true, '两个候选即够全')
  eq(checkCandidateCount([{ cause: 'a', evidence: ['correlation'] }]).ok, false, '单候选且证据弱时不够')
  eq(checkCandidateCount([{ cause: 'a', evidence: ['counterfactual', 'reproducible'] }]).ok, true, '单候选但证据强时够')
  ok(checkCandidateCount([{ cause: 'a', evidence: ['correlation'] }]).reason.includes('不足'), '不足时给出原因')
}

// 定义 4.4.5 / 4.4.6：结论
{
  const known = { config: 'timeoutMs=30000', coldStart: false, loaded: ['refactor'], resources: { concurrency: 4 } }
  const candidates = [
    { cause: '超时过小', evidence: ['counterfactual', 'reproducible'], actionable: '调大超时配置', cost: 'low' },
    { cause: '上下文过长', evidence: ['correlation'], actionable: '收紧压缩阈值', cost: 'medium' },
  ]
  const d = conclude(candidates, { kind: 'silent', detail: ['no-timeout'] }, known, 'long-refactor')
  eq(Object.keys(d).length, 6, '结论有六个字段')
  eq(Object.keys(d), ['phenomenon', 'knownConditions', 'candidates', 'conclusion', 'action', 'watchList'], '字段名与顺序')
  ok(d.phenomenon.includes('silent'), '现象字段含失败类型')
  eq(Object.keys(d.knownConditions).length, 4, '已知条件有四项')
  eq(d.knownConditions.coldStart, false, '已知条件含是否冷启动')
  eq(d.conclusion.cause, '超时过小', '结论取第一名候选')
  ok(d.conclusion.why.includes('5'), '结论说明里含证据得分')
  eq(d.action.target, '调大超时配置', '动作指向可改对象')
  ok(d.action.verify.includes('long-refactor'), '验证方式含任务标识')
  eq(d.watchList, ['上下文过长'], '观察项列出其余候选')
  throws(() => conclude([], { kind: 'error', detail: 'x' }, known, 't'), '没有可行动候选时抛错')
  throws(() => conclude([{ cause: 'x', evidence: [], actionable: null, cost: 'low' }], { kind: 'error', detail: 'x' }, known, 't'), '全部不可行动时抛错')
}

// 命题 4.4.5：修复验证
{
  const d = { knownConditions: { config: 'a' } }
  const notRepro = await verifyFix(d, async () => ({ failed: false }), async () => ({ failed: false }))
  eq(notRepro.ok, false, '改前不复现时验证不通过')
  ok(notRepro.reason.includes('无法复现'), '说明无效的原因')
  const fixed = await verifyFix(d, async () => ({ failed: true }), async () => ({ failed: false }))
  eq(fixed.ok, true, '改前复现、改后通过时验证通过')
  ok(fixed.reason.includes('改后通过'), '通过时的说明')
  const still = await verifyFix(d, async () => ({ failed: true }), async () => ({ failed: true }))
  eq(still.ok, false, '改后仍失败时验证不通过')
  ok(still.reason.includes('仍失败'), '仍失败时的说明')
}
{
  // 重放收到的已知条件与诊断一致
  const d = { knownConditions: { config: 'timeoutMs=30000', coldStart: true } }
  let seen = null
  await verifyFix(d, async (k) => { seen = k; return { failed: true } }, async () => ({ failed: false }))
  eq(seen.config, 'timeoutMs=30000', '重放使用诊断记录的已知条件')
  eq(seen.coldStart, true, '冷启动状态被带上')
}
{
  near(STRENGTH.reproducible / STRENGTH.correlation, 3, 1e-9, '复现的强度是时间相关的三倍')
  near(STRENGTH.counterfactual / STRENGTH.correlation, 2, 1e-9, '反事实的强度是时间相关的两倍')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
