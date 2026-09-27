// 6.3 配备算例：pass^k、区间估计、样本量、方差分解、饱和放大。
//
// 每个函数对应讲义 6.3 的一条命题，数值与讲义「八、判据与数字回归」的表一致。
// 只用标准库，可单独运行：node examples/sa06_bench.mjs
import { pathToFileURL } from 'node:url'

/** 命题 6.3.1：pass^k = p^k。@param p 单次成功概率 @param k 独立运行次数 @returns 全部成功的概率 */
export function passHatK(p, k) {
  return Math.pow(p, k)
}

/** 命题 6.3.1：pass@k = 1 - (1-p)^k。@param p 单次成功概率 @param k 独立运行次数 @returns 至少一次成功的概率 */
export function passAtK(p, k) {
  return 1 - Math.pow(1 - p, k)
}

/**
 * 命题 6.3.3：Wilson 区间（小样本与极端比例下比正态近似可靠）。
 * @param successes 成功次数 @param n 试验次数 @param z 分位数，默认 1.96（95%）
 * @returns {{p: number, lo: number, hi: number, half: number}} 点估计、下界、上界、半宽
 */
export function wilson(successes, n, z = 1.96) {
  const p = successes / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return { p, lo: center - half, hi: center + half, half }
}

/**
 * 工具箱 5.2：两比例比较所需样本量（每组）。
 * @param p1 对照成功率 @param p2 目标成功率 @param alpha 第一类错误率 @param power 功效
 * @returns 每组所需样本量（向上取整）
 */
export function sampleSize(p1, p2, alpha = 0.05, power = 0.8) {
  const zA = quantileNormal(1 - alpha / 2)
  const zB = quantileNormal(power)
  const delta = Math.abs(p2 - p1)
  const num = Math.pow(zA + zB, 2) * (p1 * (1 - p1) + p2 * (1 - p2))
  return Math.ceil(num / (delta * delta))
}

/** 标准正态分位数（Acklam 逼近，精度足够教学与设计用）。@param p 右尾概率对应的累积值 @returns 分位数 */
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
 * 定义 6.3.3：乘法式任务分。安全为 0 时总分为 0（命题 6.3.2 的保守性）。
 * @param security 安全门控，0 或 1 @param completion 完成度 [0,1]
 * @param robustness 鲁棒性 [0,1] @param toolUse 工具使用 [0,1] @param consistency 一致性 [0,1]
 * @returns 任务总分
 */
export function taskScore(security, completion, robustness, toolUse, consistency) {
  if (security !== 0 && security !== 1) throw new Error('security 必须是 0 或 1')
  const process = (robustness + toolUse + consistency) / 3
  return security * completion * process
}

/**
 * 命题 6.3.4：平衡两因素方差分解（模型 × harness，含交互）。
 * @param rows 形如 `{ model, harness, score }` 的记录数组，要求平衡设计（每格样本数相同）
 * @returns {{model:number, harness:number, interaction:number, residual:number, total:number}} 四个方差分量与总和
 */
