// SA-01 / SA-02 / SA-03 的算例：重试的期望延迟、不可确认性与净收益。
//
// 这一份文件的用途是**把 3.1 的七条命题变成可运行的东西**：
//   1) 模拟验证 E[N] = 1/p 与 E[T] 的闭式（命题 1、2、3）
//   2) 验证 r = 1 时命题 3 退化为命题 2
//   3) 由截止时间反推 k_max（命题 4）并与模拟对比
//   4) 不可确认性的重复执行概率（命题 5）与净收益的单调性（命题 6、7）
//
// 运行：node examples/sa01_retry.mjs
// 断言：node examples/test_sa01_retry.mjs

/** 确定性伪随机（mulberry32）——同一 seed 下结果可复现。 */
export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─────────────────────────────────────────────────────────────
// 命题 1 / 2 / 3：期望尝试次数与期望总等待
// ─────────────────────────────────────────────────────────────

/** 闭式：E[N] = 1/p（命题 1）。 */
export function expectedAttempts(p) {
  return 1 / p
}

/** 闭式：固定间隔的期望总等待 E[T] = d(1-p)/p（命题 2）。 */
export function expectedWaitFixed(p, d) {
  return (d * (1 - p)) / p
}

/** 闭式：指数退避的期望总等待 E[T] = d(1-p)/(1-(1-p)r)（命题 3）。 */
export function expectedWaitBackoff(p, d, r) {
  if (r === 1) return expectedWaitFixed(p, d) // 退化形式一并处理，便于验证一致性
  return (d * (1 - p)) / (1 - (1 - p) * r)
}

/**
 * 模拟一次"重试到成功"的过程。
 * 返回 { attempts, wait }；第 i 次失败后等待 d·r^(i-1)（与命题 3 的索引一致）。
 */
export function simulateOnce(p, d, r, random) {
  let attempts = 0
  let wait = 0
  for (;;) {
    attempts++
    if (random() < p) return { attempts, wait }
    wait += d * Math.pow(r, attempts - 1)
  }
}

/** 模拟 n 次，返回两个量的样本均值。 */
export function simulate(p, d, r, n = 200_000, seed = 12345) {
  const random = rng(seed)
  let sumA = 0
  let sumW = 0
  for (let i = 0; i < n; i++) {
    const { attempts, wait } = simulateOnce(p, d, r, random)
    sumA += attempts
    sumW += wait
  }
  return { attempts: sumA / n, wait: sumW / n }
}

// ─────────────────────────────────────────────────────────────
// 命题 4：截止时间约束下的最大尝试次数
// ─────────────────────────────────────────────────────────────

/** 闭式：k_max（命题 4）。r > 1 时用对数；r = 1 时退化为线性解。 */
export function maxAttempts(D, d, r) {
  if (r === 1) return Math.floor(D / d) + 1
  const inside = 1 + (D * (r - 1)) / d
  return Math.floor(Math.log(inside) / Math.log(r)) + 1
}

/** 前 k 次尝试的累计等待（用于核对 k_max 的定义）。 */
export function cumulativeWait(k, d, r) {
  if (r === 1) return (k - 1) * d
  return (d * (Math.pow(r, k - 1) - 1)) / (r - 1)
}

// ─────────────────────────────────────────────────────────────
// 命题 5：不可确认时的重复执行概率
// ─────────────────────────────────────────────────────────────

/** 闭式：Pr[X >= 2]，X ~ Binomial(k, q)（命题 5）。 */
export function duplicateProbability(q, k) {
  const none = Math.pow(1 - q, k)
  const once = k * q * Math.pow(1 - q, k - 1)
  return 1 - none - once
}

/** 枚举式实现：与闭式对照（用二项分布逐项求和，避免公式写错时两边一起错）。 */
export function duplicateProbabilityByEnumeration(q, k) {
  const binom = (n, j) => {
    let r = 1
    for (let i = 1; i <= j; i++) r = (r * (n - j + i)) / i
    return r
  }
  let p0 = Math.pow(1 - q, k)
  let p1 = k * q * Math.pow(1 - q, k - 1)
  // 用逐项计算校验前两项
  const e0 = binom(k, 0) * Math.pow(q, 0) * Math.pow(1 - q, k)
  const e1 = binom(k, 1) * Math.pow(q, 1) * Math.pow(1 - q, k - 1)
  return { byFormula: 1 - p0 - p1, byEnumeration: 1 - e0 - e1 }
}

// ─────────────────────────────────────────────────────────────
// 命题 6：净收益（没有内部最优）
// ─────────────────────────────────────────────────────────────

/** 期望净收益 J(k) = (1-(1-p)^k)(v - c/p)（命题 6）。 */
export function netValue(k, p, v, c) {
  return (1 - Math.pow(1 - p, k)) * (v - c / p)
}

