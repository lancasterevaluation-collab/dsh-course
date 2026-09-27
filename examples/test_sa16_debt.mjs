// 1.2 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  coupling, riskiest, cyclomatic, ccBand, interestRate, repaymentWindow,
  afterEncapsulation, portfolio, classifyDebt, debtPriority, reachable,
  candidatesForDeletion, rewriteUpperBound,
} from './sa16_debt.mjs'

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

// 定义 1.2.2 / 命题 1.2.3：耦合
const nodes = ['ui', 'api', 'core', 'store', 'util']
const edges = [['ui', 'api'], ['api', 'core'], ['api', 'store'], ['core', 'util'], ['store', 'util'], ['api', 'util']]
const cp = coupling(nodes, edges)
eq(cp.find((x) => x.node === 'util').fanIn, 3, 'util 的扇入为 3')
eq(cp.find((x) => x.node === 'util').fanOut, 0, 'util 无扇出')
eq(cp.find((x) => x.node === 'util').coupling, 3, 'util 的耦合度为 3')
eq(cp.find((x) => x.node === 'api').fanOut, 3, 'api 的扇出为 3')
eq(cp.find((x) => x.node === 'ui').fanIn, 0, 'ui 无扇入')
eq(riskiest(nodes, edges, 1)[0].node, 'util', '扇入最高的是 util')
eq(riskiest(nodes, edges, 3).length, 3, '取前三项')

// 命题 1.2.2：圈复杂度
eq(cyclomatic(7), 8, '七个判定点给出圈复杂度 8')
eq(cyclomatic(0), 1, '无判定点时圈复杂度为 1')
eq(cyclomatic(19), 20, '十九个判定点给出 20')
eq(ccBand(8), 'easy', 'cc=8 易读')
eq(ccBand(10), 'easy', 'cc=10 易读')
eq(ccBand(11), 'needs-split', 'cc=11 需要拆分')
eq(ccBand(20), 'needs-split', 'cc=20 需要拆分')
eq(ccBand(21), 'must-split', 'cc=21 必须拆分')

// 定义 1.2.4 / 1.2.6：利息与窗口
near(interestRate(4, 0.5), 2, 1e-9, '利息率 2 小时/周')
near(repaymentWindow(60, 4, 0.5), 30, 1e-9, 'R=60、i=2 时还债窗口 30 周')
near(repaymentWindow(40, 2, 1.5), 13.333, 1e-3, '另一笔债的窗口约 13.3 周')

// 命题 1.2.4：封装降频
const enc = afterEncapsulation(60, 4, 0.5, 1)
near(enc.before, 30, 1e-9, '封装前窗口 30 周')
near(enc.after, 120, 1e-9, '封装后窗口 120 周')
near(enc.extendedBy, 90, 1e-9, '窗口延长 90 周')
ok(enc.after > enc.before, '封装使还债窗口变长')
near(afterEncapsulation(60, 4, 0.5, 4).extendedBy, 0, 1e-9, '未降频时窗口不变')

// 命题 1.2.6：组合
const pf = portfolio([
  { touchesPerWeek: 4, costPerTouch: 0.5, refactorHours: 60 },
  { touchesPerWeek: 2, costPerTouch: 1.5, refactorHours: 40 },
  { touchesPerWeek: 1, costPerTouch: 1, refactorHours: 20 },
], 90)
near(pf.totalInterest, 6, 1e-9, '三笔债的利息之和 6 小时/周')
near(pf.sumSeparate, 120, 1e-9, '分别重构成本 120 小时')
near(pf.saving, 30, 1e-9, '合并节省 30 小时')
near(pf.window, 15, 1e-9, '合并后窗口 15 周')
ok(pf.mergedRefactorHours <= pf.sumSeparate, '合并成本不超过分别之和')

// 定义 1.2.5 / 命题 1.2.5：分类与优先级
eq(classifyDebt({ intentional: true, robust: true }), 'deliberate-prudent', '有意且鲁棒')
eq(classifyDebt({ intentional: true, robust: false }), 'deliberate-reckless', '有意且鲁莽')
eq(classifyDebt({ intentional: false, robust: true }), 'inadvertent-prudent', '无意且鲁棒')
eq(classifyDebt({ intentional: false, robust: false }), 'inadvertent-reckless', '无意且鲁莽')
const risky = { intentional: false, robust: false, collapsesUnderLoad: true, crashProbability: 0.05, crashCost: 40 }
const safe = { intentional: true, robust: true, collapsesUnderLoad: false }
ok(debtPriority(risky) > debtPriority(safe), '无意且鲁莽的优先级高于有意且鲁棒')
near(debtPriority(risky), 22, 1e-9, '优先级 = 2×10 + 0.05×40')
near(debtPriority(safe), 10, 1e-9, '有意且鲁棒的优先级为 10')

// 命题 1.2.1：重写上界
const bound = rewriteUpperBound(100, 0.3)
near(bound.upperBound, 30, 1e-9, '偶然占 30% 时收益上界为 30')
near(bound.essential, 70, 1e-9, '必要复杂度 70 保持不变')
near(rewriteUpperBound(100, 1).upperBound, 100, 1e-9, '全为偶然时上界等于总量')
near(rewriteUpperBound(100, 0).upperBound, 0, 1e-9, '全为必要时无收益')

// 工具箱 5.5：可达与删除候选
eq(reachable('a', [['a', 'b'], ['b', 'c']]).sort(), ['a', 'b', 'c'], '从入口可达 a、b、c')
eq(candidatesForDeletion(['a', 'b', 'c', 'dead1'], 'a', [['a', 'b'], ['b', 'c']]), ['dead1'], '不可达节点是删除候选')
eq(candidatesForDeletion(['a'], 'a', []), [], '全可达时无候选')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
