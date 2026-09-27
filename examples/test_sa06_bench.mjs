// 6.3 算例的数字回归：讲义「八、判据与数字回归」里每个数字都在这里被断言。
//
// 目的是让讲义与代码不会各自漂移，而不是证明公式正确（公式的证明在讲义第三节）。
import {
  passHatK, passAtK, wilson, sampleSize, quantileNormal,
  taskScore, varianceComponents, saturationGain,
} from './sa06_bench.mjs'

let pass = 0
let fail = 0
const near = (a, b, tol, label) => {
  if (Math.abs(a - b) <= tol) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${a}，期望 ${b}（容差 ${tol}）`)
}
const eq = (a, b, label) => {
  if (a === b) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${a}，期望 ${b}`)
}
const ok = (cond, label) => {
  if (cond) { pass++; return }
  fail++
  console.log(`不通过：${label}`)
}

// ── 命题 6.3.1：pass^k ───────────────────────────────────────────
near(passHatK(0.9, 8), 0.43046721, 1e-6, 'pass^8 @ 0.90')
near(passHatK(0.99, 8), 0.92274469, 1e-6, 'pass^8 @ 0.99')
near(passAtK(0.9, 8), 0.99999999, 1e-8, 'pass@8 @ 0.90')
near(passHatK(0.9, 1), 0.9, 1e-12, 'pass^1 退化为单次成功率')
near(passAtK(0.5, 1), 0.5, 1e-12, 'pass@1 退化为单次成功率')

// ── 命题 6.3.2：乘法评分的保守性 ─────────────────────────────────
eq(taskScore(0, 1, 1, 1, 1), 0, '安全为 0 时任务分为 0')
near(taskScore(1, 1, 0.9, 0.9, 0.9), 0.9, 1e-12, 'taskScore(1,1,0.9,0.9,0.9)')
// 对随机组合验证：总分不超过三分量的最小值
for (let i = 0; i < 200; i++) {
  const c = Math.random(), r = Math.random(), t = Math.random(), s = Math.random()
  const sec = Math.random() < 0.1 ? 0 : 1
  const ts = taskScore(sec, c, r, t, s)
  const proc = (r + t + s) / 3
  ok(ts <= Math.min(sec, c, proc) + 1e-12, `命题 6.3.2 在第 ${i} 组随机值上成立`)
}

// ── 命题 6.3.3：区间宽度按 n^{-1/2} ──────────────────────────────
near(wilson(150, 300).half, 0.0562, 5e-4, 'Wilson(150,300) 半宽')
near(wilson(500, 1000).half, 0.0309, 5e-4, 'Wilson(500,1000) 半宽')
const w131 = wilson(131, 300)
near(w131.p, 0.4367, 5e-4, 'Wilson(131,300) 点估计')
near(w131.lo, 0.3817, 5e-4, 'Wilson(131,300) 下界')
near(w131.hi, 0.4932, 5e-4, 'Wilson(131,300) 上界')
// 半宽随 n 单调下降，且 10 倍样本量把半宽降到约 1/sqrt(10)
const h100 = wilson(50, 100).half
const h1000 = wilson(500, 1000).half
ok(h1000 < h100, '半宽随样本量下降')
near(h100 / h1000, Math.sqrt(10), 0.4, '样本量 ×10 → 半宽 ÷√10')

// ── 工具箱 5.2：样本量反解 ───────────────────────────────────────
eq(sampleSize(0.8, 0.9), 197, '样本量 Δ=0.10')
eq(sampleSize(0.8, 0.83), 2626, '样本量 Δ=0.03')
ok(sampleSize(0.8, 0.83) > sampleSize(0.8, 0.9), '更小的 Δ 需要更多样本')
near(quantileNormal(0.975), 1.959964, 1e-3, 'z_{0.975} ≈ 1.96')
near(quantileNormal(0.8), 0.841621, 1e-3, 'z_{0.8} ≈ 0.8416')

// ── 命题 6.3.5：饱和放大 ─────────────────────────────────────────
near(saturationGain(0.9, 0.99, 8), 5.47, 0.02, '饱和放大 @ k=8')
ok(saturationGain(0.9, 0.99, 8) > saturationGain(0.9, 0.99, 1), 'k 越大放大越明显')

// ── 命题 6.3.4：方差分解 ─────────────────────────────────────────
const synthetic = []
const A = [0.3, -0.3]
const B = [0.2, -0.2]
const AB = [[0.1, -0.1], [-0.1, 0.1]]
for (let mi = 0; mi < 2; mi++) {
  for (let hi = 0; hi < 2; hi++) {
    for (let r = 0; r < 12; r++) {
      synthetic.push({
        model: `m${mi}`,
        harness: `h${hi}`,
        score: 0.6 + A[mi] + B[hi] + AB[mi][hi],
      })
    }
  }
}
const vc = varianceComponents(synthetic)
ok(vc.model >= 0 && vc.harness >= 0 && vc.interaction >= 0 && vc.residual >= 0, '四个分量非负')
ok(vc.model > vc.harness, '模型主效应分量大于 harness 主效应分量（效应量 0.3 > 0.2）')
ok(vc.interaction > 0, '交互分量被分离出来且为正')
near(vc.total, vc.model + vc.harness + vc.interaction + vc.residual, 1e-12, 'total 等于四分量之和')
// 效应量之比 0.3/0.2 = 1.5，其平方为 2.25。估计量假定随机效应，
// 而这里用的是固定效应值，故比值不精确等于 2.25，只要同阶即可。
const ratio = vc.model / vc.harness
ok(ratio > 1.5 && ratio < 5, `模型/harness 分量之比同阶（得到 ${ratio.toFixed(2)}，效应量平方比为 2.25）`)
near(vc.residual, 0, 1e-20, '无噪声数据的残差分量为 0')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
