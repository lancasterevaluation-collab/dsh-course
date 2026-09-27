// Part F 的参考实现。

const DAY = 86400000
const CHECKABLE = /(通过|不通过|等于|大于|小于|不含|包含|存在|>=|<=|==|\d)/

/** 写入状态：三条校验（唯一下一步、约束是判据、进行中只有一项）。 */
export function writeState(state, ctx) {
  if (!state.next || String(state.next).length < 8) throw new Error('缺少唯一下一步（或它太短，无法作为续作入口）')
  const bad = (state.constraints ?? []).filter((c) => !CHECKABLE.test(String(c)))
  if (bad.length) throw new Error(`约束必须写成可检查的判据：${bad.join('；')}`)
  if ((state.doing ?? []).length > 1) throw new Error('进行中的项应当只有一项（否则续作者要先做选择）')
  return { ...state, updatedAt: ctx.now }
}

/** 续作：入口、上下文、剩余、检查点与过时警告。 */
export function resume(state, ctx) {
  const staleAfterDays = ctx.staleAfterDays ?? 14
  const nextMilestone = (state.milestones ?? []).find((m) => !m.done)
  const warnings = []

  const newest = Math.max(0, ...(state.artifacts ?? []).map((p) => ctx.mtimeOf(p) ?? 0))
  if (newest > state.updatedAt) warnings.push('产物比状态新：状态可能漏记了进展（产物）')
  if (ctx.now - state.updatedAt > staleAfterDays * DAY) warnings.push('状态长期未更新')
  if ((state.todo ?? []).length > 0 && (state.doing ?? []).length === 0) warnings.push('有待办而没有进行中的项：进行中的记录可能不完整')

  const todo = state.todo ?? []
  return {
    startHere: state.next,
    context: { goal: state.goal, constraints: state.constraints ?? [], decisions: state.decisions ?? [] },
    remaining: { todos: todo.length, added: todo.filter((t) => t.added).length },
    verifyAt: nextMilestone ? { name: nextMilestone.name, check: nextMilestone.check } : null,
    warnings,
  }
}

/** 目标修订（只追加）与范围变更（标记新增）。 */
export function revise(state, revision, ctx) {
  if (!revision?.reason) throw new Error('目标或范围的变更必须给出理由')
  if (revision.kind === 'goal') {
    return {
      ...state,
      revisions: [...(state.revisions ?? []), { kind: 'goal', text: revision.text, reason: revision.reason, at: ctx.now }],
    }
  }
  if (revision.kind === 'scope') {
    return {
      ...state,
      todo: [...(state.todo ?? []), { ...revision.item, added: true }],
      revisions: [...(state.revisions ?? []), { kind: 'scope', reason: revision.reason, at: ctx.now }],
    }
  }
  throw new Error(`未知的修订类型：${revision.kind}`)
}

/** 复盘的覆盖率与门控。 */
export function coverage(outputs, ctx) {
  const minCoverage = ctx?.minCoverage ?? 0.6
  const list = outputs ?? []
  if (list.length === 0) return { coverage: 0, gated: false, closed: 0, total: 0 }
  const closed = list.filter((o) => o.state === 'done' || (o.state === 'dropped' && o.dropReason)).length
  const c = closed / list.length
  return { coverage: c, gated: c >= minCoverage, closed, total: list.length }
}
