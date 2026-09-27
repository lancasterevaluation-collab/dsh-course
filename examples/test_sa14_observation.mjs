// 6.4 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  RECORD_FIELDS, validateRecord, detectSurprises, isAnomaly, frequencyVerdict,
  ruleOut, minimizeRepro, canConvert, classifyQuestion, wilson,
} from './sa14_observation.mjs'

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

// 定义 6.4.3：记录字段
const rec = { task: 't1', config: {}, metric: 'latency', before: 1.2, after: 8.4, trials: 5, timestamp: '2026-09-01' }
ok(validateRecord(rec).ok, '字段齐备时通过')
eq(validateRecord({ ...rec, task: null }).missing, ['task'], '缺 task 被指出')
eq(validateRecord({}).missing.length, 7, '全缺时列出七个字段')
eq(RECORD_FIELDS.length, 7, '记录有七个字段')

// 命题 6.4.1：意外检测
const asrt = [
  { name: 'a1', expected: 'faster', observed: 'faster' },
  { name: 'a2', expected: 'faster', observed: 'slower' },
  { name: 'a3', expected: 1, observed: 2 },
]
eq(detectSurprises(asrt).map((a) => a.name), ['a2', 'a3'], '冲突项被检出')
eq(detectSurprises([{ name: 'x', expected: 1, observed: 1 }]).length, 0, '全部符合预期时为空')
eq(detectSurprises([]).length, 0, '无断言时为空')

// 定义 6.4.2：异常判定
const baseline = [...Array(100)].map((_, i) => 1 + i / 100)
ok(isAnomaly(1.995, baseline, 0.99), '超过 P99 的值判为异常')
ok(!isAnomaly(1.5, baseline, 0.99), '中位数附近的值不判为异常')
ok(!isAnomaly(1.5, [], 0.99), '空基线不判异常')

// 命题 6.4.5：频率判断
const records = [{ hit: true }, { hit: false }, { hit: true }]
eq(frequencyVerdict(records.slice(0, 2), 'hit').verdict, 'undetermined', '不足三次时判为未定')
eq(frequencyVerdict(records.slice(0, 2), 'hit').hits, 1, '记录命中次数')
eq(frequencyVerdict(records, 'hit').verdict, 'estimated', '记满三次后给出估计')
near(frequencyVerdict(records, 'hit').rate, 2 / 3, 1e-9, '命中率 2/3')
eq(frequencyVerdict([{ hit: false }, { hit: false }, { hit: false }], 'hit').verdict, 'estimated', '零命中但记满三次时频率可估为 0')
eq(frequencyVerdict([{ hit: false }, { hit: false }, { hit: false }], 'hit').rate, 0, '零命中的估计率为 0')
eq(frequencyVerdict([{ hit: false }], 'hit').verdict, 'undetermined', '只记一次时不作判断')

// 定义 6.4.4：排除
const results = [
  { hypothesis: 'H1', stillPresent: true },
  { hypothesis: 'H2', stillPresent: false },
  { hypothesis: 'H3', stillPresent: false },
]
const ro = ruleOut(results)
eq(ro.remaining, ['H1'], '现象仍在的假设未被排除')
eq(ro.ruledOut, ['H2', 'H3'], '现象消失的假设被排除')
ok(ro.unique, '只剩一个时 unique 为真')
ok(!ruleOut([{ hypothesis: 'H1', stillPresent: true }, { hypothesis: 'H2', stillPresent: true }]).unique, '剩两个时不唯一')
ok(!ruleOut([{ hypothesis: 'H1', stillPresent: false }]).unique, '全被排除时也不唯一')

// 定义 6.4.5 / 工具箱 5.3：反例最小化
const conds = ['A', 'B', 'C', 'D']
const repro = (c) => c.includes('B')
const min = minimizeRepro(conds, repro)
eq(min.minimal, ['B'], '最小反例收敛到必要的那一项')
eq(min.size, 1, '最小反例规模为 1')
ok(min.attempts <= conds.length * 2, '尝试次数与条件数同阶')
eq(minimizeRepro(['A', 'B'], (c) => c.length === 2).minimal, ['A', 'B'], '全部必要时保留全部')

// 命题 6.4.4：转化三条件
ok(canConvert({ prediction: 'faster', fact: 'slower', remaining: ['H1'], minimalRepro: ['X'] }).ok, '三条件齐备时通过')
ok(!canConvert({ fact: 'slower', remaining: ['H1'], minimalRepro: ['X'] }).checks.surprise, '缺预期时 surprise 为假')
ok(!canConvert({ prediction: 'faster', fact: 'faster', remaining: ['H1'], minimalRepro: ['X'] }).checks.surprise, '预期与事实相同时 surprise 为假')
ok(!canConvert({ prediction: 'faster', fact: 'slower', remaining: ['H1', 'H2'], minimalRepro: ['X'] }).checks.uniqueExplanation, '剩两个解释时不唯一')
ok(!canConvert({ prediction: 'faster', fact: 'slower', remaining: ['H1'], minimalRepro: [] }).checks.minimalRepro, '无最小反例时为假')

// 定义 6.4.6：两类问题
eq(classifyQuestion({ predictsNewPhenomenon: true }), 'mechanism', '指向新现象的判为机制问题')
eq(classifyQuestion({ predictsNewPhenomenon: false }), 'comparison', '不指向的判为比较问题')

// 工具箱 5.4：复现率区间
const w5 = wilson(5, 5)
near(w5.lo, 0.5655, 1e-3, '5 次全复现的 95% 区间下界约 0.566')
near(w5.hi, 1, 1e-9, '5 次全复现时上界为 1')
ok(wilson(3, 5).lo < w5.lo, '复现次数少时下界更低')
near(wilson(5, 5).p, 1, 1e-9, '点估计为 1')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
