// Part C · 统计
//
// 对应讲义：6.2 实验方法。契约：见 ../CONTRACT.md 的「Part C」。
//
// 起步状态：五个函数都抛错。三条"看起来对、其实错"的判据：
//   噪声必须用**同一配置**的多次运行估计、同种子必须可复现、区间重叠时必须判为不显著。

/**
 * 最近秩分位数（不插值）。
 *
 * 契约要点：
 *   - sorted[ceil(q * n) - 1]，索引夹在 [0, n-1]
 *   - 空数组返回 0
 *   - q=0.5 且 n 为偶数时取中间两个的较小者（ceil(q*n)-1 的直接结果，不插值）
 *
 * @param {number[]} values
 * @param {number} q
 * @returns {number}
 */
export function percentile(values, q) {
  throw new Error('未实现：percentile')
}

/**
 * 噪声下限：同一配置多次运行的 2 倍样本标准差。
 *
 * 契约要点：
 *   - n < 2 返回 0；等值数组返回 0
 *   - 用样本标准差（分母 n-1）
 *
 * 提示：噪声必须用**同一配置**的运行估计。用两个方法各自的方差算，会把真实差异算进噪声里。
 *
 * @param {number[]} runs
 * @returns {number}
 */
export function noiseFloor(runs) {
  throw new Error('未实现：noiseFloor')
}

/**
 * 样本量反推。
 *
 * 契约要点：
 *   - tasks = ceil(2 * 1.96² * p * (1-p) / delta²)
 *   - delta <= 0 或 p <= 0 或 p >= 1 → 抛错（信息含「参数」）
 *   - delta 变小则 tasks 变大
 *
 * 提示：这条公式的意义是"先写下要发现的差异，再反推样本量"——
 *       20 个任务只能发现约 30 个百分点的差异（讲义 6.2 的 0.1）。
 *
 * @param {{ baselineRate: number, targetDelta: number }} opts
 * @returns {{ tasks: number }}
 */
export function sampleSize(opts) {
  throw new Error('未实现：sampleSize')
}

/**
 * 重采样置信区间（同种子可复现）。
 *
 * 契约要点：
 *   - 有放回重采样（每次抽 samples.length 个）算均值，取 iters 次
 *   - lo 取 (1-level)/2 分位、hi 取 1-(1-level)/2 分位（用 percentile）
 *   - **同一 seed 两次调用结果相同**
 *   - lo <= hi；空数组或单元素 → 抛错（信息含「样本」）
 *
 * @param {number[]} samples
 * @param {{ level?: number, iters?: number, seed?: number }} opts
 * @returns {{ lo: number, hi: number }}
 */
export function bootstrapCI(samples, opts) {
  throw new Error('未实现：bootstrapCI')
}

/**
 * 比较两个方法。
 *
 * 契约要点：
 *   - delta = mean(b) - mean(a)
 *   - significant 的定义是**两个区间不重叠**（重叠时必须为 false）
 *   - effectSize = delta / pooledSd；pooledSd 为 0 时取 0
 *   - n 为两数组长度之和
 *
 * 提示："区间重叠即不显著"是这一卷最重要的一条判据——它挡住的是
 *       "看起来有差异、其实落在噪声里"的结论。
 *
 * @param {number[]} a
 * @param {number[]} b
 * @param {{ level?: number, iters?: number, seed?: number }} opts
 * @returns {{ delta: number, ciA: object, ciB: object, significant: boolean, effectSize: number, n: number }}
 */
export function compare(a, b, opts) {
  throw new Error('未实现：compare')
}
