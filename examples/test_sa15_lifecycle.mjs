// 1.1 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  STAGES, STAGE_OUTPUTS, topoOrder, reversibility, tolerableDefectRate,
  blastRadius, debtBreakEven, debtInterest, checkCompletion, releaseDecision, walkthrough,
} from './sa15_lifecycle.mjs'

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

// 定义 1.1.1：十站
eq(STAGES.length, 10, '十站共十个')
eq(STAGES[0], '意图', '第一站是意图')
eq(STAGES[1], '判据', '判据在方案之前')
ok(STAGES.indexOf('方案') > STAGES.indexOf('判据'), '判据早于方案')
eq(Object.keys(STAGE_OUTPUTS).length, 10, '每站都有产出定义')

// 工具箱 5.1 / 命题 1.1.2：拓扑排序
const t1 = topoOrder(['判据', '方案', '实现'], [['判据', '方案'], ['方案', '实现']])
eq(t1.order, ['判据', '方案', '实现'], '线性扩展保持偏序')
ok(!t1.cyclic, '无环时 cyclic 为假')
const t2 = topoOrder(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']])
eq(t2.order.length, 0, '有环时无法给出线性扩展')
ok(t2.cyclic, '有环时 cyclic 为真')
eq(topoOrder(['X'], []).order, ['X'], '单节点可排序')

// 定义 1.1.2：可逆性分级
eq(reversibility({ rollbackMinutes: 5, externalDependents: 0, needsCoordination: false }), 'two-way', '分钟级回滚且无外部依赖是双向门')
eq(reversibility({ rollbackMinutes: 5, externalDependents: 3, needsCoordination: false }), 'slow', '有外部依赖至少是缓开门')
eq(reversibility({ rollbackMinutes: 120, externalDependents: 0, needsCoordination: false }), 'slow', '小时级回滚是缓开门')
eq(reversibility({ rollbackMinutes: 5, externalDependents: 0, needsCoordination: true }), 'one-way', '需他人配合是单向门')
eq(reversibility({ rollbackMinutes: 60 * 24 + 1, externalDependents: 0, needsCoordination: false }), 'one-way', '回滚超过一天是单向门')

// 命题 1.1.5：可容忍缺陷率
near(tolerableDefectRate(1, 0.1), 10, 1e-9, '双向门可容忍缺陷率 10')
near(tolerableDefectRate(1, 100), 0.01, 1e-9, '单向门可容忍缺陷率 0.01')
near(tolerableDefectRate(1, 0.1) / tolerableDefectRate(1, 100), 1000, 1e-9, '两者之比 1000 倍')
ok(tolerableDefectRate(1, 100) < tolerableDefectRate(1, 0.1), '回滚代价越大，可容忍缺陷率越低')

// 定义 1.1.3 / 工具箱 5.3：影响面
const graph = new Map([
  ['schema', ['api', 'etl']],
  ['api', ['sdk', 'docs']],
  ['etl', ['report']],
  ['sdk', []], ['docs', []], ['report', []],
])
eq(blastRadius(['schema'], graph).sort(), ['api', 'docs', 'etl', 'report', 'schema', 'sdk'], '改 schema 波及全部下游')
eq(blastRadius(['sdk'], graph), ['sdk'], '改末端节点只波及自己')
eq(blastRadius(['api'], graph).sort(), ['api', 'docs', 'sdk'], '改 api 波及 sdk 与 docs')
ok(!blastRadius(['schema'], graph).includes('api') === false, '方向是正向可达（含 api）')

// 命题 1.1.4：债
near(debtBreakEven(60, 2), 30, 1e-9, 'R=60、i=2 时临界时间 30 周')
near(debtInterest(2, 52), 104, 1e-9, 'i=2 时年利息 104 小时')
near(debtInterest(2, 26), 52, 1e-9, 'i=2 时半年利息 52 小时')
near(debtInterest(2, 30), 60, 1e-9, '临界点上累计利息恰好等于重构成本')
ok(debtInterest(2, 31) > 60, '超过临界周数后累计利息高于重构成本')
ok(debtInterest(2, 20) < 60, '二十周的累计利息低于重构成本')

// 定义 1.1.4：完成判据
const criteria = [
  { metric: 'p95Ms', threshold: 800, windowDays: 7 },
  { metric: 'failureRate', threshold: 0.01, windowDays: 7 },
]
ok(checkCompletion(criteria, { p95Ms: 700, failureRate: 0.005 }).done, '全部达标时判为完成')
eq(checkCompletion(criteria, { p95Ms: 700 }).failed, ['failureRate'], '缺指标时列为未完成')
eq(checkCompletion(criteria, { p95Ms: 900, failureRate: 0.005 }).failed, ['p95Ms'], '超过阈值时列为未完成')
ok(!checkCompletion(criteria, { p95Ms: 800, failureRate: 0.005 }).done, '等于阈值不算达标')

// 定义 1.1.5 / 命题 1.1.6：错误预算
const r1 = releaseDecision(1000, 10, 5)
near(r1.budget, 0.01, 1e-9, '错误预算 1%')
near(r1.rate, 0.005, 1e-9, '实际失败率 0.5%')
ok(r1.releasable, '低于预算时可发布')
ok(!releaseDecision(1000, 10, 20).releasable, '超过预算时不可发布')
ok(releaseDecision(1000, 10, 10).releasable, '恰好等于预算时可发布')

// 走查
eq(walkthrough([...STAGES]).length, 0, '十站齐备时无缺失')
eq(walkthrough(STAGES.filter((s) => s !== '观测')).join(), '观测', '缺一站时指出该站')
eq(walkthrough([]).length, 10, '全缺时列出十站')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
