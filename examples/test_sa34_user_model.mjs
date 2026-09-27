// 4.3 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  WEIGHT, THRESHOLD, CONFIRM_THRESHOLD, applyObservation, decayAndDetect,
  applyFeature, inject, describe, summarizeEvidence, listFeatures, deleteFeature,
} from './sa34_user_model.mjs'

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

// 定义 4.3.2 / 4.3.4：权重表与门槛
{
  eq(WEIGHT, { explicit: 3, implicit: 1, contradict: -2 }, '权重表的三项')
  eq(THRESHOLD, 3, '注入门槛是 3')
  eq(CONFIRM_THRESHOLD, 5, '已确认档位是 5')
  ok(Math.abs(WEIGHT.contradict) > WEIGHT.implicit, '反驳的绝对值大于隐式支持')
  ok(WEIGHT.explicit > WEIGHT.implicit, '显式权重高于隐式')
  eq(WEIGHT.contradict + WEIGHT.explicit + WEIGHT.implicit, 2, '三项之和')
}

// 定义 4.3.3 / 命题 4.3.1 / 4.3.3：更新
{
  let m = new Map()
  m = applyObservation(m, { key: 'k', value: 'v', kind: 'implicit', at: 1 })
  eq(m.get('k').weight, 1, '一次隐式后权重是 1')
  ok(m.get('k').weight < THRESHOLD, '一次隐式未达门槛')
  m = applyObservation(m, { key: 'k', value: 'v', kind: 'implicit', at: 2 })
  eq(m.get('k').weight, 2, '两次隐式后权重是 2')
  m = applyObservation(m, { key: 'k', value: 'v', kind: 'implicit', at: 3 })
  eq(m.get('k').weight, 3, '三次隐式后权重是 3')
  ok(m.get('k').weight >= THRESHOLD, '三次隐式达到门槛')
  eq(m.get('k').evidence.length, 3, '三条证据被保留')
  eq(m.get('k').expiresAt, 3 + 90, '保留期默认九十天')
}
{
  let m = applyObservation(new Map(), { key: 'k', value: 'v', kind: 'explicit', at: 1 })
  eq(m.get('k').weight, 3, '一次显式后权重是 3')
  ok(m.get('k').weight >= THRESHOLD, '一次显式即达门槛')
  eq(m.get('k').evidence.length, 1, '显式只需一条证据')
}
{
  let m = new Map()
  for (let i = 1; i <= 3; i++) m = applyObservation(m, { key: 'k', value: 'v', kind: 'implicit', at: i })
  m = applyObservation(m, { key: 'k', value: 'other', kind: 'contradict', at: 4 })
  eq(m.get('k').weight, 1, '三次隐式后一次反驳降到 1')
  ok(m.get('k').weight < THRESHOLD, '反驳后落回门槛之下')
  m = applyObservation(m, { key: 'k', value: 'other', kind: 'contradict', at: 5 })
  ok(!m.has('k'), '再反驳一次归零即删')
}
{
  let m = applyObservation(new Map(), { key: 'k', value: 'v', kind: 'explicit', at: 1 })
  m = applyObservation(m, { key: 'k', value: 'v', kind: 'explicit', at: 2 })
  eq(m.get('k').weight, 6, '两次显式累加到 6')
  eq(m.get('k').evidence.length, 2, '两次显式的证据都在')
}
{
  const empty = applyObservation(new Map(), { key: 'k', value: 'v', kind: 'contradict', at: 1 })
  eq(empty.size, 0, '无特征时反驳不创建特征')
  eq(empty.has('k'), false, '反驳不会凭空建出反向偏好')
}
{
  // 值变化时的路径：先削弱，不新建
  let m = applyObservation(new Map(), { key: 'k', value: 'short', kind: 'implicit', at: 1 })
  m = applyObservation(m, { key: 'k', value: 'short', kind: 'implicit', at: 2 })
  m = applyObservation(m, { key: 'k', value: 'short', kind: 'implicit', at: 3 })
  m = applyObservation(m, { key: 'k', value: 'long', kind: 'implicit', at: 4 })
  eq(m.get('k').weight, 1, '反向的隐式观察按反驳权重削弱')
  eq(m.get('k').value, 'short', '削弱时不改变特征的取值')
}

// 定义 4.3.5：衰减与漂移
{
  let m = new Map()
  m = applyObservation(m, { key: 'k', value: 'v', kind: 'explicit', at: 1 })
  m = applyObservation(m, { key: 'k', value: 'v', kind: 'explicit', at: 2 })
  m = applyObservation(m, { key: 'k', value: 'x', kind: 'contradict', at: 10 })
  m = applyObservation(m, { key: 'k', value: 'x', kind: 'contradict', at: 12 })
  const detected = decayAndDetect(m, 13)
  eq(detected.drifting, ['k'], '一周内两次反驳被报为漂移')
  ok(detected.model.has('k'), '漂移报告不自动删除特征')
  const outside = decayAndDetect(m, 30)
  eq(outside.drifting, [], '超出时间窗的反驳不计入漂移')
}
{
  const stale = new Map([
    ['old', { key: 'old', value: 'x', weight: 3, evidence: [], lastUpdatedAt: 0, expiresAt: 5 }],
    ['fresh', { key: 'fresh', value: 'y', weight: 3, evidence: [], lastUpdatedAt: 0, expiresAt: 50 }],
  ])
  const r = decayAndDetect(stale, 10)
  ok(!r.model.has('old'), '过期特征被清除')
  ok(r.model.has('fresh'), '未过期特征被保留')
  eq(r.model.size, 1, '清除后只剩一条')
}
{
  eq(decayAndDetect(new Map(), 100).drifting, [], '空模型没有漂移')
  eq(decayAndDetect(new Map(), 100).model.size, 0, '空模型仍为空')
}

