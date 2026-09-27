// 4.3 用户建模的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/** 定义 4.3.2：权重表——反驳的绝对值大于隐式支持。 */
export const WEIGHT = { explicit: 3, implicit: 1, contradict: -2 }

/** 定义 4.3.4：注入门槛。 */
export const THRESHOLD = 3

/** 定义 4.3.4：已确认的档位——不再附带说明。 */
export const CONFIRM_THRESHOLD = 5

/**
 * 定义 4.3.3：应用一条观察。
 * @param model 特征表（Map）
 * @param obs 形如 `{ key, value, kind, at, ttl }` 的观察
 * @returns 新的特征表
 */
export function applyObservation(model, obs) {
  const next = new Map(model)
  const prev = next.get(obs.key)
  if (prev && prev.value === obs.value) {
    next.set(obs.key, {
      ...prev,
      weight: prev.weight + WEIGHT[obs.kind],
      evidence: [...prev.evidence, obs],
      lastUpdatedAt: obs.at,
      expiresAt: obs.at + (obs.ttl ?? 90),
    })
    return next
  }
  if (prev) {
    const weakened = prev.weight + WEIGHT.contradict
    if (weakened <= 0) {
      next.delete(obs.key)
      return next
    }
    next.set(obs.key, { ...prev, weight: weakened, evidence: [...prev.evidence, obs] })
    return next
  }
  if (WEIGHT[obs.kind] < 0) return next
  next.set(obs.key, {
    key: obs.key,
    value: obs.value,
    weight: WEIGHT[obs.kind],
    evidence: [obs],
    lastUpdatedAt: obs.at,
    expiresAt: obs.at + (obs.ttl ?? 90),
  })
  return next
}

/**
 * 定义 4.3.5：过期清除与负向密度报告。
 * @param model 特征表
 * @param now 当前时间（天）
 * @param window 负向观察的时间窗（天）
 * @returns `{ model, drifting }`
 */
export function decayAndDetect(model, now, window = 7) {
  const kept = new Map()
  for (const [key, f] of model) if (f.expiresAt > now) kept.set(key, f)
  const drifting = []
  for (const [key, f] of model) {
    const recent = f.evidence.filter((e) => e.kind === 'contradict' && now - e.at <= window).length
    if (recent >= 2) drifting.push(key)
  }
  return { model: kept, drifting }
}

/**
 * 定义 4.3.4：把一条特征应用到输出规格上（只改规格，不改方法）。
 * @param spec 输出规格
 * @param f 特征
 * @returns 调整后的规格
 */
export function applyFeature(spec, f) {
  const out = { ...spec }
  if (f.key === 'answer-length') out.verbosity = f.value
  if (f.key === 'explain-level') out.explain = f.value
  if (f.key === 'interaction-pace') out.confirmFirst = f.value === 'careful'
  return out
}

/**
 * 定义 4.3.4：门槛以上的特征才生效，中等置信度附带说明。
 * @param model 特征表
 * @param spec 输出规格
 * @returns `{ spec, notices }`
 */
export function inject(model, spec) {
  let out = { ...spec }
  const notices = []
  for (const [, f] of model) {
    if (f.weight < THRESHOLD) continue
    out = applyFeature(out, f)
    if (f.weight < CONFIRM_THRESHOLD) notices.push(`按你以往的偏好：${describe(f)}`)
  }
  return { spec: out, notices }
}

/**
 * 定义 4.3.1：把一条特征写成人话。
 * @param f 特征
 * @returns 面向用户的描述
 */
export function describe(f) {
  return `${f.key} 倾向 ${f.value}`
}

/**
 * 定义 4.3.1：把证据摘成人话。
 * @param evidence 证据数组
 * @returns 面向用户的理由
 */
export function summarizeEvidence(evidence) {
  const counts = {}
  for (const e of evidence) counts[e.kind] = (counts[e.kind] ?? 0) + 1
  return '因为' + Object.entries(counts).map(([k, n]) => `${n} 次${k}`).join('、')
}

/**
 * 定义 4.3.6：面向用户的清单——含理由，不含内部字段。
 * @param model 特征表
 * @returns 用户可见的条目数组
 */
export function listFeatures(model) {
  return [...model.values()].map((f) => ({
    label: describe(f),
    reason: summarizeEvidence(f.evidence),
    confidence: f.weight >= CONFIRM_THRESHOLD ? '已确认' : '推测',
  }))
}

/**
 * 定义 4.3.6：物理删除一条特征，并记录删除动作。
 * @param model 特征表
 * @param key 特征名
 * @param events 事件数组（会被追加）
 * @param now 当前时间
 * @returns 删除后的特征表
 */
