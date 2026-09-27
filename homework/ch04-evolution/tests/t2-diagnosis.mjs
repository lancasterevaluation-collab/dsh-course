// Part B 的判据（分析题）。对应讲义 4.4 与 kit/problems/b-diagnosis.questions.md。
//
// 用法：node tests/t2-diagnosis.mjs --answers kit/answers/b-diagnosis.json
import { readFileSync } from 'node:fs'
import { createSuite, assert, report } from './harness.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--answers')
const path = i >= 0 ? args[i + 1] : 'kit/answers/b-diagnosis.json'

const s = createSuite('Part B · 诊断与可行动性', { weight: 15 })

/** 失败类型的答案表。 */
const KIND_KEY = {
  f1: 'silent', f2: 'error', f3: 'goal-miss', f4: 'error', f5: 'error',
  f6: 'silent', f7: 'goal-miss', f8: 'silent', f9: 'silent',
}

const EVIDENCE = ['correlation', 'counterfactual', 'reproducible']
const TARGET_KINDS = ['prompt', 'threshold', 'tool-desc', 'skill-condition', 'config']
const BANNED = ['模型能力', '用户表达']

let data = null
let loadError = null
try {
  data = JSON.parse(readFileSync(path, 'utf8'))
} catch (e) {
  loadError = e.message
}

s.check('B1 答案文件可读且结构齐全', () => {
  assert.ok(!loadError, `无法读取 ${path}：${loadError}`)
  assert.ok(Array.isArray(data.failures), '缺少 failures 数组')
  assert.ok(Array.isArray(data.rewrites), '缺少 rewrites 数组')
})

s.check('B2 failures 有 9 项且 id 齐全', () => {
  assert.eq(data.failures.length, 9)
  assert.eq(data.failures.map((f) => f.id).sort().join(','), Object.keys(KIND_KEY).sort().join(','))
})

s.check('B3 9 个失败类型正确', () => {
  const wrong = data.failures.filter((f) => f.kind !== KIND_KEY[f.id])
  assert.ok(wrong.length === 0, `类型错误 ${wrong.length} 项：${wrong.map((w) => `${w.id}=${w.kind || '空'}`).join('、')}`)
})

s.check('B4 每个场景至少两个候选，且证据取值合法', () => {
  for (const f of data.failures) {
    assert.ok(Array.isArray(f.candidates) && f.candidates.length >= 2, `${f.id} 至少需要两个候选（强制比较）`)
    for (const c of f.candidates) {
      assert.ok(c.cause && String(c.cause).length > 4, `${f.id} 的候选描述过短`)
      assert.ok(EVIDENCE.includes(c.evidence), `${f.id} 的证据取值非法：${c.evidence}`)
    }
  }
})

s.check('B5 至少有一项候选的证据是反事实或可复现', () => {
  const strong = data.failures.some((f) => (f.candidates ?? []).some((c) => c.evidence === 'counterfactual' || c.evidence === 'reproducible'))
  assert.ok(strong, '九个场景的证据全是相关性——那说明没有做任何验证')
})

s.check('B6 rewrites：5 条，含可改对象且不含禁用短语', () => {
  assert.eq(data.rewrites.length, 5)
  for (const r of data.rewrites) {
    const text = String(r.rewritten ?? '')
    assert.ok(text.length > 8, `${r.id} 的改写过短`)
    for (const b of BANNED) assert.ok(!text.includes(b), `${r.id} 的改写里出现了不可行动的原型「${b}」`)
    assert.ok(TARGET_KINDS.includes(r.targetKind), `${r.id} 的对象类别非法：${r.targetKind}`)
  }
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
