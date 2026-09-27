// Part D 的判据（13 条）。对应讲义 4.3 与 CONTRACT.md 的「Part D」。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('user-model')
const s = createSuite('Part D · 用户模型', { weight: 15 })

const DAY = 86400000
const empty = () => ({ features: [] })
const obs = (kind, value = 'short', at = 0, key = 'answer-length') => ({ key, value, kind, at })

s.check('D1 同向的隐式观察累加（implicit = 1）', () => {
  const m1 = impl.applyObservation(empty(), obs('implicit'))
  const m2 = impl.applyObservation(m1, obs('implicit', 'short', 1))
  assert.eq(m2.features[0].weight, 2)
})

s.check('D2 显式声明的权重是 3（一次即达门槛）', () => {
  const m = impl.applyObservation(empty(), obs('explicit'))
  assert.eq(m.features[0].weight, 3)
})

s.check('D3 反向观察削弱（contradict = -2）', () => {
  let m = empty()
  for (const at of [0, 1, 2]) m = impl.applyObservation(m, obs('implicit', 'short', at))
  const m2 = impl.applyObservation(m, obs('contradict', 'long', 3))
  assert.eq(m2.features[0].weight, 1, '3 次隐式支持(3) 减一次反驳(2) 应为 1')
})

s.check('D4 反驳到零时删除该特征', () => {
  let m = impl.applyObservation(empty(), obs('implicit', 'short', 0))
  const m2 = impl.applyObservation(m, obs('contradict', 'long', 1))
  assert.eq(m2.features.length, 0, '权重归零应当删除，而不是留下空壳')
})

s.check('D5 无特征时反驳不创建特征', () => {
  const m = impl.applyObservation(empty(), obs('contradict'))
  assert.eq(m.features.length, 0)
})

s.check('D6 新建特征带 expiresAt 与 lastUpdatedAt', () => {
  const m = impl.applyObservation(empty(), obs('explicit', 'short', 100), { ttlDays: 10 })
  assert.eq(m.features[0].lastUpdatedAt, 100)
  assert.eq(m.features[0].expiresAt, 100 + 10 * DAY)
})

s.check('D7 不修改传入的 model', () => {
  const m = impl.applyObservation(empty(), obs('explicit'))
  const frozen = JSON.stringify(m)
  impl.applyObservation(m, obs('implicit', 'short', 1))
  assert.eq(JSON.stringify(m), frozen, '入参不应被修改')
})

s.check('D8 过期特征被删除（不是抑制）', () => {
  const m = impl.applyObservation(empty(), obs('explicit', 'short', 0), { ttlDays: 10 })
  const r = impl.decayAndDetect(m, 11 * DAY, {})
  assert.eq(r.model.features.length, 0)
})

s.check('D9 漂移报告：窗口内反驳达阈值时列出 key（按字典序）', () => {
  let m = empty()
  // 每个 key 给三次显式声明（weight 9），这样两次反驳之后特征仍然存在——
  // 否则它会因"归零即删除"而消失，那样 drifting 当然是空的（那是 D4 的正确行为）。
  for (const at0 of [0, 1, 2]) {
    m = impl.applyObservation(m, obs('explicit', 'short', at0, 'b-key'))
    m = impl.applyObservation(m, obs('explicit', 'short', at0, 'a-key'))
  }
  const at = 100 * DAY
  for (const k of ['b-key', 'a-key']) {
    m = impl.applyObservation(m, { key: k, value: 'other', kind: 'contradict', at })
    m = impl.applyObservation(m, { key: k, value: 'other', kind: 'contradict', at: at + 1 })
  }
  const r = impl.decayAndDetect(m, at + 2, { windowDays: 7, driftThreshold: 2 })
  assert.ok(r.drifting.length >= 1, '应当报告漂移')
  assert.eq(r.drifting.join(','), [...r.drifting].sort().join(','), '应当按字典序')
})

s.check('D10 注入：门槛以下的特征不生效', () => {
  const m = impl.applyObservation(empty(), obs('implicit')) // weight 1
  const spec = { length: 'default', format: 'plain', notes: [] }
  const out = impl.inject(m, spec, { threshold: 3 })
  assert.eq(out.length, 'default', '门槛以下的特征不应改变输出规格')
})

s.check('D11 注入：已确认的特征生效但不追加说明', () => {
  let m = empty()
  for (const at of [0, 1, 2]) m = impl.applyObservation(m, obs('explicit', 'short', at)) // weight 9
  const out = impl.inject(m, { length: 'default', format: 'plain', notes: [] }, { threshold: 3, confirmThreshold: 6 })
  assert.eq(out.length, 'short')
  assert.eq(out.notes.length, 0, '已确认的特征反复说明是噪音')
})

s.check('D12 注入：中等置信度时把推断说出来', () => {
  let m = empty()
  for (const at of [0, 1, 2]) m = impl.applyObservation(m, obs('implicit', 'short', at)) // weight 3
  const out = impl.inject(m, { length: 'default', format: 'plain', notes: [] }, { threshold: 3, confirmThreshold: 6 })
  assert.eq(out.notes.length, 1)
  assert.ok(out.notes[0].startsWith('按你以往的偏好：'), `说明应以固定前缀开头，实际「${out.notes[0]}」`)
})

s.check('D13 面向人的列表不暴露内部字段（weight）', () => {
  const m = impl.applyObservation(empty(), obs('explicit'))
  const list = impl.listFeatures(m)
  assert.ok(list.length === 1 && list[0].label && list[0].reason, '每项应含 label 与 reason')
  assert.ok(['已确认', '推测'].includes(list[0].confidence), `confidence 取值非法：${list[0].confidence}`)
  assert.ok(!JSON.stringify(list).includes('weight'), '不得暴露 weight 这个字段名')
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
