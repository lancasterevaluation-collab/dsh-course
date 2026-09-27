// Part E 的参考实现。

/** 把工具名映射成面向人的说法（避免把命令名写进呈现）。 */
const TOOL_LABEL = { shell: '执行命令', write: '写入文件', read: '读取文件', remove: '删除内容', system: '系统操作' }
const OPTIONS = ['allow-once', 'allow-session', 'allow-project', 'deny', 'alternative']

/** 构造审批请求。 */
export function buildRequest(tool, args, ctx) {
  const root = String(ctx?.workspaceRoot ?? '')
  const inside = (p) => typeof p === 'string' && root.length > 0 && p.startsWith(root)
  const exists = typeof ctx?.exists === 'function' ? ctx.exists : () => false

  let level = 'low'
  let undoable = true
  let reason = '只读操作，不产生改动'

  if (tool.sideEffect === 'read') {
    level = 'low'; undoable = true; reason = '只读，不产生改动'
  } else if (tool.sideEffect === 'write') {
    const p = args?.path
    if (inside(p) && !exists(p)) { level = 'low'; undoable = true; reason = '在工作区内新增文件' }
    else { level = 'medium'; undoable = false; reason = '覆盖已有的内容' }
  } else if (tool.sideEffect === 'destructive') {
    const p = args?.target ?? args?.path
    if (inside(p)) { level = 'high'; undoable = false; reason = '删除工作区内的内容' }
    else { level = 'critical'; undoable = false; reason = '删除工作区之外的内容' }
  } else {
    level = 'critical'; undoable = false; reason = '系统级操作'
  }

  return {
    id: 'ap-1',
    origin: { sessionId: ctx?.sessionId, preset: ctx?.preset, profile: ctx?.profile, taskSummary: ctx?.taskSummary },
    action: { tool: tool.name, summary: `${TOOL_LABEL[tool.name] ?? '执行操作'}：${reason}` },
    risk: { level, reason, undoable },
    options: [...OPTIONS],
    raisedAt: ctx?.now ?? 0,
  }
}

/** 权限判决：用户 → 项目 → 预设拒绝 → 低风险放行 → ask。 */
export function decide(request, permissions, presets) {
  const matches = (permissions ?? []).filter((p) => {
    if (p.revoked) return false
    if (p.match?.tool !== request.action?.tool) return false
    if (p.match?.constraint && !(presets?.matchConstraint?.(p.match.constraint, request) ?? false)) return false
    return true
  })
  if (presets?.denies?.(request)) return 'deny' // 上界先判：下游授权不能放宽它
  if (matches.some((p) => p.source?.kind === 'user')) return 'allow'
  if (matches.some((p) => p.source?.kind === 'project')) return 'allow'
  if (presets?.autoAllowReadOnly && presets?.isReadOnly?.(request)) return 'allow'
  return 'ask'
}

const ALLOWING = new Set(['allow-once', 'allow-session', 'allow-project'])
const REFUSING = new Set(['deny', 'alternative'])

/** 疲劳三信号（合取判定）。 */
export function fatigueSignals(events) {
  const responded = (events ?? []).filter((e) => e.decidedAt !== undefined)
  if (responded.length === 0) {
    return { responded: 0, medianLatencyMs: 0, allowRate: 0, refusalRate: 0, fatigued: false }
  }
  const latencies = responded.map((e) => e.decidedAt - e.raisedAt).sort((a, b) => a - b)
  const mid = Math.floor(latencies.length / 2)
  const median = latencies.length % 2 === 1 ? latencies[mid] : latencies[mid - 1]
  const allowRate = responded.filter((e) => ALLOWING.has(e.decision)).length / responded.length
  const refusalRate = responded.filter((e) => REFUSING.has(e.decision)).length / responded.length
  return {
    responded: responded.length,
    medianLatencyMs: median,
    allowRate,
    refusalRate,
    fatigued: median < 3000 && allowRate > 0.95 && refusalRate === 0,
  }
}
