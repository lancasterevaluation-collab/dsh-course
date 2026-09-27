// Part E 的判据（13 条）。对应讲义 4.5 与 CONTRACT.md 的「Part E」。
//
// 这一项有一半判据是"必须被拒绝"——它们检验的是门控会不会在该说不的时候说"不"。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('evolution')
const s = createSuite('Part E · 演化与门控', { weight: 15 })

const proposal = (extra = {}) => ({
  id: 'p1',
  target: { kind: 'config', path: 'retry/maxAttempts' },
  diff: { before: '3', after: '4' },
  reason: '超时失败后重试不足',
  expectation: { metric: 'success', delta: 0.05 },
  rollback: '改回 3',
  originVersion: 'v1',
  ...extra,
})

const current = (id = 'v1') => ({ id, textOf: () => '3' })
const okCtx = (extra = {}) => ({
  metaControlled: ['gate/thresholds', 'eval/dataset', 'log/writer', 'meta/list'],
  applyDiff: () => '4',
  runs: { baseA: [0.7, 0.72], baseB: [0.71, 0.70], candidate: [0.8, 0.82] },
  guardOk: true,
  ...extra,
})

const diagnosis = { phenomenon: '任务超时', conclusion: { cause: '重试次数不足' }, action: { target: 'config:retry/maxAttempts' } }

// ── buildProposal ──────────────────────────────────────────────
s.check('E1 提议缺少改前或改后文本时抛错（含「差异」）', () => {
  assert.throws(() => impl.buildProposal(diagnosis, { target: {}, diff: { before: '' }, expectation: {}, rollback: 'x', originVersion: 'v1' }), '差异')
})

s.check('E2 诊断没有可行动对象时抛错（含「可行动」）', () => {
  const bad = { phenomenon: 'x', conclusion: { cause: '模型能力不足' }, action: {} }
  assert.throws(() => impl.buildProposal(bad, { target: {}, diff: { before: 'a', after: 'b' }, expectation: {}, rollback: 'x', originVersion: 'v1' }), '可行动')
})

s.check('E3 提议含 reason、rollback 与基线版本', () => {
  const p = impl.buildProposal(diagnosis, { target: { kind: 'config', path: 'a' }, diff: { before: 'a', after: 'b' }, expectation: { metric: 'm', delta: 1 }, rollback: '改回 a', originVersion: 'v1' })
  assert.ok(p.reason && p.reason.includes('重试次数不足'))
  assert.eq(p.rollback, '改回 a')
  assert.eq(p.originVersion, 'v1')
})

// ── gate：五条"必须被拒绝" ──────────────────────────────────────
s.check('E4 元控制对象被拒（含「元控制」）', () => {
  const r = impl.gate(proposal({ target: { kind: 'config', path: 'gate/thresholds' } }), current(), okCtx())
  assert.eq(r.ok, false)
  assert.eq(r.stage, 'static')
  assert.ok(String(r.why).includes('元控制'), `why 应提到元控制，实际「${r.why}」`)
})

s.check('E5 基线版本过期被拒（含「基线」）', () => {
  const r = impl.gate(proposal({ originVersion: 'v0' }), current('v1'), okCtx())
  assert.eq(r.ok, false)
  assert.ok(String(r.why).includes('基线'))
})

s.check('E6 差异无法应用时被拒（含「差异」）', () => {
  const r = impl.gate(proposal(), current(), okCtx({ applyDiff: () => { throw new Error('conflict') } }))
  assert.eq(r.ok, false)
  assert.ok(String(r.why).includes('差异'))
})

s.check('E7 改善落在噪声范围内被拒（含「噪声」）', () => {
  // 同一版本两次运行的结果不同 → noise = |0.71 - 0.61| = 0.1；而候选只比基线高 0.01
  const noiseRuns = { baseA: [0.70, 0.72], baseB: [0.60, 0.62], candidate: [0.67, 0.66] }
  const r = impl.gate(proposal(), current(), okCtx({ runs: noiseRuns }))
  assert.eq(r.ok, false)
  assert.eq(r.stage, 'eval')
  assert.ok(String(r.why).includes('噪声'), `why 应提到噪声，实际「${r.why}」`)
})

s.check('E8 护栏退化被拒（含「护栏」）', () => {
  const r = impl.gate(proposal(), current(), okCtx({ guardOk: false }))
  assert.eq(r.ok, false)
  assert.ok(String(r.why).includes('护栏'))
})

s.check('E9 全部通过时返回 ok 与 stage=ok', () => {
  const r = impl.gate(proposal(), current(), okCtx())
  assert.eq(r.ok, true)
  assert.eq(r.stage, 'ok')
})

s.check('E10 静态层先于评估层（两者都该拒时报静态原因）', () => {
  const r = impl.gate(proposal({ target: { kind: 'config', path: 'eval/dataset' } }), current(), okCtx({ guardOk: false }))
  assert.eq(r.stage, 'static', '静态层应当先被检查')
  assert.ok(String(r.why).includes('元控制'))
})

// ── release 与 rollback ────────────────────────────────────────
s.check('E11 release：一组改动作为一个版本，base 与 from 正确', () => {
  const store = { current: { id: 'v1' }, versions: [] }
  const r = impl.release(store, proposal(), {})
  assert.eq(r.from, 'v1')
  assert.eq(r.version.base, 'v1')
  assert.ok(Array.isArray(r.version.changes) && r.version.changes.length === 1, 'changes 应当是数组')
  assert.ok(r.version.id, '应当有版本 id')
})

s.check('E12 release 不修改传入的 store', () => {
  const store = { current: { id: 'v1' }, versions: [] }
  const frozen = JSON.stringify(store)
  impl.release(store, proposal(), {})
  assert.eq(JSON.stringify(store), frozen)
})

s.check('E13 回滚在不兼容时抛错（含「状态」或「兼容」）', () => {
  let threw = null
  try {
    impl.rollback({}, { id: 'v0' }, { canReadState: () => false })
  } catch (e) { threw = e }
  assert.ok(threw, '不兼容时应当抛错')
  const msg = String(threw.message)
  assert.ok(msg.includes('状态') || msg.includes('兼容'), `错误信息应提到状态或兼容，实际「${msg}」`)
  const ok = impl.rollback({}, { id: 'v1' }, { canReadState: () => true })
  assert.eq(ok.ok, true)
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