export function deleteFeature(model, key, events, now) {
  events.push({ type: 'user-model/delete', key, at: now })
  const next = new Map(model)
  next.delete(key)
  return next
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('4.3 用户建模 · 算例（SA-34）')
  rows.push('')

  rows.push('[1] 权重表与门槛')
  line('显式 / 隐式 / 反驳的权重', `${WEIGHT.explicit} / ${WEIGHT.implicit} / ${WEIGHT.contradict}`)
  line('注入门槛', THRESHOLD)
  line('已确认档位', CONFIRM_THRESHOLD)
  line('反驳的绝对值大于隐式支持', Math.abs(WEIGHT.contradict) > WEIGHT.implicit)
  rows.push('')

  rows.push('[2] 更新')
  let m = new Map()
  m = applyObservation(m, { key: 'answer-length', value: 'short', kind: 'implicit', at: 1 })
  line('一次隐式后的权重', m.get('answer-length').weight)
  m = applyObservation(m, { key: 'answer-length', value: 'short', kind: 'implicit', at: 2 })
  line('两次隐式后的权重', m.get('answer-length').weight)
  m = applyObservation(m, { key: 'answer-length', value: 'short', kind: 'implicit', at: 3 })
  line('三次隐式后的权重', m.get('answer-length').weight)
  line('三次隐式是否达到门槛', m.get('answer-length').weight >= THRESHOLD)

  let explicit = applyObservation(new Map(), { key: 'answer-length', value: 'short', kind: 'explicit', at: 1 })
  line('一次显式后的权重', explicit.get('answer-length').weight)
  line('一次显式是否达到门槛', explicit.get('answer-length').weight >= THRESHOLD)

  let weakened = applyObservation(m, { key: 'answer-length', value: 'long', kind: 'contradict', at: 4 })
  line('三次隐式后一次反驳的权重', weakened.get('answer-length').weight)
  line('反驳后是否落回门槛之下', weakened.get('answer-length').weight < THRESHOLD)
  weakened = applyObservation(weakened, { key: 'answer-length', value: 'long', kind: 'contradict', at: 5 })
  line('连续两次反驳后特征是否仍在', weakened.has('answer-length'))

  const empty = applyObservation(new Map(), { key: 'answer-length', value: 'long', kind: 'contradict', at: 1 })
  line('无特征时反驳是否创建特征', empty.has('answer-length'))
  line('证据条数被保留', m.get('answer-length').evidence.length)
  rows.push('')

  rows.push('[3] 衰减与漂移')
  let drifting = new Map()
  drifting = applyObservation(drifting, { key: 'answer-length', value: 'short', kind: 'implicit', at: 1 })
  drifting = applyObservation(drifting, { key: 'answer-length', value: 'short', kind: 'implicit', at: 2 })
  drifting = applyObservation(drifting, { key: 'answer-length', value: 'short', kind: 'implicit', at: 3 })
  drifting = applyObservation(drifting, { key: 'answer-length', value: 'short', kind: 'explicit', at: 4 })
  drifting = applyObservation(drifting, { key: 'answer-length', value: 'long', kind: 'contradict', at: 10 })
  drifting = applyObservation(drifting, { key: 'answer-length', value: 'long', kind: 'contradict', at: 12 })
  const detected = decayAndDetect(drifting, 13)
  line('一周内两次反驳时的漂移报告', JSON.stringify(detected.drifting))
  line('漂移的特征是否仍在模型里', detected.model.has('answer-length'))
  const stale = new Map([['old', { key: 'old', value: 'x', weight: 3, evidence: [], lastUpdatedAt: 0, expiresAt: 5 }]])
  line('过期特征是否被清除', !decayAndDetect(stale, 10).model.has('old'))
  line('未过期特征是否保留', decayAndDetect(stale, 1).model.has('old'))
  rows.push('')

  rows.push('[4] 注入')
  const weak = new Map([['answer-length', { key: 'answer-length', value: 'short', weight: 1, evidence: [], lastUpdatedAt: 0, expiresAt: 99 }]])
  line('未达门槛时是否改变输出规格', inject(weak, { verbosity: 'normal' }).spec.verbosity !== 'short')
  const mid = new Map([['answer-length', { key: 'answer-length', value: 'short', weight: 3, evidence: [], lastUpdatedAt: 0, expiresAt: 99 }]])
  const midOut = inject(mid, { verbosity: 'normal' })
  line('达门槛时是否改变输出规格', midOut.spec.verbosity)
  line('达门槛时是否附带说明', midOut.notices.length)
  const confirmed = new Map([['answer-length', { key: 'answer-length', value: 'short', weight: 6, evidence: [], lastUpdatedAt: 0, expiresAt: 99 }]])
  line('已确认的特征是否附带说明', inject(confirmed, { verbosity: 'normal' }).notices.length)
  line('注入不改变方法选择', Object.keys(inject(mid, { verbosity: 'normal' }).spec).includes('skill') === false)
  rows.push('')

  rows.push('[5] 边界')
  const shown = listFeatures(m)
  line('面向用户的清单条数', shown.length)
  line('清单是否含理由', shown[0].reason.startsWith('因为'))
  line('清单是否含内部权重字段', Object.keys(shown[0]).includes('weight'))
  line('清单的置信度档位', shown[0].confidence)
  const events = []
  const afterDelete = deleteFeature(m, 'answer-length', events, 20)
  line('删除后模型里是否还有该特征', afterDelete.has('answer-length'))
  line('删除动作是否被记录', events.length === 1 && events[0].type === 'user-model/delete')
  line('删除事件不含内容', !JSON.stringify(events[0]).includes('short'))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
