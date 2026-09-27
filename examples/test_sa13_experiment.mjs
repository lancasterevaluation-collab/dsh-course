// 6.2 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  RANDOM_SOURCES, checkReproducible, quantileNormal, sampleSize, mde,
  familyErrorRate, bonferroni, benjaminiHochberg, rngFrom, randomize, selectionBias,
} from './sa13_experiment.mjs'

let pass = 0
let fail = 0
const near = (a, b, tol, label) => {
  if (Math.abs(a - b) <= tol) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${a}，期望 ${b}`)
}
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}`)
}
const ok = (c, label) => {
  if (c) { pass++; return }
  fail++
  console.log(`不通过：${label}`)
}

// 定义 6.2.4 / 工具箱 5.1：样本量与 MDE
near(quantileNormal(0.975), 1.959964, 1e-3, 'z_{0.975} ≈ 1.96')
near(quantileNormal(0.8), 0.841621, 1e-3, 'z_{0.8} ≈ 0.8416')
eq(sampleSize(10, 16), 41, 'Δ=10、σ=16 时每组 41 次')
eq(sampleSize(5, 16), 161, 'Δ=5、σ=16 时每组 161 次')
eq(sampleSize(3, 16), 447, 'Δ=3、σ=16 时每组 447 次')
eq(sampleSize(1, 16), 4019, 'Δ=1、σ=16 时每组 4019 次')
near(sampleSize(5, 16) / sampleSize(10, 16), 4, 0.1, '差异减半需约 4 倍样本（命题 6.2.3）')
near(mde(40, 16), 10, 0.5, 'n=40、σ=16 时 MDE 约 10（与 sampleSize 互逆）')
near(mde(161, 16), 5, 0.3, 'n=161 时 MDE 约 5')
ok(sampleSize(5, 16) > sampleSize(10, 16), '目标差异越小所需样本越多')

// 定义 6.2.5 / 命题 6.2.4：族错误率
near(familyErrorRate(5, 0.05), 0.226, 1e-3, 'm=5 的族错误率 0.226')
near(familyErrorRate(10, 0.05), 0.401, 1e-3, 'm=10 的族错误率 0.401')
near(familyErrorRate(20, 0.05), 0.642, 1e-3, 'm=20 的族错误率 0.642')
near(familyErrorRate(1, 0.05), 0.05, 1e-12, 'm=1 时族错误率等于单次水平')
near(familyErrorRate(100, 0.05), 0.994, 1e-3, 'm=100 时族错误率接近 1')
ok(familyErrorRate(20, 0.05) > familyErrorRate(10, 0.05), '族错误率随比较次数单调增')

// 工具箱 5.2：两种校正
const ps = [0.004, 0.011, 0.021, 0.033, 0.19, 0.42]
near(bonferroni(ps, 0.05).threshold, 0.05 / 6, 1e-9, 'Bonferroni 阈值为 α/m')
eq(bonferroni(ps, 0.05).rejected, [0], 'Bonferroni 只拒绝 p < 0.05/6 的那一个')
ok(benjaminiHochberg(ps, 0.05).rejected.length >= bonferroni(ps, 0.05).rejected.length, 'BH 的拒绝数不少于 Bonferroni')
eq(benjaminiHochberg([0.5, 0.6, 0.7], 0.05).k, 0, '全不显著时 BH 拒绝集为空')
eq(bonferroni([], 0.05).rejected, [], '空输入不报错')
eq(benjaminiHochberg([0.001], 0.05).k, 1, '单个极小 p 值时 BH 拒绝它')

// 命题 6.2.1：选择偏差分解
eq(selectionBias(0, 0.4, 5), { observed: 2, bias: 2 }, '真实效应为 0 时观测差可完全由偏差产生')
eq(selectionBias(3, 0, 5), { observed: 3, bias: 0 }, '无混杂时观测差等于因果效应（命题 6.2.2 的情形）')
ok(selectionBias(0, 0.4, 5).bias !== 0, '未观测混杂使偏差非零')

// 工具箱 5.4：随机化
const units = ['t1', 't2', 't3', 't4', 't5']
const r1 = randomize(units, 42)
const r2 = randomize(units, 42)
eq(r1.order.join(), r2.order.join(), '同种子的分配结果可复现')
ok(randomize(units, 7).order.join() !== r1.order.join(), '不同种子给出不同分配（大概率）')
eq([...r1.order].sort(), [...units].sort(), '分配是同一集合的排列')
eq(r1.seed, 42, '返回的种子被记录')

// 命题 6.2.6：随机源检查
ok(checkReproducible({ seed: 1, temperature: 0, task_order: [], concurrency: 1, dep_versions: {}, env: {} }).ok, '全记时通过')
eq(checkReproducible({ seed: 1 }).missing.length, 5, '只记一项时列出其余五项')
eq(RANDOM_SOURCES.length, 6, '随机源清单有六项')

// 辅助函数的确定性
eq(JSON.stringify([...Array(3)].map(() => rngFrom(1)())), JSON.stringify([...Array(3)].map(() => rngFrom(1)())), '同一 seed 的随机序列可复现')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
