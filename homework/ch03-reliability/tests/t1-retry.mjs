// Part A 的判据（分析题）。对应讲义 3.1 与 kit/problems/a-retry.questions.md。
//
// 用法：node tests/t1-retry.mjs --answers kit/answers/a-retry.json
import { readFileSync } from 'node:fs'
import { createSuite, assert, report } from './harness.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--answers')
const path = i >= 0 ? args[i + 1] : 'kit/answers/a-retry.json'

const s = createSuite('Part A · 重试与错误分类', { weight: 15 })

/** 分类题的答案表（与题目文件一致）。 */
const ANSWER_KEY = {
  e1: 'retryable', e2: 'retryable', e3: 'unknown', e4: 'retryable',
  e5: 'retryable', e6: 'unknown', e7: 'retryable', e8: 'needs-human',
  e9: 'retryable', e10: 'fatal', e11: 'needs-human', e12: 'fatal',
}

/** reason 需要提到的依据关键词（任一即可）。 */
const REASON_KEYWORDS = ['类型', '状态', '幂等', '副作用', '限流', '超时']

/** 策略题的期望关键词（任一即可），以及题目要求的"含条件"。 */
const POLICY_KEYWORDS = {
  p1: ['退避', '预算', '上限', '次数'],
  p2: ['幂等', '查询', '确认', '核实'],
  p3: ['预算', '剩余', '不超过', '上限'],
}

let data = null
let loadError = null
try {
  data = JSON.parse(readFileSync(path, 'utf8'))
} catch (e) {
  loadError = e.message
}

s.check('A1 答案文件可读且结构齐全', () => {
  assert.ok(!loadError, `无法读取 ${path}：${loadError}`)
  for (const k of ['classification', 'policies', 'counterexamples']) {
    assert.ok(Array.isArray(data[k]), `缺少数组字段：${k}`)
  }
})

const cls = () => data.classification ?? []
const pol = () => data.policies ?? []
const cex = () => data.counterexamples ?? []

s.check('A2 分类项数与 id 齐全', () => {
  assert.eq(cls().length, 12, '应有 12 项分类')
  const ids = cls().map((x) => x.id).sort().join(',')
  assert.eq(ids, Object.keys(ANSWER_KEY).sort().join(','))
})

s.check('A3 12 个分类全部正确（8 分）', () => {
  const wrong = cls().filter((x) => x.answer !== ANSWER_KEY[x.id])
  assert.ok(wrong.length === 0, `分类错误 ${wrong.length} 项：${wrong.map((w) => `${w.id}=${w.answer || '空'}`).join('、')}`)
})

s.check('A4 每条 reason 非空且提到依据（3 分）', () => {
  const bad = cls().filter((x) => !x.reason || !REASON_KEYWORDS.some((k) => String(x.reason).includes(k)))
  assert.ok(bad.length === 0, `有 ${bad.length} 条理由未提到依据：${bad.map((b) => b.id).join('、')}`)
})

s.check('A5 策略题 3 项且判断与讲义一致（3 分）', () => {
  assert.eq(pol().length, 3, '应有 3 项策略题')
  const bad = pol().filter((x) => {
    const keys = POLICY_KEYWORDS[x.id] ?? []
    const text = `${x.answer ?? ''} ${x.reason ?? ''}`
    return keys.length > 0 && !keys.some((k) => text.includes(k))
  })
  assert.ok(bad.length === 0, `有 ${bad.length} 项未体现讲义依据：${bad.map((b) => b.id).join('、')}`)
})

s.check('A6 反例 2 项且含条件与后果（1 分）', () => {
  assert.eq(cex().length, 2, '应有 2 项反例')
  for (const c of cex()) {
    assert.ok(c.answer && String(c.answer).length > 10, `${c.id} 的场景描述过短`)
    assert.ok(c.reason && String(c.reason).length > 10, `${c.id} 的后果描述过短`)
    assert.ok(Array.isArray(c.conditions) && c.conditions.length > 0, `${c.id} 必须给出至少一项条件`)
  }
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
