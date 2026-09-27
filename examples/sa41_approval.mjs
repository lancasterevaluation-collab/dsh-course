// 5.3 交互与权限的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/** 定义 5.3.1：选项顺序从窄到宽。 */
export const OPTION_ORDER = ['allow-once', 'allow-session', 'allow-project', 'deny', 'alternative']

/**
 * 定义 5.3.2：风险按可逆性与影响范围分档。
 * @param action 形如 `{ summary, scope, undoable }`
 * @returns `{ level, reason, undoable }`
 */
export function assessRisk(action) {
  if (!action.undoable && action.scope === 'system') {
    return { level: 'critical', reason: `${action.summary}，且不可恢复`, undoable: false }
  }
  if (!action.undoable && action.scope === 'outside') {
    return { level: 'high', reason: `${action.summary}，且难以撤销`, undoable: false }
  }
  if (action.scope === 'workspace') {
    return { level: 'medium', reason: `${action.summary}，影响工作区`, undoable: true }
  }
  return { level: 'low', reason: `${action.summary}，可撤销`, undoable: true }
}

/**
 * 定义 5.3.1：构造审批请求。
 * @param origin 归属
 * @param action 动作
 * @param now 当前时间
 * @param timeout 等待超时
 * @returns 审批请求
 */
export function buildRequest(origin, action, now, timeout = 600000) {
  return {
    id: `ap-${origin.sessionId}-${now}`,
    origin,
    action: { tool: action.tool, args: action.args ?? {}, cwd: action.cwd ?? null, summary: action.summary },
    risk: assessRisk(action),
    options: [...OPTION_ORDER],
    raisedAt: now,
    deadline: now + timeout,
  }
}

/**
 * 定义 5.3.6：上界最先判，然后才是各级授权。
 * @param req 审批请求
 * @param ctx 形如 `{ presetDenies, matching, autoAllowReadOnly }`
 * @returns `'allow' | 'ask' | 'deny'`
 */
export function decide(req, ctx) {
  if (ctx.presetDenies(req)) return 'deny'
  const presets = ctx.matching(req)
  if (presets.some((p) => p.source.kind === 'user' && !p.revoked)) return 'allow'
  if (presets.some((p) => p.source.kind === 'project' && !p.revoked)) return 'allow'
  if (req.risk.level === 'low' && ctx.autoAllowReadOnly) return 'allow'
  return 'ask'
}

/**
 * 定义 5.3.3：面向人的呈现。
 * @param r 审批请求
 * @returns 文本
 */
export function forHuman(r) {
  return [
    `[${r.origin.preset}] 请求执行：${r.action.summary}`,
    `位置：${r.action.cwd ?? '（未指定）'}`,
    `风险：${r.risk.reason}（${r.risk.undoable ? '可撤销' : '不可撤销'}）`,
  ].join('\n')
}

/**
 * 定义 5.3.3：面向日志的呈现。
 * @param r 审批请求
 * @returns JSON 文本
 */
export function forLog(r) {
  return JSON.stringify({
    id: r.id,
    session: r.origin.sessionId,
    tool: r.action.tool,
    risk: r.risk.level,
    options: r.options,
  })
}

/**
 * 定义 5.3.5：四档粒度与各自的失效条件。
 * @param option 选项
 * @param origin 归属
 * @param now 当前时间
 * @returns `{ scope, expiresAt, invalidatedBy }`
 */
export function grantScope(option, origin, now) {
  switch (option) {
    case 'allow-session':
      return { scope: { sessions: [origin.sessionId] }, expiresAt: null, invalidatedBy: 'session-end' }
    case 'allow-project':
      return { scope: { projects: [origin.project] }, expiresAt: null, invalidatedBy: 'leave-project' }
    case 'allow-once':
      return { scope: {}, expiresAt: now, invalidatedBy: 'immediate' }
    default:
      return { scope: {}, expiresAt: null, invalidatedBy: 'manual' }
  }
}

/**
 * 命题 5.3.1：三个疲劳信号。
 * @param events 形如 `{ raisedAt, decidedAt, decision }` 的事件数组
 * @returns `{ medianLatencyMs, allowRate, refusalRate, fatigued }`
 */
export function fatigueSignals(events) {
  const responded = events.filter((e) => e.decision && e.decidedAt !== undefined)
  const latencies = responded.map((e) => e.decidedAt - e.raisedAt).sort((a, b) => a - b)
  const medianLatencyMs = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0
  const allowRate = responded.length ? responded.filter((e) => e.decision !== 'deny').length / responded.length : 0
  const refusalRate = responded.length
    ? responded.filter((e) => e.decision === 'deny' || e.decision === 'alternative').length / responded.length
    : 0
  return {
    medianLatencyMs,
    allowRate,
    refusalRate,
    fatigued: medianLatencyMs < 3000 && allowRate > 0.95 && refusalRate === 0,
  }
}

/**
 * 命题 5.3.5：等待有超时，且状态在异常路径下也要恢复。
 * @param req 审批请求
 * @param ctx 形如 `{ stateOf, setState, race, appendEvent, now }`
 * @returns 决定
 */
