// Part D 的参考实现。

const WEIGHT = { explicit: 3, implicit: 1, contradict: -2 }
const DAY = 86400000
const CONFIRM = 6

const clone = (m) => ({ features: (m.features ?? []).map((f) => ({ ...f, evidence: [...(f.evidence ?? [])] })) })

/** 应用一次观察：支持、反驳、归零删除。 */
export function applyObservation(model, obs, opts) {
  const ttlDays = opts?.ttlDays ?? 180
  const next = clone(model)
  const i = next.features.findIndex((f) => f.key === obs.key)
  const delta = WEIGHT[obs.kind]

  if (i < 0) {
    if (delta < 0) return next // 无特征时反驳不创建特征
    next.features.push({
      key: obs.key, value: obs.value, weight: delta, evidence: [obs],
      lastUpdatedAt: obs.at, expiresAt: obs.at + ttlDays * DAY,
    })
    return next
  }

  const f = next.features[i]
  if (f.value === obs.value) {
    f.weight += delta
    f.evidence.push(obs)
    f.lastUpdatedAt = obs.at
    return next
  }

  const weakened = f.weight + WEIGHT.contradict
  if (weakened <= 0) {
    next.features.splice(i, 1) // 归零即删除
    return next
  }
  f.weight = weakened
  f.evidence.push(obs)
  f.lastUpdatedAt = obs.at
  return next
}

/** 时间衰减与漂移报告（只报告）。 */
export function decayAndDetect(model, now, opts) {
  const windowDays = opts?.windowDays ?? 7
  const driftThreshold = opts?.driftThreshold ?? 2
  const kept = (model.features ?? []).filter((f) => !(typeof f.expiresAt === 'number' && f.expiresAt <= now))
  const drifting = kept
    .filter((f) => (f.evidence ?? []).filter((e) => e.kind === 'contradict' && now - e.at <= windowDays * DAY).length >= driftThreshold)
    .map((f) => f.key)
    .sort()
  return { model: { features: kept.map((f) => ({ ...f, evidence: [...(f.evidence ?? [])] })) }, drifting }
}

/** 注入：门槛 + 已确认不说明 + 中等置信度把推断说出来。 */
export function inject(model, spec, opts) {
  const threshold = opts?.threshold ?? 3
  const confirmThreshold = opts?.confirmThreshold ?? CONFIRM
  const out = { ...spec, notes: [...(spec.notes ?? [])] }
  for (const f of model.features ?? []) {
    if (f.weight < threshold) continue
    if (f.key === 'answer-length') out.length = f.value
    else if (f.key === 'format') out.format = f.value
    if (f.weight >= confirmThreshold) continue
    out.notes.push(`按你以往的偏好：${f.key}=${f.value}`)
  }
  return out
}

/** 面向人的列表：不暴露内部字段。 */
export function listFeatures(model) {
  return (model.features ?? []).map((f) => ({
    label: `${f.key}：${f.value}`,
    reason: (f.evidence ?? []).length
      ? `依据 ${f.evidence.length} 次观察（其中 ${(f.evidence ?? []).filter((e) => e.kind === 'contradict').length} 次反对）`
      : '暂无证据记录',
    confidence: f.weight >= CONFIRM ? '已确认' : '推测',
  }))
}
