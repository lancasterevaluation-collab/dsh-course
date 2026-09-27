// Part A 的判据（分析题）。对应讲义 4.1、4.2 与 kit/problems/a-memory.questions.md。
//
// 用法：node tests/t1-memory-policy.mjs --answers kit/answers/a-memory.json
import { readFileSync } from 'node:fs'
import { createSuite, assert, report } from './harness.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--answers')
const path = i >= 0 ? args[i + 1] : 'kit/answers/a-memory.json'

const s = createSuite('Part A · 写入与触发策略', { weight: 15 })

/** 写入判定与类别的答案表（与题目文件一致）。 */
const ANSWER_KEY = {
  m1: ['skip', null], m2: ['write', 'fact'], m3: ['write', 'inference'],
  m4: ['skip', null], m5: ['write', 'fact'], m6: ['skip', null],
  m7: ['write', 'preference'], m8: ['write', 'inference'], m9: ['write', 'fact'],
  m10: ['skip', null], m11: ['write', 'preference'], m12: ['skip', null],
}

const FILTER_KEYWORDS = ['跨会话', '可验证', '临时']

let data = null
let loadError = null
try {
  data = JSON.parse(readFileSync(path, 'utf8'))
} catch (e) {
  loadError = e.message
}

s.check('A1 答案文件可读且结构齐全', () => {
  assert.ok(!loadError, `无法读取 ${path}：${loadError}`)
  for (const k of ['writes', 'skills', 'bounded']) assert.ok(Array.isArray(data[k]), `缺少数组字段：${k}`)
})

s.check('A2 writes 有 12 项且 id 齐全', () => {
  assert.eq(data.writes.length, 12)
  assert.eq(data.writes.map((w) => w.id).sort().join(','), Object.keys(ANSWER_KEY).sort().join(','))
})

s.check('A3 12 个写入判定与类别正确', () => {
  const wrong = data.writes.filter((w) => {
    const [dec, kind] = ANSWER_KEY[w.id]
    if (w.decision !== dec) return true
    if (dec === 'write') return w.kind !== kind
    return false
  })
  assert.ok(wrong.length === 0, `判定错误 ${wrong.length} 项：${wrong.map((w) => `${w.id}=${w.decision}/${w.kind}`).join('、')}`)
})

s.check('A4 每条 reason 非空且提到三个过滤器之一', () => {
  const bad = data.writes.filter((w) => !w.reason || !FILTER_KEYWORDS.some((k) => String(w.reason).includes(k)))
  assert.ok(bad.length === 0, `有 ${bad.length} 条理由未提到过滤器：${bad.map((b) => b.id).join('、')}`)
})

s.check('A5 skills：6 条，描述写成触发条件且含不适用条件', () => {
  assert.eq(data.skills.length, 6)
  for (const sk of data.skills) {
    const d = String(sk.description ?? '')
    assert.ok(d.length > 0, `${sk.id} 缺少 description`)
    assert.ok(!/^(关于|本技能)/.test(d), `${sk.id} 的描述像是在写主题（不得以「关于」「本技能」开头）`)
    assert.ok(String(sk.doesNotApplyWhen ?? '').length > 0, `${sk.id} 缺少 doesNotApplyWhen`)
  }
})

s.check('A6 bounded：2 项，含动作与依据', () => {
  assert.eq(data.bounded.length, 2)
  for (const b of data.bounded) {
    assert.ok(b.action && String(b.action).length > 5, `${b.id} 的动作描述过短`)
    assert.ok(b.reason && String(b.reason).length > 5, `${b.id} 的依据过短`)
  }
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
