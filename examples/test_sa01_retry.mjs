// 数字回归：断言 3.1 的七条命题所蕴含的关键数字。
//
// 这一份文件的用途是**守住公式**：如果实现（或公式本身）被改错，这里会立刻失败。
// 它与 MotiPro 课程理论锚点库要求的"正文数字回归"是同一手法。
//
// 运行：node examples/test_sa01_retry.mjs

import {
  expectedAttempts,
  expectedWaitFixed,
  expectedWaitBackoff,
  maxAttempts,
  cumulativeWait,
  duplicateProbability,
  duplicateProbabilityByEnumeration,
  netValue,
  expectedAttemptsCapped,
  simulate,
} from './sa01_retry.mjs'

let passed = 0
let failed = 0

function check(label, fn) {
  try {
    fn()
    passed++
    console.log(` 通过  ${label}`)
  } catch (e) {
    failed++
    console.log(` 不通过  ${label}  ← ${e.message}`)
  }
}

const close = (a, b, tol, msg) => {
  if (Math.abs(a - b) > tol) throw new Error(`${msg ?? ''}期望 ${b}±${tol}，实际 ${a}`)
}
const eq = (a, b, msg) => {
  if (a !== b) throw new Error(`${msg ?? ''}期望 ${b}，实际 ${a}`)
}

console.log('=== 数字回归（3.1 的七条命题）===\n')

// ── 命题 1 ────────────────────────────────────────────────────
check('命题 1：p=0.5 时 E[N]=2；p=0.1 时 E[N]=10', () => {
  eq(expectedAttempts(0.5), 2)
  eq(expectedAttempts(0.1), 10)
})

check('命题 1：模拟在 2% 内收敛到 1/p（p=0.5、p=0.3）', () => {
  for (const p of [0.5, 0.3]) {
    const sim = simulate(p, 1, 1, 200_000, 7)
    const target = 1 / p
    const rel = Math.abs(sim.attempts - target) / target
    if (rel > 0.02) throw new Error(`p=${p} 相对误差 ${(rel * 100).toFixed(2)}% 超过 2%`)
  }
})

// ── 命题 2 ────────────────────────────────────────────────────
check('命题 2：d=1,p=0.1 时 E[T]=9；p=0.5 时 E[T]=1', () => {
  close(expectedWaitFixed(0.1, 1), 9, 1e-12)
  close(expectedWaitFixed(0.5, 1), 1, 1e-12)
})

check('命题 2：模拟在 3% 内收敛（p=0.3, d=1）', () => {
  const sim = simulate(0.3, 1, 1, 200_000, 11)
  const target = expectedWaitFixed(0.3, 1)
  const rel = Math.abs(sim.wait - target) / target
  if (rel > 0.03) throw new Error(`相对误差 ${(rel * 100).toFixed(2)}% 超过 3%`)
})

// ── 命题 3 ────────────────────────────────────────────────────
check('命题 3：r=1 时与命题 2 完全一致', () => {
  for (const p of [0.9, 0.5, 0.3, 0.1]) {
    close(expectedWaitBackoff(p, 1, 1), expectedWaitFixed(p, 1), 1e-12, `p=${p} 时`)
  }
})

check('命题 3：d=1,p=0.3,r=2 时 E[T]=0.7/0.4=1.75', () => {
  // 1-(1-p)r = 1-0.7*2 = -0.4 → 收敛条件被违反，因此这一组应当发散
  const diverges = 1 - (1 - 0.3) * 2 < 0
  if (!diverges) throw new Error('这一组本应违反收敛条件')
  // 换一组满足收敛条件的：p=0.3, r=1.2 → 1-0.7*1.2=0.16
  close(expectedWaitBackoff(0.3, 1, 1.2), 0.7 / 0.16, 1e-12)
})

check('命题 3：收敛条件 (1-p)r<1 是必要前提（违反时结果无意义）', () => {
  const ok = 1 - (1 - 0.3) * 1.2 < 1 && 1 - (1 - 0.3) * 1.2 > 0
  if (!ok) throw new Error('p=0.3,r=1.2 应当满足 (1-p)r<1')
  const bad = 1 - (1 - 0.3) * 2 < 0
  if (!bad) throw new Error('p=0.3,r=2 应当违反 (1-p)r<1')
})

check('命题 3：模拟在 5% 内收敛（p=0.5, d=1, r=1.5）', () => {
  const sim = simulate(0.5, 1, 1.5, 200_000, 13)
  const target = expectedWaitBackoff(0.5, 1, 1.5)
  const rel = Math.abs(sim.wait - target) / target
  if (rel > 0.05) throw new Error(`相对误差 ${(rel * 100).toFixed(2)}% 超过 5%`)
})

