// Part B 的判据（分析题）。对应讲义 6.3 与 kit/problems/b-observations.questions.md。
import { readFileSync } from 'node:fs'
import { createSuite, assert, report } from './harness.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--answers')
const path = i >= 0 ? args[i + 1] : 'kit/answers/b-observations.json'
const s = createSuite('Part B · 观察与转化', { weight: 20 })

/** 观察的答案表。 */
const KIND_KEY = {
  o1: ['log', 'surprise'],
  o2: ['log', 'anomaly'],
  o3: ['skip', null],
  o4: ['log', 'silent-deviation'],
  o5: ['skip', null],
  o6: ['log', 'surprise'],
}
const HOW = ['lookup', 'experiment', 'counterexample']

let data = null
let loadError = null
try { data = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { loadError = e.message }

s.check('B1 答案文件可读且结构齐全', () => {
  assert.ok(!loadError, `无法读取 ${path}：${loadError}`)
  for (const k of ['observations', 'rulings', 'repros']) assert.ok(Array.isArray(data[k]), `缺少数组字段：${k}`)
})

s.check('B2 observations 有 6 项且 id 齐全', () => {
  assert.eq(data.observations.length, 6)
  assert.eq(data.observations.map((o) => o.id).sort().join(','), Object.keys(KIND_KEY).sort().join(','))
})

s.check('B3 6 条记录判定与类别正确，surprise 必须写 expected', () => {
  for (const o of data.observations) {
    const [decision, kind] = KIND_KEY[o.id]
    assert.eq(o.decision, decision, `${o.id} 的 decision`)
    if (kind) assert.eq(o.kind, kind, `${o.id} 的 kind`)
    if (o.decision === 'log') {
      assert.ok(String(o.observed ?? '').length > 0, `${o.id} 应当记录实际观察`)
      assert.ok(Array.isArray(o.conditions) && o.conditions.length > 0, `${o.id} 应当记录条件`)
    }
    if (o.kind === 'surprise') {
      assert.ok(String(o.expected ?? '').length > 0, `${o.id} 是意外，必须写清预期（没有预期就没有意外）`)
    }
  }
})

s.check('B4 rulings 有 4 项，每项至少三个解释且含平凡解释', () => {
  assert.eq(data.rulings.length, 4)
  for (const r of data.rulings) {
    assert.ok(Array.isArray(r.explanations) && r.explanations.length >= 3, `${r.id} 至少需要三个解释`)
    const kinds = r.explanations.map((e) => e.kind)
    assert.ok(kinds.includes('mundane'), `${r.id} 必须包含平凡解释（例如"我读错了数字"）`)
    assert.ok(r.explanations.every((e) => String(e.text ?? '').length > 0), `${r.id} 有空的解释文本`)
    assert.ok(String(r.remaining ?? '').length > 0, `${r.id} 缺少"剩下的是哪一个"`)
    assert.ok(HOW.includes(r.how), `${r.id} 的排除方式非法：${r.how}`)
  }
})

s.check('B5 repros 有 3 项，含至少两步与最简性说明', () => {
  assert.eq(data.repros.length, 3)
  for (const m of data.repros) {
    assert.ok(Array.isArray(m.steps) && m.steps.length >= 2, `${m.id} 至少两步`)
    assert.ok(m.steps.every((x) => String(x).length > 0), `${m.id} 有空步骤`)
    assert.ok(String(m.expected ?? '').length > 0, `${m.id} 缺少预期`)
    assert.ok(String(m.observed ?? '').length > 0, `${m.id} 缺少实际观察`)
    assert.ok(String(m.minimality ?? '').length > 0, `${m.id} 必须说明"每一步为什么必要"`)
  }
})

s.check('B6 至少有一条 silent-deviation（三类落差都应当出现）', () => {
  const kinds = new Set(data.observations.map((o) => o.kind).filter(Boolean))
  assert.ok(kinds.has('silent-deviation'), '应当至少有一条"无声的偏离"')
  assert.ok(kinds.has('surprise'), '应当至少有一条意外')
  assert.ok(kinds.has('anomaly'), '应当至少有一条异常')
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
