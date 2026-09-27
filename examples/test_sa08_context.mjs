// 3.3 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  shouldCompress, totalTokens, findCompressionPoint, spill, compressionEvent,
  tokensToRounds, auditMissRate, auditSampleSize, cumulativeError,
  fidelityBound, isIdempotent, foldEvents,
} from './sa08_context.mjs'

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

// 定义 3.3.1：触发线
ok(shouldCompress(7800, 10000), 'used=7800 时触发（触发线 0.75）')
ok(!shouldCompress(7000, 10000), 'used=7000 时不触发')
ok(shouldCompress(7500, 10000), '恰好等于触发线时触发')
ok(!shouldCompress(7800, 10000, 0.9), '提高触发线后不触发')

// 命题 3.3.4：压缩点回退到配对边界
const msgs = [
  { tokens: 3000, kind: 'system' },
  { tokens: 5000, kind: 'user' },
  { tokens: 200, kind: 'tool-call' },
  { tokens: 4000, kind: 'tool-result' },
  { tokens: 800, kind: 'assistant' },
]
eq(totalTokens(msgs), 13000, '序列总 token 数')
const cp = findCompressionPoint(msgs, 4500)
ok(msgs[cp]?.kind !== 'tool-result', '压缩点不落在 tool-result 上（配对不被拆开）')
eq(cp, 4, '保留量 4500 时压缩点回退到下标 4')
const cp2 = findCompressionPoint(msgs, 800)
ok(msgs[cp2]?.kind !== 'tool-result', '保留量很小时的压缩点同样不拆配对')

// 定义 3.3.5：溢出
const big = { id: 'log-1', tokens: 50000, content: 'x'.repeat(5000) }
const sp = spill(big, 10000)
ok(sp.spilled, '超单条上限时外置')
eq(sp.message.tokens, 20, '指针本身很小')
eq(sp.message.preview.length, 200, '指针带预览')
const small = { id: 'm-1', tokens: 100, content: 'short' }
ok(!spill(small, 10000).spilled, '未超上限时不外置')

// 定义 3.3.2：压缩事件
const ev = compressionEvent(msgs, 0, 2, { text: '摘要', tokens: 300 })
eq(ev.beforeTokens, 8000, '事件记录压缩前 token 数')
eq(ev.afterTokens, 300, '事件记录压缩后 token 数')
eq(ev.origin, 0, '事件记录派生起点')
eq(ev.range, [0, 2], '事件记录被压缩区间')

// 二 2.3：轮数换算
near(tokensToRounds(50000, 2000), 25, 1e-9, '50,000 token 约等于 25 轮容量')

// 命题 3.3.6：抽样审计
near(auditMissRate(0.1, 10), 0.349, 1e-3, '抽查 10 条的漏检概率（q=0.1）')
near(auditMissRate(0.1, 30), 0.042, 1e-3, '抽查 30 条的漏检概率（q=0.1）')
near(auditMissRate(0.1, 0), 1, 1e-9, '抽查 0 条时漏检概率为 1')
ok(auditMissRate(0.1, 30) < auditMissRate(0.1, 10), '抽查越多漏检越低')
eq(auditSampleSize(0.1), 71, '检出 q=0.1 所需抽查量')
eq(auditSampleSize(0.3), 19, '检出 q=0.3 所需抽查量')
ok(auditSampleSize(0.1) > auditSampleSize(0.3), '缺陷率越小所需样本越大')

// 命题 3.3.3：累积误差
near(cumulativeError([0.05, 0.05, 0.05]), 0.15, 1e-9, '三次 0.05 偏离累积为 0.15')
eq(cumulativeError([]), 0, '无压缩时累积误差为 0')

// 命题 3.3.1：保真度上界
near(fidelityBound(1000, 5000, 1), 0.8, 1e-9, '压缩比 0.2、γ=1 时保真度上界 0.8')
near(fidelityBound(1000, 5000, 2), 0.96, 1e-9, 'γ=2 时上界更高')
near(fidelityBound(5000, 5000, 1), 0, 1e-9, '不压缩时上界为 0（模型在无失真时给出 0 增量）')
near(fidelityBound(0, 5000, 1), 1, 1e-9, '预算为 0 时上界为 1')

// 命题 3.3.5：不动点
const det = (seq) => [...seq.slice(0, 1), { tokens: Math.max(100, Math.floor(totalTokens(seq) / 2)), kind: 'summary' }]
eq(isIdempotent(det, msgs, 10000).ok, true, '确定性压缩收敛到不动点')
eq(isIdempotent(det, msgs, 10000).cycle, false, '确定性压缩不出现循环')
let flip = 0
const rand = (seq) => {
  flip++
  return [{ tokens: flip % 2 === 0 ? 9000 : 8000, kind: 'summary' }]
}
eq(isIdempotent(rand, msgs, 10000).cycle, true, '不确定压缩出现循环（前提会变）')

// 定义 3.3.6：折叠
const folded = foldEvents([
  { origin: 0, beforeTokens: 8000, afterTokens: 300, error: 0.05 },
  { origin: 4, beforeTokens: 6000, afterTokens: 250, error: 0.04 },
])
eq(folded.count, 2, '折叠记录压缩次数')
eq(folded.totalRemoved, 13450, '折叠记录总共压缩掉的 token')
near(folded.accumulatedError, 0.09, 1e-9, '折叠记录累积误差')
eq(foldEvents([]), null, '无事件时折叠结果为 null')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
