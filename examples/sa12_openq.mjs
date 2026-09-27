// 6.1 配备算例：可回答性、三要素校验、信息量、覆盖率、清单分类。
//
// 每个函数对应讲义 6.1 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa12_openq.mjs
import { pathToFileURL } from 'node:url'

/**
 * 定义 6.1.1 / 6.1.2：校验三要素与判别程序。缺任何一项即拒绝入库。
 * @param question `{ dependent, independent, instrument, decide }`
 * @returns `{ ok, missing }`
 */
export function validate(question) {
  const missing = []
  if (!question.dependent) missing.push('因变量')
  if (!question.independent) missing.push('自变量')
  if (!question.instrument) missing.push('测量手段')
  if (typeof question.decide !== 'function') missing.push('判别程序')
  return { ok: missing.length === 0, missing }
}

/**
 * 定义 6.1.3：可回答性。因变量落在手段集内且代价不超过预算。
 * @param question 问题对象（含 instrument 与 cost） @param instruments 可用手段名数组 @param budget 预算
 * @returns 是否可回答
 */
export function answerable(question, instruments, budget) {
  if (!question.instrument || !instruments.includes(question.instrument)) return false
  return question.cost <= budget
}

/**
 * 定义 6.1.5：信息量。肯定方向 -log2(p)，否证方向 -log2(1-p)。
 * @param p 假设的先验概率 @param observed 'support' 或 'refute' @returns 比特数
 */
export function informationGain(p, observed = 'support') {
  if (p <= 0 || p >= 1) return 0
  return observed === 'support' ? -Math.log2(p) : -Math.log2(1 - p)
}

/**
 * 工具箱 5.1：二元熵，即混合方向期望信息量。p=0.5 时取最大值 1 比特。
 * @param p 假设的先验概率 @returns 比特数
 */
export function binaryEntropy(p) {
  if (p <= 0 || p >= 1) return 0
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p)
}

/**
 * 工具箱 5.3：因变量落在手段集覆盖范围内的问题占比。
 * @param questions 问题数组 @param instruments 手段名数组 @returns 覆盖率
 */
export function coverage(questions, instruments) {
  if (questions.length === 0) return 1
  const covered = questions.filter((q) => instruments.includes(q.instrument)).length
  return covered / questions.length
}

/**
 * 定义 6.1.6：清单分类。blocked-by-instrument 直接指出要先做哪个测量手段。
 * @param question 问题对象 @param instruments 手段名数组 @param budget 预算
 * @param prior 该问题对应假设的先验概率 @param iota 信息量阈值
 * @returns 'blocked-by-instrument' | 'settled' | 'active'
 */
export function classify(question, instruments, budget, prior, iota = 0.1) {
  if (!answerable(question, instruments, budget)) return 'blocked-by-instrument'
  if (binaryEntropy(prior) < iota) return 'settled'
  return 'active'
}

/**
 * 7.3：排序键。不可回答的排最后，其余按二元熵降序。
 * @param questions 问题数组 @param instruments 手段名数组 @param budget 预算
 * @param priorOf 取先验的函数 @returns 新数组
 */
export function rank(questions, instruments, budget, priorOf = () => 0.5) {
  return [...questions].sort((a, b) => {
    const ra = answerable(a, instruments, budget) ? 1 : 0
    const rb = answerable(b, instruments, budget) ? 1 : 0
    if (ra !== rb) return rb - ra
    return binaryEntropy(priorOf(b)) - binaryEntropy(priorOf(a))
  })
}

/**
 * 定义 6.1.4 / 7.5：分解的结构检查。语义上的蕴含关系仍需人工确认。
 * @param question 父问题 @param subquestions 子问题数组 @returns `{ ok, count, invalid }`
 */
export function decompose(question, subquestions) {
  const invalid = subquestions.map(validate).filter((r) => !r.ok)
  return {
    ok: subquestions.length > 0 && invalid.length === 0,
    count: subquestions.length,
    invalid,
  }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(40)} ${v}`)

  const q = {
    id: 'q1', dependent: '任务成功率', independent: '压缩阈值',
    instrument: 'bench-v1', decide: () => 'support', cost: 100,
  }
  line('校验（齐备）', JSON.stringify(validate(q).ok))
  line('校验（缺测量手段）', JSON.stringify(validate({ ...q, instrument: null }).missing))
  line('校验（缺判别程序）', JSON.stringify(validate({ ...q, decide: undefined }).missing))

  line('可回答（手段可用，预算足够）', answerable(q, ['bench-v1'], 200))
  line('可回答（手段缺失）', answerable(q, ['bench-v2'], 200))
  line('可回答（预算不足）', answerable(q, ['bench-v1'], 50))

  line('信息量 @ p=0.50（肯定）', informationGain(0.5).toFixed(4))
  line('信息量 @ p=0.95（肯定）', informationGain(0.95).toFixed(4))
  line('信息量 @ p=0.99（肯定）', informationGain(0.99).toFixed(4))
  line('信息量 @ p=0.95（否证）', informationGain(0.95, 'refute').toFixed(4))
  line('0.50 与 0.95 的比值', (informationGain(0.5) / informationGain(0.95)).toFixed(2) + ' 倍')
  line('二元熵 @ p=0.5', binaryEntropy(0.5).toFixed(4))
  line('二元熵 @ p=0.95', binaryEntropy(0.95).toFixed(4))

  const questions = [
    { ...q, id: 'a', instrument: 'bench-v1', cost: 100 },
    { ...q, id: 'b', instrument: 'bench-v2', cost: 100 },
    { ...q, id: 'c', instrument: 'bench-v1', cost: 5000 },
  ]
  line('覆盖率（手段只有 bench-v1）', coverage(questions, ['bench-v1']).toFixed(3))
  line('覆盖率（两者都有）', coverage(questions, ['bench-v1', 'bench-v2']).toFixed(3))
  line('分类（手段缺失）', classify(questions[1], ['bench-v1'], 1000, 0.5))
  line('分类（已基本确定）', classify(questions[0], ['bench-v1'], 1000, 0.99))
  line('分类（活跃）', classify(questions[0], ['bench-v1'], 1000, 0.5))

  const priors = { a: 0.95, b: 0.5, c: 0.5 }
  line('排序结果', rank(questions, ['bench-v1', 'bench-v2'], 1000, (x) => priors[x.id]).map((x) => x.id).join(' → '))

  line('分解（合法）', JSON.stringify(decompose(q, [q, q]).ok))
  line('分解（空）', JSON.stringify(decompose(q, []).ok))
  line('分解（含非法子问题）', decompose(q, [{ ...q, dependent: null }]).invalid.length)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
