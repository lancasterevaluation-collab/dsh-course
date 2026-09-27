// Part C 的参考实现。

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** 样本方差（分母 n-1）。 */
function variance(xs) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)
}

/** 确定性伪随机（mulberry32），保证同种子可复现。 */
function rng(seed) {
  let a = (seed ?? 1) >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 最近秩分位数（不插值）。 */
export function percentile(values, q) {
  if (!values || values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1))
  return sorted[idx]
}

/** 噪声下限：同一配置多次运行的 2 倍样本标准差。 */
export function noiseFloor(runs) {
  if (!runs || runs.length < 2) return 0
  return 2 * Math.sqrt(variance(runs))
}

/** 样本量反推（公式见契约）。 */
export function sampleSize(opts) {
  const p = opts?.baselineRate
  const delta = opts?.targetDelta
  if (typeof p !== 'number' || typeof delta !== 'number' || delta <= 0 || p <= 0 || p >= 1) {
    throw new Error('参数非法：需要 0 < baselineRate < 1 且 targetDelta > 0')
  }
  return { tasks: Math.ceil((2 * 1.96 ** 2 * p * (1 - p)) / delta ** 2) }
}

/** 重采样置信区间（同种子可复现）。 */
export function bootstrapCI(samples, opts = {}) {
  if (!Array.isArray(samples) || samples.length < 2) throw new Error('样本不足：至少需要两个观测')
  const level = opts.level ?? 0.95
  const iters = opts.iters ?? 1000
  const random = rng(opts.seed ?? 1)
  const n = samples.length
  const means = []
  for (let i = 0; i < iters; i++) {
    let sum = 0
    for (let j = 0; j < n; j++) sum += samples[Math.floor(random() * n)]
    means.push(sum / n)
  }
  return {
    lo: percentile(means, (1 - level) / 2),
    hi: percentile(means, 1 - (1 - level) / 2),
  }
}

/** 比较两个方法：区间重叠即不显著。 */
export function compare(a, b, opts = {}) {
  const ciA = bootstrapCI(a, opts)
  const ciB = bootstrapCI(b, opts)
  const delta = mean(b) - mean(a)
  const overlap = ciA.hi >= ciB.lo && ciB.hi >= ciA.lo
  const pooledSd = Math.sqrt((variance(a) + variance(b)) / 2)
  return {
    delta,
    ciA,
    ciB,
    significant: !overlap,
    effectSize: pooledSd === 0 ? 0 : delta / pooledSd,
    n: a.length + b.length,
  }
}