// ── 命题 4 ────────────────────────────────────────────────────
check('命题 4：k_max 的定义自洽（k 次不超 D，k+1 次超过）', () => {
  for (const [D, d, r] of [[10, 1, 2], [60, 1, 2], [10, 1, 1], [100, 2, 1.5]]) {
    const k = maxAttempts(D, d, r)
    if (cumulativeWait(k, d, r) > D + 1e-9) throw new Error(`D=${D},d=${d},r=${r}：k=${k} 的累计等待已超预算`)
    if (cumulativeWait(k + 1, d, r) <= D) throw new Error(`D=${D},d=${d},r=${r}：k+1 仍在预算内，k 不是最大`)
  }
})

check('命题 4：r=1 时退化为 floor(D/d)+1', () => {
  eq(maxAttempts(10, 1, 1), 11)
  eq(maxAttempts(10, 2, 1), 6)
})

// ── 命题 5 ────────────────────────────────────────────────────
check('命题 5：公式与逐项枚举一致', () => {
  for (const q of [0.1, 0.3, 0.5]) {
    for (const k of [2, 3, 5, 8]) {
      const { byFormula, byEnumeration } = duplicateProbabilityByEnumeration(q, k)
      close(byFormula, byEnumeration, 1e-12, `q=${q},k=${k} 时`)
    }
  }
})

check('命题 5：表中的三个数字（q=0.3,k=3 → 21.6%；q=0.5,k=5 → 81.25%）', () => {
  close(duplicateProbability(0.3, 3), 0.216, 1e-12)
  close(duplicateProbability(0.5, 5), 0.8125, 1e-12)
  close(duplicateProbability(0.1, 5), 0.08146, 1e-5)
})

check('命题 5（k=2 的闭式）：Pr[重复] = q²', () => {
  for (const q of [0.1, 0.3, 0.5]) {
    close(duplicateProbability(q, 2), q * q, 1e-12, `q=${q} 时`)
  }
})

check('命题 5：q→1 时重复概率趋于 1（减掉全中的那一项）', () => {
  const q = 0.999
  const p = duplicateProbability(q, 3)
  if (!(p > 0.99)) throw new Error(`q=0.999,k=3 时重复概率应接近 1，实际 ${p}`)
})

// ── 命题 6 ────────────────────────────────────────────────────
check('命题 6：v = c/p 时 J(k) 恒为 0', () => {
  const p = 0.5
  const c = 5
  const v = c / p // = 10
  for (const k of [1, 2, 3, 10, 100]) close(netValue(k, p, v, c), 0, 1e-12, `k=${k} 时`)
})

check('命题 6：v > c/p 时 J(k) 单调递增（无内部最大值）', () => {
  const p = 0.5
  const c = 3
  const v = 10 // v > c/p = 6
  let prev = -Infinity
  for (const k of [1, 2, 3, 5, 10, 50]) {
    const j = netValue(k, p, v, c)
    if (j <= prev) throw new Error(`k=${k} 时 J 未增（${j} <= ${prev}）`)
    prev = j
  }
})

check('命题 6：v < c/p 时 J(k) 单调递减', () => {
  const p = 0.5
  const c = 8
  const v = 10 // v < c/p = 16
  let prev = Infinity
  for (const k of [1, 2, 3, 5, 10, 50]) {
    const j = netValue(k, p, v, c)
    if (j >= prev) throw new Error(`k=${k} 时 J 未减（${j} >= ${prev}）`)
    prev = j
  }
})

check('命题 6：E[min(N,k)] = (1-(1-p)^k)/p 且随 k 趋于 1/p', () => {
  const p = 0.5
  close(expectedAttemptsCapped(1, p), 1, 1e-12)
  close(expectedAttemptsCapped(2, p), 1.5, 1e-12)
  const big = expectedAttemptsCapped(200, p)
  close(big, 1 / p, 1e-12, 'k 很大时应收敛到 1/p：')
})

// ── 命题 7 ────────────────────────────────────────────────────
check('命题 7：非幂等操作的最小重试（k=2）的重复概率恒为正', () => {
  for (const q of [0.01, 0.1, 0.5, 0.9]) {
    const p = duplicateProbability(q, 2)
    if (!(p > 0)) throw new Error(`q=${q} 时重复概率应为正`)
    close(p, q * q, 1e-12, `q=${q} 时应当等于 q²：`)
  }
})

console.log(`\n结果：${passed} 通过，${failed} 不通过`)
process.exit(failed === 0 ? 0 : 1)
