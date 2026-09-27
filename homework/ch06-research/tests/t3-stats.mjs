// Part C 的判据（14 条）。对应讲义 6.2 与 CONTRACT.md 的「Part C」。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('stats')
const s = createSuite('Part C · 统计', { weight: 30 })

// ── percentile ─────────────────────────────────────────────────
s.check('S1 最近秩法（不插值）', () => {
  assert.eq(impl.percentile([1, 2, 3, 4, 5], 0.5), 3)
  assert.eq(impl.percentile([1, 2, 3, 4], 0.95), 4)
  assert.eq(impl.percentile([10, 20, 30, 40], 0.5), 20, 'n 为偶数时取中间两个的较小者（ceil(q*n)-1）')
})

s.check('S2 空数组返回 0，单元素返回它自己', () => {
  assert.eq(impl.percentile([], 0.9), 0)
  assert.eq(impl.percentile([7], 0.9), 7)
})

// ── noiseFloor ─────────────────────────────────────────────────
s.check('S3 等值数组与样本不足时噪声为 0（浮点容差内）', () => {
  assert.near(impl.noiseFloor([0.7, 0.7, 0.7]), 0, 1e-12, '等值数组的噪声应为 0')
  assert.eq(impl.noiseFloor([0.7]), 0)
  assert.eq(impl.noiseFloor([]), 0)
})

s.check('S4 用样本标准差（分母 n-1）的两倍', () => {
  // [0.7, 0.8] 的样本标准差 = sqrt(0.005) ≈ 0.0707107
  assert.near(impl.noiseFloor([0.7, 0.8]), 2 * Math.sqrt(0.005), 1e-9)
})

s.check('S5 噪声只反映同一配置的波动（不受两组均值差影响）', () => {
  const stable = impl.noiseFloor([0.70, 0.71, 0.70])
  const wide = impl.noiseFloor([0.60, 0.80, 0.70])
  assert.ok(stable < wide, '同配置越稳定，噪声下限越小')
})

// ── sampleSize ─────────────────────────────────────────────────
s.check('S6 按契约公式反推样本量', () => {
  const p = 0.7
  const delta = 0.1
  const expected = Math.ceil((2 * 1.96 ** 2 * p * (1 - p)) / delta ** 2)
  assert.eq(impl.sampleSize({ baselineRate: p, targetDelta: delta }).tasks, expected)
})

s.check('S7 参数非法时抛错（含「参数」）', () => {
  assert.throws(() => impl.sampleSize({ baselineRate: 0.7, targetDelta: 0 }), '参数')
  assert.throws(() => impl.sampleSize({ baselineRate: 1, targetDelta: 0.1 }), '参数')
})

s.check('S8 目标差异越小，所需样本量越大', () => {
  const big = impl.sampleSize({ baselineRate: 0.7, targetDelta: 0.2 }).tasks
  const small = impl.sampleSize({ baselineRate: 0.7, targetDelta: 0.05 }).tasks
  assert.ok(small > big, `更小的差异需要更多样本：${small} 应大于 ${big}`)
})

// ── bootstrapCI ────────────────────────────────────────────────
const samples = [0.70, 0.72, 0.71, 0.69, 0.73, 0.70, 0.71, 0.72]

s.check('S9 区间合法：lo <= hi 且落在观测范围内', () => {
  const ci = impl.bootstrapCI(samples, { seed: 1 })
  assert.ok(ci.lo <= ci.hi, 'lo 必须不大于 hi')
  assert.ok(ci.lo >= Math.min(...samples) - 1e-9 && ci.hi <= Math.max(...samples) + 1e-9, '区间应落在观测范围内')
})

s.check('S10 同一个种子两次调用结果相同（可复现）', () => {
  const a = impl.bootstrapCI(samples, { seed: 7 })
  const b = impl.bootstrapCI(samples, { seed: 7 })
  assert.deepEq(a, b, '同种子必须可复现')
})

s.check('S11 样本不足时抛错（含「样本」）', () => {
  assert.throws(() => impl.bootstrapCI([], { seed: 1 }), '样本')
  assert.throws(() => impl.bootstrapCI([0.7], { seed: 1 }), '样本')
})

// ── compare ────────────────────────────────────────────────────
s.check('S12 delta 与 n 正确', () => {
  const r = impl.compare([1, 2], [4, 5], { seed: 1 })
  assert.near(r.delta, 3, 1e-9)
  assert.eq(r.n, 4)
})

s.check('S13 区间重叠时必须判为不显著；重叠之外必须显著', () => {
  const close = impl.compare([0.70, 0.71, 0.70], [0.72, 0.71, 0.72], { seed: 1 })
  assert.eq(close.significant, false, '差异落在噪声里时不得判为显著')
  const far = impl.compare([0.70, 0.71, 0.70], [0.90, 0.91, 0.90], { seed: 1 })
  assert.eq(far.significant, true, '差异很大且区间不重叠时应当显著')
  const same = impl.compare([0.7, 0.7, 0.7, 0.7], [0.7, 0.7, 0.7, 0.7], { seed: 1 })
  assert.eq(same.significant, false, '完全相同的两组不应显著')
})

s.check('S14 效应量的符号正确；合并标准差为 0 时取 0', () => {
  const r = impl.compare([1, 1, 1], [2, 2, 2], { seed: 1 })
  assert.eq(r.effectSize, 0, '两组各自无方差时合并标准差为 0，效应量取 0')
  const up = impl.compare([0.60, 0.62, 0.61, 0.63], [0.80, 0.82, 0.81, 0.83], { seed: 1 })
  assert.ok(up.effectSize > 0, 'b 更大时效应量应当为正')
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
