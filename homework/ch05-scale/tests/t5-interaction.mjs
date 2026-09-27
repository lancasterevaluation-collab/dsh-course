// Part E 的判据（13 条）。对应讲义 5.3 与 CONTRACT.md 的「Part E」。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('interaction')
const s = createSuite('Part E · 交互与权限', { weight: 15 })

const ROOT = '/repo'
const ctx = (over = {}) => ({
  now: 0, sessionId: 's1', preset: 'code-editor', profile: 'dev',
  taskSummary: '清理构建产物', workspaceRoot: ROOT, exists: () => false, ...over,
})

// ── buildRequest ───────────────────────────────────────────────
s.check('E1 origin 含会话、预设、模式与任务语境', () => {
  const r = impl.buildRequest({ name: 'shell', sideEffect: 'destructive' }, { target: '/repo/build' }, ctx())
  assert.eq(r.origin.sessionId, 's1')
  assert.eq(r.origin.preset, 'code-editor')
  assert.eq(r.origin.profile, 'dev')
  assert.eq(r.origin.taskSummary, '清理构建产物')
})

s.check('E2 read → low 且可恢复', () => {
  const r = impl.buildRequest({ name: 'read', sideEffect: 'read' }, { path: '/repo/a.ts' }, ctx())
  assert.eq(r.risk.level, 'low')
  assert.eq(r.risk.undoable, true)
})

s.check('E3 write 新增（工作区内）→ low', () => {
  const r = impl.buildRequest({ name: 'write', sideEffect: 'write' }, { path: '/repo/new.ts' }, ctx({ exists: () => false }))
  assert.eq(r.risk.level, 'low')
  assert.eq(r.risk.undoable, true)
})

s.check('E4 write 覆盖已存在路径 → medium 且不可恢复', () => {
  const r = impl.buildRequest({ name: 'write', sideEffect: 'write' }, { path: '/repo/existing.ts' }, ctx({ exists: () => true }))
  assert.eq(r.risk.level, 'medium')
  assert.eq(r.risk.undoable, false)
})

s.check('E5 destructive：工作区内 high、工作区外 critical', () => {
  const inside = impl.buildRequest({ name: 'remove', sideEffect: 'destructive' }, { target: '/repo/build' }, ctx())
  const outside = impl.buildRequest({ name: 'remove', sideEffect: 'destructive' }, { target: '/home/u/x' }, ctx())
  assert.eq(inside.risk.level, 'high')
  assert.eq(outside.risk.level, 'critical')
  assert.eq(outside.risk.undoable, false)
})

s.check('E6 system → critical', () => {
  const r = impl.buildRequest({ name: 'system', sideEffect: 'system' }, {}, ctx())
  assert.eq(r.risk.level, 'critical')
  assert.eq(r.risk.undoable, false)
})

s.check('E7 摘要不含反引号与命令名，且长度足够', () => {
  const r = impl.buildRequest({ name: 'shell', sideEffect: 'destructive' }, { target: '/repo/build' }, ctx())
  const text = String(r.action.summary)
  assert.ok(text.length >= 4)
  assert.ok(!text.includes('\`'), '摘要不得含反引号')
  for (const cmd of ['rm ', 'mv ', 'cp ', 'chmod', 'curl', 'git push']) {
    assert.ok(!text.includes(cmd), `摘要不得含命令名「${cmd.trim()}」`)
  }
})

s.check('E8 options 含 alternative 且顺序从窄到宽', () => {
  const r = impl.buildRequest({ name: 'shell', sideEffect: 'destructive' }, { target: '/repo/build' }, ctx())
  assert.ok(r.options.includes('alternative'), '必须提供"换一种做法"')
  const order = ['allow-once', 'allow-session', 'allow-project', 'deny', 'alternative']
  const idx = r.options.map((o) => order.indexOf(o))
  assert.ok(idx.every((v) => v >= 0), '选项取值非法')
  assert.deepEq(idx, [...idx].sort((a, b) => a - b), '选项顺序应当从窄到宽')
})

// ── decide ─────────────────────────────────────────────────────
const req = { action: { tool: 'write' }, risk: { level: 'medium' } }
const presets = (over = {}) => ({
  denies: () => false,
  isReadOnly: () => false,
  autoAllowReadOnly: true,
  matchConstraint: () => true,
  ...over,
})

s.check('E9 授权之间：用户长期授权与项目约定都能放行', () => {
  const onlyProject = [{ match: { tool: 'write' }, source: { kind: 'project' } }]
  const withUser = [
    { match: { tool: 'write' }, source: { kind: 'project' } },
    { match: { tool: 'write' }, source: { kind: 'user' } },
  ]
  assert.eq(impl.decide(req, onlyProject, presets()), 'allow')
  assert.eq(impl.decide(req, withUser, presets()), 'allow')
})

s.check('E10 项目约定在无预设拒绝时放行', () => {
  const perms = [{ match: { tool: 'write' }, source: { kind: 'project' } }]
  assert.eq(impl.decide(req, perms, presets()), 'allow')
})

s.check('E11 预设的拒绝不能被项目约定放宽', () => {
  const perms = [{ match: { tool: 'write' }, source: { kind: 'project' } }]
  assert.eq(impl.decide(req, perms, presets({ denies: () => true })), 'deny')
})

s.check('E12 被撤销的授权不生效；低风险只读自动放行；其余 ask', () => {
  const revoked = [{ match: { tool: 'write' }, source: { kind: 'user' }, revoked: true }]
  assert.eq(impl.decide(req, revoked, presets()), 'ask', '被撤销的授权不应放行')
  const readReq = { action: { tool: 'read' }, risk: { level: 'low' } }
  assert.eq(impl.decide(readReq, [], presets({ isReadOnly: () => true })), 'allow')
  assert.eq(impl.decide({ action: { tool: 'shell' }, risk: { level: 'high' } }, [], presets({ isReadOnly: () => false })), 'ask')
})

// ── fatigueSignals ─────────────────────────────────────────────
s.check('E13 疲劳是三信号合取；空输入不疲劳', () => {
  const fast = Array.from({ length: 20 }, (_, i) => ({ raisedAt: i * 1000, decidedAt: i * 1000 + 100, decision: 'allow-once' }))
  const f = impl.fatigueSignals(fast)
  assert.eq(f.responded, 20)
  assert.ok(f.medianLatencyMs < 3000)
  assert.ok(f.allowRate > 0.95)
  assert.eq(f.refusalRate, 0)
  assert.eq(f.fatigued, true, '三信号同时成立时应当判定为疲劳')

  const slow = fast.map((e) => ({ ...e, decidedAt: e.raisedAt + 12000 }))
  assert.eq(impl.fatigueSignals(slow).fatigued, false, '响应慢说明人在认真看')
  const refusing = [...fast.slice(0, 19), { raisedAt: 0, decidedAt: 50, decision: 'deny' }]
  assert.eq(impl.fatigueSignals(refusing).fatigued, false, '有拒绝说明人在做判断')

  const empty = impl.fatigueSignals([])
  assert.eq(empty.responded, 0)
  assert.eq(empty.fatigued, false)
  assert.eq(empty.allowRate, 0)
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