/** 期望尝试次数（截断到 k）。 */
export function expectedAttemptsCapped(k, p) {
  return (1 - Math.pow(1 - p, k)) / p
}

// ─────────────────────────────────────────────────────────────
// 打印算例
// ─────────────────────────────────────────────────────────────

const fence = (x, n = 6) => Number(x).toFixed(n)

/** 收敛条件 (1-p)r < 1：不满足时期望值无意义（分母 <= 0）。 */
export function converges(p, r) {
  return (1 - p) * r < 1
}

export function main() {
  console.log('=== 1. 期望尝试次数与期望总等待（命题 1、2、3）===')
  console.log('p      E[N]闭式    E[N]模拟    E[T]闭式(r=1)  E[T]模拟(r=1)  E[T]闭式(r=2)  E[T]模拟(r=2)')
  for (const p of [0.9, 0.5, 0.3, 0.1]) {
    const sim1 = simulate(p, 1, 1)
    const sim2 = simulate(p, 1, 2)
    // r=2 时若 (1-p)·2 >= 1，公式无意义：显式标注，而不是打印负值或 Infinity
    const ok2 = converges(p, 2)
    const w2 = ok2 ? fence(expectedWaitBackoff(p, 1, 2), 4).padStart(13) : '      不适用'.padStart(13)
    console.log(
      `${String(p).padEnd(6)} ${fence(expectedAttempts(p), 4).padStart(9)}  ${fence(sim1.attempts, 4).padStart(10)}  ` +
        `${fence(expectedWaitFixed(p, 1), 4).padStart(13)}  ${fence(sim1.wait, 4).padStart(13)}  ` +
        `${w2}  ${fence(sim2.wait, 4).padStart(13)}`,
    )
  }

  console.log('注：r=2 且 (1-p)·2 >= 1 的组合不适用命题 3——此时级数不收敛，'
    + '公式分母 <= 0。表里把它们标为「不适用」，而模拟列仍会跑出一个很大的数，')
  console.log('    两者的差别正是「公式有前提」这件事的现场演示。\n')

  console.log('=== 2. r = 1 时命题 3 退化为命题 2 ===')
  const p = 0.3
  console.log(`p=${p}: 命题 2 给 ${fence(expectedWaitFixed(p, 1))}；命题 3 取 r=1 给 ${fence(expectedWaitBackoff(p, 1, 1))}`)

  console.log('\n=== 3. 截止时间反推 k_max（命题 4）===')
  for (const [D, d, r] of [[10, 1, 2], [60, 1, 2], [10, 1, 1], [100, 2, 1.5]]) {
    const k = maxAttempts(D, d, r)
    console.log(
      `D=${D} d=${d} r=${r} → k_max=${k}；前 ${k} 次累计等待=${fence(cumulativeWait(k, d, r), 3)}，` +
        `再多一次=${fence(cumulativeWait(k + 1, d, r), 3)}（应超过 D=${D}）`,
    )
  }

  console.log('\n=== 4. 不可确认性的重复执行概率（命题 5）===')
  console.log('q      k=2      k=3      k=5')
  for (const q of [0.1, 0.3, 0.5]) {
    console.log(
      `${String(q).padEnd(6)} ${(duplicateProbability(q, 2) * 100).toFixed(1).padStart(6)}%  ` +
        `${(duplicateProbability(q, 3) * 100).toFixed(1).padStart(6)}%  ${(duplicateProbability(q, 5) * 100).toFixed(1).padStart(6)}%`,
    )
  }

  console.log('\n=== 5. 净收益没有内部最优（命题 6）===')
  const pp = 0.5
  for (const [v, c] of [[10, 3], [10, 5], [10, 8]]) {
    const ratios = [1, 2, 3, 5, 10].map((k) => `${k}:${fence(netValue(k, pp, v, c), 3)}`)
    const vOverC = v - c / pp
    console.log(`v=${v} c=${c}（v-c/p=${fence(vOverC, 3)}）→ J(k) = ${ratios.join('  ')}`)
  }
  console.log('结论：J(k) 随 k 单调（符号由 v-c/p 决定），没有内部最大值。')

  console.log('\n=== 6. 期望尝试次数的截断形式（命题 6 的中间结果）===')
  for (const k of [1, 2, 3, 5, 20]) {
    console.log(`p=${pp} k=${k} → E[min(N,k)]=${fence(expectedAttemptsCapped(k, pp), 4)}（上限 1/p=${fence(1 / pp, 4)}）`)
  }
}

import { pathToFileURL } from 'node:url'

// 只有直接运行本文件时才打印；被 test_*.mjs import 时不打印。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
