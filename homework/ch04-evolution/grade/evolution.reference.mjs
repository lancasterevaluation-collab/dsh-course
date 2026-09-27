// Part E 的参考实现。

/** 从诊断结论构造提议。 */
export function buildProposal(diagnosis, change) {
  if (!change?.diff?.before || !change?.diff?.after) throw new Error('提议必须给出改前与改后两段差异文本')
  if (!diagnosis?.action?.target) throw new Error('提议必须追溯到一个可行动的对象')
  return {
    id: change.id ?? 'p-1',
    target: change.target,
    diff: change.diff,
    reason: `${diagnosis.phenomenon ?? ''} → ${diagnosis.conclusion?.cause ?? ''}`.trim(),
    expectation: change.expectation,
    rollback: change.rollback,
    originVersion: change.originVersion,
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** 两层门控：静态（先）与评估（后）。 */
export function gate(proposal, current, ctx) {
  if ((ctx.metaControlled ?? []).includes(proposal.target.path)) {
    return { ok: false, stage: 'static', why: `元控制对象不可演化：${proposal.target.path}` }
  }
  if (proposal.originVersion !== current.id) {
    return { ok: false, stage: 'static', why: `基线版本过期：${proposal.originVersion} ≠ ${current.id}` }
  }
  try {
    ctx.applyDiff(current.textOf(proposal.target.path), proposal.diff)
  } catch {
    return { ok: false, stage: 'static', why: '差异无法干净应用' }
  }

  const noise = Math.abs(mean(ctx.runs.baseA) - mean(ctx.runs.baseB))
  const gain = mean(ctx.runs.candidate) - (mean(ctx.runs.baseA) + mean(ctx.runs.baseB)) / 2
  if (gain <= 2 * noise) {
    return { ok: false, stage: 'eval', why: `改善落在噪声范围内：gain=${gain.toFixed(4)} ≤ 2*noise=${(2 * noise).toFixed(4)}` }
  }
  if (ctx.guardOk === false) {
    return { ok: false, stage: 'eval', why: '护栏指标退化' }
  }
  return { ok: true, stage: 'ok' }
}

/** 发布：一组改动作为一个版本。 */
export function release(store, proposal, ctx) {
  const from = store.current.id
  return {
    version: { id: `${from}+1`, base: from, changes: [proposal] },
    from,
  }
}

/** 回滚：先检查状态兼容。 */
export function rollback(store, toVersion, ctx) {
  if (!ctx.canReadState(toVersion)) {
    throw new Error(`目标版本 ${toVersion.id} 无法读取当前状态，需先迁移（状态不兼容）`)
  }
  return { ok: true, to: toVersion.id }
}