export function varianceComponents(rows) {
  const models = [...new Set(rows.map((r) => r.model))]
  const harnesses = [...new Set(rows.map((r) => r.harness))]
  const cell = new Map()
  for (const r of rows) {
    const k = `${r.model}\u0000${r.harness}`
    if (!cell.has(k)) cell.set(k, [])
    cell.get(k).push(r.score)
  }
  const n = cell.get(`${models[0]}\u0000${harnesses[0]}`).length
  for (const [k, v] of cell) if (v.length !== n) throw new Error(`设计不平衡：${k} 有 ${v.length} 个样本，期望 ${n}`)

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
  const mu = mean(rows.map((r) => r.score))
  const g = (m, h) => mean(cell.get(`${m}\u0000${h}`))
  const rowMean = (m) => mean(harnesses.map((h) => g(m, h)))
  const colMean = (h) => mean(models.map((m) => g(m, h)))

  const M = models.length
  const H = harnesses.length
  const ssA = n * H * models.reduce((s, m) => s + (rowMean(m) - mu) ** 2, 0)
  const ssB = n * M * harnesses.reduce((s, h) => s + (colMean(h) - mu) ** 2, 0)
  const ssAB = n * models.reduce((s, m) => s + harnesses.reduce((t, h) => t + (g(m, h) - rowMean(m) - colMean(h) + mu) ** 2, 0), 0)
  let ssE = 0
  for (const [k, v] of cell) {
    const [m, h] = k.split('\u0000')
    const gmh = g(m, h)
    ssE += v.reduce((s, x) => s + (x - gmh) ** 2, 0)
  }

  const dfA = M - 1
  const dfB = H - 1
  const dfAB = dfA * dfB
  const dfE = M * H * (n - 1)
  const msA = ssA / dfA
  const msB = ssB / dfB
  const msAB = ssAB / dfAB
  const msE = ssE / dfE

  const inter = Math.max(0, (msAB - msE) / n)
  const harness = Math.max(0, (msB - msAB) / (n * M))
  const model = Math.max(0, (msA - msAB) / (n * H))
  const residual = msE
  return { model, harness, interaction: inter, residual, total: model + harness + inter + residual }
}

/**
 * 命题 6.3.5：同一能力提升在更严格的 pass^k 指标下的放大倍数。
 * @param p1 提升前单次成功率 @param p2 提升后单次成功率 @param k 全成功次数
 * @returns pass^k 的绝对增益与单次成功率绝对增益之比
 */
export function saturationGain(p1, p2, k) {
  const strict = passHatK(p2, k) - passHatK(p1, k)
  const loose = Math.abs(p2 - p1)
  return strict / loose
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, value) => rows.push(`${name.padEnd(34)} ${value}`)

  line('pass^8 @ p=0.90', passHatK(0.9, 8).toFixed(6))
  line('pass^8 @ p=0.99', passHatK(0.99, 8).toFixed(6))
  line('pass@8 @ p=0.90', passAtK(0.9, 8).toFixed(9))

  const w300 = wilson(150, 300)
  line('Wilson(150,300) 半宽', w300.half.toFixed(4))
  const w1000 = wilson(500, 1000)
  line('Wilson(500,1000) 半宽', w1000.half.toFixed(4))
  const w131 = wilson(131, 300)
  line('Wilson(131,300)', `p=${w131.p.toFixed(4)} [${w131.lo.toFixed(4)}, ${w131.hi.toFixed(4)}]`)

  line('样本量 Δ=0.10 (0.80→0.90)', sampleSize(0.8, 0.9))
  line('样本量 Δ=0.03 (0.80→0.83)', sampleSize(0.8, 0.83))

  line('饱和放大 @ k=8', saturationGain(0.9, 0.99, 8).toFixed(2) + '×')

  line('taskScore(1,1,0.9,0.9,0.9)', taskScore(1, 1, 0.9, 0.9, 0.9).toFixed(4))
  line('taskScore(0,1,1,1,1) 安全违规', taskScore(0, 1, 1, 1, 1).toFixed(4))

  console.log(rows.join('\n'))

  // 构造一个已知分量的平衡设计，检验分解能否把它们复原
  const synthetic = []
  const A = [0.3, -0.3] // 模型主效应
  const B = [0.2, -0.2] // harness 主效应
  const AB = [[0.1, -0.1], [-0.1, 0.1]]
  for (let mi = 0; mi < 2; mi++) {
    for (let hi = 0; hi < 2; hi++) {
      for (let r = 0; r < 6; r++) {
        const noise = ((r % 3) - 1) * 0.05
        synthetic.push({
          model: `m${mi}`,
          harness: `h${hi}`,
          score: 0.6 + A[mi] + B[hi] + AB[mi][hi] + noise,
        })
      }
    }
  }
  const vc = varianceComponents(synthetic)
  console.log('\n方差分解（合成数据，已知效应 ±0.3 / ±0.2 / ±0.1）')
  for (const [k, v] of Object.entries(vc)) console.log(`  ${k.padEnd(12)} ${v.toFixed(5)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
