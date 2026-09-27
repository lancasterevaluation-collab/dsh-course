// 6.4 配备算例：意外检测、记录校验、频率判断、排除、反例最小化、复现区间。
//
// 每个函数对应讲义 6.4 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa14_observation.mjs
import { pathToFileURL } from 'node:url'

/** 定义 6.4.3：观察记录的固定字段。字段固定才能比对。 */
export const RECORD_FIELDS = ['task', 'config', 'metric', 'before', 'after', 'trials', 'timestamp']

/**
 * 定义 6.4.3：校验记录字段是否齐备。
 * @param record 记录对象 @returns `{ ok, missing }`
 */
export function validateRecord(record) {
  const missing = RECORD_FIELDS.filter((k) => record[k] === undefined || record[k] === null)
  return { ok: missing.length === 0, missing }
}

/**
 * 命题 6.4.1：意外检测。要求预测事先写成断言（expected）。
 * @param assertions `[{ name, expected, observed }]` @returns 冲突项数组
 */
export function detectSurprises(assertions) {
  return assertions.filter((a) => a.expected !== a.observed)
}

/**
 * 定义 6.4.2 / 工具箱：异常判定——落在基线分布的尾部区域。
 * @param x 观测值 @param baseline 基线样本 @param q 尾部分位 @returns 是否异常
 */
export function isAnomaly(x, baseline, q = 0.99) {
  if (baseline.length === 0) return false
  const sorted = [...baseline].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return x > sorted[idx]
}

/**
 * 命题 6.4.5：同一现象记满 minTrials 次之前不判断频率。
 * @param records 记录数组 @param key 事件字段名 @param minTrials 最少记录次数
 * @returns `{ verdict, hits, rate?, reason? }`
 */
export function frequencyVerdict(records, key, minTrials = 3) {
  const hits = records.filter((r) => r[key] === true).length
  // 判据是观测条数而不是命中次数：命题 6.4.5 要求的是"同一现象记录三次"
  if (records.length < minTrials) return { verdict: 'undetermined', hits, reason: `观测 ${records.length} 次，不足 ${minTrials} 次` }
  return { verdict: 'estimated', hits, rate: hits / records.length }
}

/**
 * 定义 6.4.4：排除——若假设成立则现象应消失；现象仍在则排除该假设。
 * @param results `[{ hypothesis, stillPresent }]`
 * @returns `{ remaining, ruledOut, unique }`
 */
export function ruleOut(results) {
  const remaining = results.filter((r) => r.stillPresent).map((r) => r.hypothesis)
  const ruledOut = results.filter((r) => !r.stillPresent).map((r) => r.hypothesis)
  return { remaining, ruledOut, unique: remaining.length === 1 }
}

/**
 * 定义 6.4.5 / 工具箱 5.3：贪心最小化反例——逐个尝试移除，移除后不再复现则保留。
 * @param conditions 完整条件集 @param repro 复现判定（接受条件集，返回是否复现）
 * @returns `{ minimal, size, attempts }`
 */
export function minimizeRepro(conditions, repro) {
  let c = [...conditions]
  let attempts = 0
  let i = 0
  while (i < c.length) {
    const trial = c.filter((_, k) => k !== i)
    attempts++
    if (repro(trial)) { c = trial } else { i++ }
  }
  return { minimal: c, size: c.length, attempts }
}

/**
 * 命题 6.4.4：转化三条件——有冲突的预期、解释只剩一个、有最小反例。
 * @param observation `{ prediction, fact, remaining, minimalRepro }`
 * @returns `{ ok, checks }`
 */
export function canConvert(observation) {
  const checks = {
    surprise: observation.prediction !== undefined && observation.prediction !== observation.fact,
    uniqueExplanation: Array.isArray(observation.remaining) && observation.remaining.length === 1,
    minimalRepro: Array.isArray(observation.minimalRepro) && observation.minimalRepro.length > 0,
  }
  return { ok: checks.surprise && checks.uniqueExplanation && checks.minimalRepro, checks }
}

/**
 * 定义 6.4.6：两类问题的判别——答案是否指向一个可预测的新现象。
 * @param question `{ predictsNewPhenomenon }` @returns 'mechanism' | 'comparison'
 */
export function classifyQuestion(question) {
  return question.predictsNewPhenomenon ? 'mechanism' : 'comparison'
}

/**
 * 工具箱 5.4：Wilson 区间（与 6.3 同一方法）。
 * @param successes 复现次数 @param n 尝试次数 @param z 分位数
 * @returns `{ p, lo, hi }`
 */
export function wilson(successes, n, z = 1.96) {
  const p = successes / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return { p, lo: center - half, hi: center + half }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(42)} ${v}`)

  const rec = { task: 't1', config: { threshold: 0.8 }, metric: 'latency', before: 1.2, after: 8.4, trials: 5, timestamp: '2026-09-01' }
  line('记录校验（齐备）', JSON.stringify(validateRecord(rec).ok))
  line('记录校验（缺 trials）', JSON.stringify(validateRecord({ ...rec, trials: null }).missing))

  const assertions = [
    { name: 'a1', expected: 'faster', observed: 'faster' },
    { name: 'a2', expected: 'faster', observed: 'slower' },
  ]
  line('意外检测', JSON.stringify(detectSurprises(assertions).map((a) => a.name)))

  const baseline = [...Array(100)].map((_, i) => 1 + i / 100)
  line('异常判定（x=1.995）', isAnomaly(1.995, baseline, 0.99))
  line('异常判定（x=1.5）', isAnomaly(1.5, baseline, 0.99))

  const records = [{ hit: true }, { hit: false }, { hit: true }]
  line('频率判断（记 2 次）', JSON.stringify(frequencyVerdict(records.slice(0, 2), 'hit')))
  line('频率判断（记 3 次）', JSON.stringify(frequencyVerdict(records, 'hit')))

  const results = [
    { hypothesis: 'H1（缓存）', stillPresent: true },
    { hypothesis: 'H2（网络）', stillPresent: false },
    { hypothesis: 'H3（并发）', stillPresent: false },
  ]
  line('排除结果', JSON.stringify(ruleOut(results)))

  const conds = ['任务类型 A', '阈值 0.8', '并发 4', '重试 3 次']
  const repro = (c) => c.includes('任务类型 A') && c.includes('阈值 0.8')
  const min = minimizeRepro(conds, repro)
  line('最小反例', JSON.stringify(min.minimal) + `（尝试 ${min.attempts} 次）`)

  line('转化三条件（齐备）', JSON.stringify(canConvert({ prediction: 'faster', fact: 'slower', remaining: ['H1'], minimalRepro: ['阈值 0.8'] })))
  line('转化三条件（缺最小反例）', JSON.stringify(canConvert({ prediction: 'faster', fact: 'slower', remaining: ['H1'], minimalRepro: [] }).checks))

  line('问题分类（指向新现象）', classifyQuestion({ predictsNewPhenomenon: true }))
  line('问题分类（不指向）', classifyQuestion({ predictsNewPhenomenon: false }))

  const w = wilson(5, 5)
  line('5 次全复现的 95% 区间', `[${w.lo.toFixed(3)}, ${w.hi.toFixed(3)}]`)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