export function awaitDecision(req, ctx) {
  const before = ctx.stateOf(req.origin.sessionId)
  ctx.setState(req.origin.sessionId, 'waiting')
  try {
    const decision = ctx.race(req.id)
    if (decision.kind === 'timeout') {
      ctx.appendEvent({ type: 'approval/timeout', id: req.id, at: ctx.now })
      return { kind: 'deny', reason: '超时按保守默认处理' }
    }
    return decision
  } finally {
    ctx.setState(req.origin.sessionId, before)
  }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('5.3 交互与权限 · 算例（SA-41）')
  rows.push('')

  rows.push('[1] 请求与风险')
  const origin = { sessionId: 's-7', preset: 'code-editor', profile: 'dev', project: 'course' }
  const req = buildRequest(origin, { tool: 'shell', args: { command: 'rm -rf build/' }, summary: '删除构建产物目录', scope: 'outside', undoable: false }, 0, 600000)
  line('请求的字段数', Object.keys(req).length)
  line('删除构建目录的风险等级', req.risk.level)
  line('写入工作区文件的风险等级', assessRisk({ summary: '写入工作区文件', scope: 'workspace', undoable: true }).level)
  line('读文件的风险等级', assessRisk({ summary: '读取文件', scope: 'session', undoable: true }).level)
  line('系统级不可逆操作的风险等级', assessRisk({ summary: '修改权限', scope: 'system', undoable: false }).level)
  line('选项里是否有换一种做法', req.options.includes('alternative'))
  line('选项顺序（从窄到宽）', req.options.join(', '))
  line('请求带截止时间', req.deadline - req.raisedAt)
  rows.push('')

  rows.push('[2] 呈现')
  const human = forHuman(req)
  const log = forLog(req)
  line('面向人的呈现行数', human.split('\n').length)
  line('呈现是否先说做什么', human.split('\n')[0].includes('删除构建产物目录'))
  line('呈现是否用后果表述风险', human.includes('难以撤销'))
  line('呈现是否带任务语境（预设名）', human.includes('code-editor'))
  line('面向日志的呈现含风险等级', log.includes('"risk":"high"'))
  line('两种呈现是否同源', forLog(req).includes(`"id":"${req.id}"`))
  rows.push('')

  rows.push('[3] 权限判定')
  const base = { presetDenies: () => false, matching: () => [], autoAllowReadOnly: false }
  line('上界拒绝时', decide(req, { ...base, presetDenies: () => true }))
  line('用户长期授权时', decide(req, { ...base, matching: () => [{ source: { kind: 'user' }, revoked: false }] }))
  line('项目约定时', decide(req, { ...base, matching: () => [{ source: { kind: 'project' }, revoked: false }] }))
  line('已撤销的授权不生效', decide(req, { ...base, matching: () => [{ source: { kind: 'user' }, revoked: true }] }))
  const lowRisk = buildRequest(origin, { tool: 'read', summary: '读取文件', scope: 'session', undoable: true }, 0)
  line('低风险且开启自动放行时', decide(lowRisk, { ...base, autoAllowReadOnly: true }))
  line('低风险但关闭自动放行时', decide(lowRisk, base))
  line('其余情形', decide(req, base))
  line('上界优先于用户授权', decide(req, { ...base, presetDenies: () => true, matching: () => [{ source: { kind: 'user' }, revoked: false }] }))
  rows.push('')

  rows.push('[4] 粒度与疲劳')
  line('四档粒度的失效方式', [
    grantScope('allow-once', origin, 0).invalidatedBy,
    grantScope('allow-session', origin, 0).invalidatedBy,
    grantScope('allow-project', origin, 0).invalidatedBy,
    'manual',
  ].join(', '))
  line('本会话授权的范围', JSON.stringify(grantScope('allow-session', origin, 0).scope))
  line('本次授权立即失效', grantScope('allow-once', origin, 100).expiresAt)

  const fatiguedEvents = [
    { raisedAt: 0, decidedAt: 1200, decision: 'allow-once' },
    { raisedAt: 5000, decidedAt: 6400, decision: 'allow-session' },
    { raisedAt: 9000, decidedAt: 10200, decision: 'allow-project' },
  ]
  const f = fatigueSignals(fatiguedEvents)
  line('疲劳事件流的中位响应时间', f.medianLatencyMs)
  line('疲劳事件流的通过率', f.allowRate)
  line('疲劳事件流的拒绝比例', f.refusalRate)
  line('是否判为疲劳', f.fatigued)
  const normalEvents = [
    { raisedAt: 0, decidedAt: 15000, decision: 'allow-once' },
    { raisedAt: 20000, decidedAt: 38000, decision: 'deny' },
    { raisedAt: 40000, decidedAt: 55000, decision: 'alternative' },
  ]
  line('正常事件流是否判为疲劳', fatigueSignals(normalEvents).fatigued)
  line('高通过率但响应慢时不判为疲劳', fatigueSignals([{ raisedAt: 0, decidedAt: 12000, decision: 'allow-once' }, { raisedAt: 20000, decidedAt: 33000, decision: 'allow-once' }, { raisedAt: 40000, decidedAt: 51000, decision: 'allow-once' }]).fatigued)
  rows.push('')

  rows.push('[5] 等待')
  let state = 'running'
  const events = []
  const ctx = {
    stateOf: () => state,
    setState: (_id, s) => { state = s },
    race: () => ({ kind: 'timeout' }),
    appendEvent: (e) => events.push(e),
    now: 100,
  }
  const decision = awaitDecision(req, ctx)
  line('超时后的决定', decision.kind)
  line('超时的原因', decision.reason)
  line('是否记录了超时事件', events.some((e) => e.type === 'approval/timeout'))
  line('等待结束后状态是否恢复', state)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
