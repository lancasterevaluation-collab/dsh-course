// 5.3 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  OPTION_ORDER, assessRisk, buildRequest, decide, forHuman, forLog, grantScope,
  fatigueSignals, awaitDecision,
} from './sa41_approval.mjs'

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

const ORIGIN = { sessionId: 's-7', preset: 'code-editor', profile: 'dev', project: 'course' }

// 定义 5.3.2：风险分级
{
  eq(assessRisk({ summary: '删除构建产物目录', scope: 'outside', undoable: false }).level, 'high', '工作区外的不可撤销操作是高风险')
  eq(assessRisk({ summary: '写入工作区文件', scope: 'workspace', undoable: true }).level, 'medium', '工作区内的可逆操作是中风险')
  eq(assessRisk({ summary: '读取文件', scope: 'session', undoable: true }).level, 'low', '会话内的可逆操作是低风险')
  eq(assessRisk({ summary: '修改权限', scope: 'system', undoable: false }).level, 'critical', '系统级的不可逆操作是最高风险')
  ok(assessRisk({ summary: 'x', scope: 'outside', undoable: false }).reason.includes('难以撤销'), '高风险的理由说明难以撤销')
  ok(assessRisk({ summary: 'x', scope: 'system', undoable: false }).reason.includes('不可恢复'), '最高风险的理由说明不可恢复')
  eq(assessRisk({ summary: 'x', scope: 'workspace', undoable: false }).level, 'medium', '可逆性以 undoable 字段为准（此处按范围判定）')
}

// 定义 5.3.1：请求结构
{
  const req = buildRequest(ORIGIN, { tool: 'shell', summary: '删除构建产物目录', scope: 'outside', undoable: false }, 0, 600000)
  eq(Object.keys(req).length, 7, '请求有七个字段')
  eq(Object.keys(req), ['id', 'origin', 'action', 'risk', 'options', 'raisedAt', 'deadline'], '字段名与顺序')
  eq(req.origin.sessionId, 's-7', '归属含会话')
  eq(req.origin.preset, 'code-editor', '归属含预设')
  ok(req.action.summary.includes('删除'), '动作含人话摘要')
  eq(req.options.length, 5, '选项有五个')
  eq(req.options, OPTION_ORDER, '选项顺序从窄到宽')
  ok(req.options.includes('alternative'), '选项含换一种做法')
  eq(req.raisedAt, 0, '发起时间被记录')
  eq(req.deadline, 600000, '截止时间按超时计算')
  eq(buildRequest(ORIGIN, { tool: 'x', summary: 'y', scope: 'session', undoable: true }, 0).options[0], 'allow-once', '第一个选项是允许一次')
}

// 定义 5.3.3：呈现
{
  const req = buildRequest(ORIGIN, { tool: 'shell', args: { command: 'rm -rf build/' }, cwd: '/repo', summary: '删除构建产物目录', scope: 'outside', undoable: false }, 0)
  const human = forHuman(req)
  eq(human.split('\n').length, 3, '面向人的呈现有三行')
  ok(human.split('\n')[0].includes('删除构建产物目录'), '第一行说做什么')
  ok(!human.split('\n')[0].includes('rm -rf'), '第一行不亮出原始命令')
  ok(human.includes('/repo'), '呈现含位置')
  ok(human.includes('难以撤销'), '风险用后果表述')
  ok(human.includes('不可撤销'), '呈现标注可撤销性')
  const log = forLog(req)
  ok(log.includes('"risk":"high"'), '日志呈现含风险等级')
  ok(log.includes('"tool":"shell"'), '日志呈现含工具名')
  eq(JSON.parse(log).options.length, 5, '日志呈现含选项列表')
  ok(!log.includes('难以撤销'), '日志呈现不含散文')
}

// 定义 5.3.6：判定顺序
{
  const req = buildRequest(ORIGIN, { tool: 'shell', summary: '删除构建产物目录', scope: 'outside', undoable: false }, 0)
  const base = { presetDenies: () => false, matching: () => [], autoAllowReadOnly: false }
  eq(decide(req, { ...base, presetDenies: () => true }), 'deny', '上界拒绝时拒绝')
  eq(decide(req, { ...base, matching: () => [{ source: { kind: 'user' }, revoked: false }] }), 'allow', '用户长期授权时允许')
  eq(decide(req, { ...base, matching: () => [{ source: { kind: 'project' }, revoked: false }] }), 'allow', '项目约定时允许')
  eq(decide(req, { ...base, matching: () => [{ source: { kind: 'user' }, revoked: true }] }), 'ask', '已撤销的授权不生效')
  eq(decide(req, base), 'ask', '没有授权时询问')
  const low = buildRequest(ORIGIN, { tool: 'read', summary: '读取文件', scope: 'session', undoable: true }, 0)
  eq(decide(low, { ...base, autoAllowReadOnly: true }), 'allow', '低风险且开启自动放行时允许')
  eq(decide(low, base), 'ask', '低风险但关闭自动放行时询问')
  eq(decide(req, { ...base, presetDenies: () => true, matching: () => [{ source: { kind: 'user' }, revoked: false }] }), 'deny', '上界优先于用户授权')
  eq(decide(low, { ...base, presetDenies: () => true, autoAllowReadOnly: true }), 'deny', '上界优先于低风险放行')
}