// 定义 4.3.4 / 命题 4.3.4：注入
{
  const weak = new Map([['k', { key: 'answer-length', value: 'short', weight: 1, evidence: [], lastUpdatedAt: 0, expiresAt: 99 }]])
  const out = inject(weak, { verbosity: 'normal' })
  eq(out.spec.verbosity, 'normal', '未达门槛时不改变输出规格')
  eq(out.notices.length, 0, '未达门槛时不附带说明')
}
{
  const mid = new Map([['k', { key: 'answer-length', value: 'short', weight: 3, evidence: [], lastUpdatedAt: 0, expiresAt: 99 }]])
  const out = inject(mid, { verbosity: 'normal' })
  eq(out.spec.verbosity, 'short', '达门槛时改变输出规格')
  eq(out.notices.length, 1, '达门槛时附带一条说明')
  ok(out.notices[0].includes('按你以往的偏好'), '说明的措辞')
  ok(!('skill' in out.spec), '注入不改变方法选择')
  eq(Object.keys(out.spec).length, 1, '注入只改输出规格的字段')
}
{
  const confirmed = new Map([['k', { key: 'answer-length', value: 'short', weight: 6, evidence: [], lastUpdatedAt: 0, expiresAt: 99 }]])
  const out = inject(confirmed, { verbosity: 'normal' })
  eq(out.spec.verbosity, 'short', '已确认的特征仍然生效')
  eq(out.notices.length, 0, '已确认的特征不再附带说明')
}
{
  eq(applyFeature({}, { key: 'explain-level', value: 'deep' }).explain, 'deep', '解释深度可被调整')
  eq(applyFeature({}, { key: 'interaction-pace', value: 'careful' }).confirmFirst, true, '节奏可被调整')
  eq(applyFeature({}, { key: 'unknown-key', value: 'x' }), {}, '未知特征不改变规格')
}

// 定义 4.3.1 / 4.3.6：边界
{
  const f = { key: 'answer-length', value: 'short', weight: 6, evidence: [{ kind: 'implicit' }, { kind: 'implicit' }, { kind: 'explicit' }], lastUpdatedAt: 3, expiresAt: 93 }
  eq(describe(f), 'answer-length 倾向 short', '特征被写成人话')
  ok(summarizeEvidence(f.evidence).startsWith('因为'), '理由以“因为”开头')
  ok(summarizeEvidence(f.evidence).includes('2 次implicit'), '理由含隐式次数')
  ok(summarizeEvidence(f.evidence).includes('1 次explicit'), '理由含显式次数')
}
{
  const model = new Map([
    ['a', { key: 'answer-length', value: 'short', weight: 6, evidence: [{ kind: 'explicit' }], lastUpdatedAt: 0, expiresAt: 99 }],
    ['b', { key: 'explain-level', value: 'deep', weight: 3, evidence: [{ kind: 'implicit' }], lastUpdatedAt: 0, expiresAt: 99 }],
  ])
  const shown = listFeatures(model)
  eq(shown.length, 2, '清单列出全部特征')
  eq(Object.keys(shown[0]).sort(), ['confidence', 'label', 'reason'], '清单不含内部字段')
  ok(!JSON.stringify(shown).includes('weight'), '清单里没有权重')
  eq(shown[0].confidence, '已确认', '高置信度被标为已确认')
  eq(shown[1].confidence, '推测', '中置信度被标为推测')
}
{
  const model = new Map([['a', { key: 'answer-length', value: 'short', weight: 6, evidence: [], lastUpdatedAt: 0, expiresAt: 99 }]])
  const events = []
  const after = deleteFeature(model, 'a', events, 20)
  eq(after.has('a'), false, '删除是物理删除')
  eq(after.size, 0, '删除后模型为空')
  eq(events.length, 1, '删除动作被记录')
  eq(events[0].type, 'user-model/delete', '事件类型正确')
  eq(events[0].key, 'a', '事件记录特征名')
  ok(!JSON.stringify(events[0]).includes('short'), '删除事件不含内容')
  eq(model.has('a'), true, '删除不修改原模型（返回新表）')
}
{
  near(Math.abs(WEIGHT.contradict) / WEIGHT.implicit, 2, 1e-9, '一次反驳抵消两次隐式支持')
  near(WEIGHT.explicit / WEIGHT.implicit, 3, 1e-9, '显式是隐式的三倍')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
