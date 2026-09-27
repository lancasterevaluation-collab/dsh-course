// Part A 的判据（分析题）。对应讲义 6.1 与 kit/problems/a-problems.questions.md。
import { readFileSync } from 'node:fs'
import { createSuite, assert, report } from './harness.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--answers')
const path = i >= 0 ? args[i + 1] : 'kit/answers/a-problems.json'
const s = createSuite('Part A · 问题清单', { weight: 25 })

/** 分界的答案表。 */
const KIND_KEY = {
  q1: ['engineering', 'resource-test'],
  q2: ['open', 'missing-measure'],
  q3: ['engineering', 'resource-test'],
  q4: ['open', 'missing-measure'],
  q5: ['open', 'missing-measure'],
  q6: ['engineering', 'resource-test'],
  q7: ['not-answerable', 'answer-shape'],
  q8: ['open', 'missing-measure'],
}
const INSTRUMENTS = ['check', 'human-label', 'model-judge']
const BASELINES = ['ablation', 'comparison', 'sweep']

let data = null
let loadError = null
try { data = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { loadError = e.message }

s.check('A1 答案文件可读且结构齐全', () => {
  assert.ok(!loadError, `无法读取 ${path}：${loadError}`)
  for (const k of ['classifications', 'formulations', 'decisions']) assert.ok(Array.isArray(data[k]), `缺少数组字段：${k}`)
})

s.check('A2 classifications 有 8 项且 id 齐全', () => {
  assert.eq(data.classifications.length, 8)
  assert.eq(data.classifications.map((c) => c.id).sort().join(','), Object.keys(KIND_KEY).sort().join(','))
})

s.check('A3 8 条分类与判据正确，且 open / not-answerable 给出 missing', () => {
  for (const c of data.classifications) {
    const [kind, criterion] = KIND_KEY[c.id]
    assert.eq(c.kind, kind, `${c.id} 的 kind`)
    assert.eq(c.criterion, criterion, `${c.id} 的 criterion`)
    if (kind !== 'engineering') {
      assert.ok(Array.isArray(c.missing) && c.missing.length > 0, `${c.id} 是 ${kind}，必须给出 missing`)
    }
  }
})

s.check('A4 formulations 有 5 项，自变量至少两个取值且因变量带测量手段', () => {
  assert.eq(data.formulations.length, 5)
  for (const f of data.formulations) {
    assert.ok(f.independent?.name, `${f.id} 缺少自变量名`)
    assert.ok(Array.isArray(f.independent?.values) && f.independent.values.length >= 2, `${f.id} 的自变量至少两个取值`)
    assert.ok(f.dependent?.name, `${f.id} 缺少因变量名`)
    assert.ok(INSTRUMENTS.includes(f.dependent?.instrument), `${f.id} 的测量手段非法：${f.dependent?.instrument}`)
    assert.ok(BASELINES.includes(f.baseline?.kind), `${f.id} 的基准类型非法：${f.baseline?.kind}`)
    assert.ok(String(f.baseline?.what ?? '').length > 0, `${f.id} 缺少基准说明`)
  }
})

s.check('A5 decisions 有 4 项，且两种答案对应的行动不同', () => {
  assert.eq(data.decisions.length, 4)
  for (const d of data.decisions) {
    assert.ok(String(d.ifA ?? '').length > 0 && String(d.ifB ?? '').length > 0, `${d.id} 缺少 ifA 或 ifB`)
    assert.ok(d.ifA !== d.ifB, `${d.id} 的两种答案对应相同行动——那说明它没有决策影响`)
    assert.eq(typeof d.worthDoing, 'boolean', `${d.id} 的 worthDoing 必须是布尔值`)
  }
})

s.check('A6 至少有一条 engineering 与一条 open（两类都必须出现）', () => {
  const kinds = new Set(data.classifications.map((c) => c.kind))
  assert.ok(kinds.has('engineering'), '应当至少有一条工程难题')
  assert.ok(kinds.has('open'), '应当至少有一条开放问题')
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
