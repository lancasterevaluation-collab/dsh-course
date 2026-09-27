// 6.2 配备算例：样本量、MDE、族错误率、多重比较校正、随机化、随机源检查。
//
// 每个函数对应讲义 6.2 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa13_experiment.mjs
import { pathToFileURL } from 'node:url'

/** 可复现的记录清单：随机源就是可复现清单（命题 6.2.6）。 */
export const RANDOM_SOURCES = ['seed', 'temperature', 'task_order', 'concurrency', 'dep_versions', 'env']

/**
 * 命题 6.2.6：检查随机源是否记全。
 * @param record 实验记录 @returns `{ ok, missing }`
 */
export function checkReproducible(record) {
  const missing = RANDOM_SOURCES.filter((k) => record[k] === undefined || record[k] === null)
  return { ok: missing.length === 0, missing }
}

/** 标准正态分位数（Acklam 逼近）。@param p 累积概率 @returns 分位数 */
export function quantileNormal(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const plow = 0.02425
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - plow) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/**
 * 工具箱 5.1：由目标差异反推每组样本量。
 * @param delta 要检出的差异 @param sigma 单次运行的标准差
 * @param alpha 显著性水平 @param power 功效
 * @returns 每组所需样本量
 */
export function sampleSize(delta, sigma, alpha = 0.05, power = 0.8) {
  const z = quantileNormal(1 - alpha / 2) + quantileNormal(power)
  return Math.ceil(2 * sigma * sigma * z * z / (delta * delta))
}

/**
 * 定义 6.2.4：最小可检测效应。与 sampleSize 互为逆运算。
 * @param n 每组样本量 @param sigma 标准差 @param alpha 显著性水平 @param power 功效
 * @returns 可检出的最小差异
 */
export function mde(n, sigma, alpha = 0.05, power = 0.8) {
  const z = quantileNormal(1 - alpha / 2) + quantileNormal(power)
  return z * sigma * Math.sqrt(2 / n)
}

/**
 * 定义 6.2.5 / 命题 6.2.4：族错误率。
 * @param m 比较次数 @param alpha 单次显著性水平 @returns 至少误拒一次的概率
 */
export function familyErrorRate(m, alpha) {
  return 1 - Math.pow(1 - alpha, m)
}

/**
 * 工具箱 5.2：Bonferroni 校正，控制 FWER。
 * @param pvalues p 值数组 @param alpha 显著性水平
 * @returns `{ threshold, rejected }`（rejected 为原始下标）
 */
export function bonferroni(pvalues, alpha) {
  const threshold = alpha / pvalues.length
  return { threshold, rejected: pvalues.map((p, i) => (p <= threshold ? i : -1)).filter((i) => i >= 0) }
}

/**
 * 工具箱 5.2：Benjamini-Hochberg，控制错误发现比例。
 * @param pvalues p 值数组 @param q 目标 FDR
 * @returns `{ k, rejected }`
 */
export function benjaminiHochberg(pvalues, q = 0.05) {
  const m = pvalues.length
  const order = pvalues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p)
  let k = 0
  order.forEach((o, idx) => { if (o.p <= ((idx + 1) / m) * q) k = idx + 1 })
  return { k, rejected: order.slice(0, k).map((o) => o.i) }
}

/** 可复现的伪随机数发生器（mulberry32）。@param seed 种子 @returns 返回 [0,1) 的函数 */
export function rngFrom(seed) {
  let s = seed >>> 0
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 工具箱 5.4：可记录种子的随机分配。
 * @param units 实验单元 @param seed 种子 @returns `{ order, seed }`
 */
export function randomize(units, seed) {
  const rng = rngFrom(seed)
  const a = [...units]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return { order: a, seed }
}

/**
 * 命题 6.2.1：选择偏差分解。观测差 = 因果效应 + 选择偏差项。
 * @param tau 真实因果效应 @param uGap 混杂在两组的均值差 @param betaU 混杂对响应的效应
 * @returns `{ observed, bias }`
 */
export function selectionBias(tau, uGap, betaU) {
  const bias = uGap * betaU
  return { observed: tau + bias, bias }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(42)} ${v}`)

  const sigma = 16
  for (const d of [10, 5, 3, 1]) {
    line(`样本量 @ Δ=${d}, σ=${sigma}`, sampleSize(d, sigma))
  }
  line('MDE @ n=40, σ=16', mde(40, sigma).toFixed(2))
  line('Δ=5 与 Δ=10 的样本量之比', (sampleSize(5, sigma) / sampleSize(10, sigma)).toFixed(2) + ' 倍')

  for (const m of [5, 10, 20]) {
    line(`族错误率 @ m=${m}, α=0.05`, familyErrorRate(m, 0.05).toFixed(3))
  }

  const ps = [0.004, 0.011, 0.021, 0.033, 0.19, 0.42]
  line('Bonferroni 阈值 @ m=6', bonferroni(ps, 0.05).threshold.toFixed(4))
  line('Bonferroni 拒绝集合', JSON.stringify(bonferroni(ps, 0.05).rejected))
  line('BH 拒绝集合 @ q=0.05', JSON.stringify(benjaminiHochberg(ps, 0.05).rejected))

  line('选择偏差 @ τ=0, uGap=0.4, β=5', JSON.stringify(selectionBias(0, 0.4, 5)))

  const r1 = randomize(['t1', 't2', 't3', 't4', 't5'], 42)
  const r2 = randomize(['t1', 't2', 't3', 't4', 't5'], 42)
  line('同种子的分配可复现', r1.order.join() === r2.order.join())
  line('分配结果', r1.order.join(','))

  line('随机源检查（全记）', JSON.stringify(checkReproducible({ seed: 1, temperature: 0, task_order: [], concurrency: 1, dep_versions: {}, env: {} }).ok))
  line('随机源检查（缺两项）', JSON.stringify(checkReproducible({ seed: 1 }).missing))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