// 定义 5.3.5：粒度
{
  eq(grantScope('allow-once', ORIGIN, 100).invalidatedBy, 'immediate', '本次授权立即失效')
  eq(grantScope('allow-once', ORIGIN, 100).expiresAt, 100, '本次授权的过期时间就是当下')
  eq(grantScope('allow-session', ORIGIN, 0).invalidatedBy, 'session-end', '本会话授权随会话结束失效')
  eq(grantScope('allow-session', ORIGIN, 0).scope.sessions, ['s-7'], '本会话授权的范围是这条会话')
  eq(grantScope('allow-project', ORIGIN, 0).invalidatedBy, 'leave-project', '本项目授权随离开项目失效')
  eq(grantScope('allow-project', ORIGIN, 0).scope.projects, ['course'], '本项目授权的范围是该项目')
  eq(grantScope('allow-forever', ORIGIN, 0).invalidatedBy, 'manual', '其余情形需要手动撤销')
  eq(grantScope('allow-forever', ORIGIN, 0).expiresAt, null, '手动失效的授权没有过期时间')
}

// 命题 5.3.1：疲劳三信号
{
  const f = fatigueSignals([
    { raisedAt: 0, decidedAt: 1200, decision: 'allow-once' },
    { raisedAt: 5000, decidedAt: 6400, decision: 'allow-session' },
    { raisedAt: 9000, decidedAt: 10200, decision: 'allow-project' },
  ])
  eq(f.medianLatencyMs, 1200, '中位响应时间是 1200ms')
  eq(f.allowRate, 1, '通过率是 1')
  eq(f.refusalRate, 0, '拒绝比例是 0')
  eq(f.fatigued, true, '三信号同时成立时判为疲劳')
}
{
  const normal = fatigueSignals([
    { raisedAt: 0, decidedAt: 15000, decision: 'allow-once' },
    { raisedAt: 20000, decidedAt: 38000, decision: 'deny' },
    { raisedAt: 40000, decidedAt: 55000, decision: 'alternative' },
  ])
  eq(normal.fatigued, false, '响应慢且有拒绝时不算疲劳')
  ok(normal.refusalRate > 0, '有拒绝时拒绝比例大于零')
  const fastButRefusing = fatigueSignals([
    { raisedAt: 0, decidedAt: 1000, decision: 'allow-once' },
    { raisedAt: 5000, decidedAt: 6000, decision: 'deny' },
  ])
  eq(fastButRefusing.fatigued, false, '响应快但有拒绝时不算疲劳')
  const slowButAllowing = fatigueSignals([
    { raisedAt: 0, decidedAt: 12000, decision: 'allow-once' },
    { raisedAt: 20000, decidedAt: 33000, decision: 'allow-once' },
  ])
  eq(slowButAllowing.fatigued, false, '全部通过但响应慢时不算疲劳')
  eq(fatigueSignals([]).fatigued, false, '没有事件时不算疲劳')
  eq(fatigueSignals([]).medianLatencyMs, 0, '没有事件时中位数为零')
}

// 命题 5.3.5：等待与超时
{
  let state = 'running'
  const events = []
  const req = buildRequest(ORIGIN, { tool: 'shell', summary: '删除构建产物目录', scope: 'outside', undoable: false }, 0)
  const decided = awaitDecision(req, {
    stateOf: () => state,
    setState: (_id, s) => { state = s },
    race: () => ({ kind: 'allow', option: 'allow-once' }),
    appendEvent: (e) => events.push(e),
    now: 100,
  })
  eq(decided.kind, 'allow', '有人决定时返回该决定')
  eq(state, 'running', '决定之后状态恢复')
  eq(events.length, 0, '没有超时不记录事件')
}
{
  let state = 'running'
  const events = []
  let observed = null
  const req = buildRequest(ORIGIN, { tool: 'shell', summary: '删除构建产物目录', scope: 'outside', undoable: false }, 0)
  const decided = awaitDecision(req, {
    stateOf: () => state,
    setState: (_id, s) => { observed = observed ?? s; state = s },
    race: () => ({ kind: 'timeout' }),
    appendEvent: (e) => events.push(e),
    now: 100,
  })
  eq(decided.kind, 'deny', '超时按保守默认处理（拒绝）')
  ok(decided.reason.includes('超时'), '超时的原因被说明')
  eq(events.length, 1, '超时被记录成事件')
  eq(events[0].type, 'approval/timeout', '事件类型正确')
  eq(observed, 'waiting', '等待期间状态先变为 waiting')
  eq(state, 'running', '超时之后状态仍被恢复')
}
{
  let state = 'running'
  const req = buildRequest(ORIGIN, { tool: 'shell', summary: '删除构建产物目录', scope: 'outside', undoable: false }, 0)
  let threw = false
  try {
    awaitDecision(req, {
      stateOf: () => state,
      setState: (_id, s) => { state = s },
      race: () => { throw new Error('交互层出错') },
      appendEvent: () => {},
      now: 100,
    })
  } catch { threw = true }
  eq(threw, true, '交互层出错时异常向上传播')
  eq(state, 'running', '异常路径下状态也被恢复（finally）')
}

// 量级关系
{
  near(OPTION_ORDER.length, 5, 0, '选项共五项')
  eq(OPTION_ORDER[0], 'allow-once', '最窄的选项排第一')
  eq(OPTION_ORDER[OPTION_ORDER.length - 1], 'alternative', '换一种做法排在最后')
  eq(OPTION_ORDER.indexOf('allow-once') < OPTION_ORDER.indexOf('deny'), true, '允许一次排在拒绝之前')
  eq(OPTION_ORDER.indexOf('deny') < OPTION_ORDER.indexOf('alternative'), true, '拒绝排在换一种做法之前')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
