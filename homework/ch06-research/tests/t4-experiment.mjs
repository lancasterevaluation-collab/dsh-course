// Part D 的判据（13 条）。对应讲义 6.2 与 CONTRACT.md 的「Part D」。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('experiment')
const s = createSuite('Part D · 实验设计与报告', { weight: 25 })

const record = () => ({
  bench: { name: 'course-bench', version: '1.0', checksum: 'abc123' },
  code: { commit: 'deadbee', config: { k: 1 }, profile: 'dev' },
  seeds: [1, 2, 3],
  env: { deps: { node: '22' }, model: 'model-x@2026-01', external: { mcp: '1.0' } },
})

// ── planExperiment ─────────────────────────────────────────────
s.check('E1 tasks 与样本量公式一致', () => {
  const p = 0.7
  const delta = 0.1
  const expected = Math.ceil((2 * 1.96 ** 2 * p * (1 - p)) / delta ** 2)
  const r = impl.planExperiment({ baselineRate: p, targetDelta: delta, runs: 3, costPerTask: 100 })
  assert.eq(r.tasks, expected)
})

s.check('E2 totalRuns = tasks × runs', () => {
  const r = impl.planExperiment({ baselineRate: 0.7, targetDelta: 0.1, runs: 4, costPerTask: 100 })
  assert.eq(r.totalRuns, r.tasks * 4)
})

s.check('E3 成本是乘法的：totalRuns × costPerTask', () => {
  const r = impl.planExperiment({ baselineRate: 0.7, targetDelta: 0.1, runs: 3, costPerTask: 250 })
  assert.eq(r.costEstimate, r.totalRuns * 250)
})

s.check('E4 seeds 长度等于重复次数且互不相同', () => {
  const r = impl.planExperiment({ baselineRate: 0.7, targetDelta: 0.1, runs: 5, costPerTask: 10 })
  assert.eq(r.seeds.length, 5)
  assert.eq(new Set(r.seeds).size, 5)
})

// ── planAblation ───────────────────────────────────────────────
s.check('E5 缺少中性替代时抛错（含「中性」）', () => {
  assert.throws(() => impl.planAblation({ name: '压缩' }), '中性')
  assert.throws(() => impl.planAblation({ name: '压缩', neutral: '' }), '中性')
})

s.check('E6 给出完整性核对项与含改前/改后的步骤', () => {
  const r = impl.planAblation({ name: '压缩', neutral: '按同比例截断末尾' })
  assert.ok(Array.isArray(r.integrity) && r.integrity.length >= 1, '至少一项完整性核对')
  const steps = r.steps.join(' ')
  assert.ok(steps.includes('改前'), 'steps 应含「改前」')
  assert.ok(steps.includes('改后'), 'steps 应含「改后」')
  assert.eq(r.neutral, '按同比例截断末尾')
})

// ── buildReport ────────────────────────────────────────────────
const result6 = { problem: '压缩阈值与成本', summary: { p50: 1.2 }, limits: ['只覆盖一个基准'] }

s.check('E7 报告六项齐全且非空', () => {
  const r = impl.buildReport(record(), result6, { detected: true, note: '有差异' })
  for (const k of ['problem', 'bench', 'runs', 'results', 'conclusion', 'limits']) {
    assert.ok(r[k] !== undefined && r[k] !== null, `缺少报告项：${k}`)
  }
  assert.ok(Object.keys(r.runs).length >= 4, 'runs 应当含四项可复现记录')
})

s.check('E8 未检出差异且没有分辨率时抛错（含「分辨率」）', () => {
  assert.throws(() => impl.buildReport(record(), result6, { detected: false, note: '未检出' }), '分辨率')
})

s.check('E9 未检出差异但给出分辨率时通过', () => {
  const r = impl.buildReport(record(), result6, { detected: false, note: '未检出', resolution: '在 60 个任务、噪声下限 0.04 的条件下未检出差异' })
  assert.eq(r.conclusion.detected, false)
  assert.ok(String(r.conclusion.resolution).includes('60'))
})

s.check('E10 limits 至少一项', () => {
  const r = impl.buildReport(record(), { problem: 'x', summary: {}, limits: [] }, { detected: true, note: 'ok' })
  assert.ok(Array.isArray(r.limits) && r.limits.length >= 1)
})

// ── isReproducible ─────────────────────────────────────────────
s.check('E11 完整记录：ok 为 true 且 missing 为空', () => {
  const r = impl.isReproducible(record())
  assert.eq(r.ok, true)
  assert.deepEq(r.missing, [])
})

s.check('E12 缺 env.model 必须被报出（最容易忽略的一项）', () => {
  const rec = record()
  delete rec.env.model
  const r = impl.isReproducible(rec)
  assert.eq(r.ok, false)
  assert.ok(r.missing.includes('env.model'), `missing 应含 env.model，实际 ${JSON.stringify(r.missing)}`)
  assert.deepEq(r.missing, [...r.missing].sort(), 'missing 应按字典序')
})

s.check('E13 缺 seeds 与 bench.checksum 都被报出', () => {
  const rec = record()
  delete rec.bench.checksum
  rec.seeds = []
  const r = impl.isReproducible(rec)
  assert.eq(r.ok, false)
  assert.ok(r.missing.includes('bench.checksum'))
  assert.ok(r.missing.includes('seeds'))
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
