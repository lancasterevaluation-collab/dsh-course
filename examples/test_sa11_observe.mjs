// 3.6 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  PRICES, cost, latencyParts, quantile, mean, guardrails,
  hitLength, cacheEffectivePrice, attributionGap, costAdditive,
} from './sa11_observe.mjs'

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

// 定义 3.6.2：分档成本
near(cost({ input: 1000, output: 0, cacheWrite: 0, cacheRead: 0 }, PRICES), 1, 1e-9, '1000 输入按未命中价 = 1')
near(cost({ input: 0, output: 1000, cacheWrite: 0, cacheRead: 0 }, PRICES), 5, 1e-9, '输出价是输入价的 5 倍')
near(cost({ input: 0, output: 0, cacheWrite: 1000, cacheRead: 0 }, PRICES), 1.25, 1e-9, '缓存写入价 1.25')
near(cost({ input: 0, output: 0, cacheWrite: 0, cacheRead: 1000 }, PRICES), 0.1, 1e-9, '缓存读取价 0.1')
near(cost({ input: 20000, output: 500, cacheWrite: 0, cacheRead: 0 }, PRICES), 22.5, 1e-9, '2 万输入 + 500 输出 = 22.5')

// 命题 3.6.1：可加性
const u1 = { input: 1000, output: 100, cacheWrite: 0, cacheRead: 500 }
const u2 = { input: 2000, output: 200, cacheWrite: 300, cacheRead: 0 }
ok(costAdditive(u1, u2).equal, '同价格表下成本可加')
near(costAdditive(u1, u2).separate, costAdditive(u1, u2).combined, 1e-9, '分次算与合量算一致')

// 定义 3.6.3 / 命题 3.6.6：延迟分解
const marks = { enqueuedAt: 0, startedAt: 50, firstTokenAt: 400, lastTokenAt: 3000, toolDoneAt: 8000, toolMs: 5000 }
const lp = latencyParts(marks)
eq(lp.queue, 50, '排队段')
eq(lp.prefill, 350, '预填充段')
eq(lp.decode, 2600, '生成段')
eq(lp.tool, 5000, '工具段')
eq(lp.total, 8000, '总耗时')
eq(lp.residual, 0, '工具段取净耗时且填满时残余为 0')
// 漏掉一段时残余不为 0
const lp2 = latencyParts({ enqueuedAt: 0, startedAt: 50, firstTokenAt: 400, lastTokenAt: 3000, toolDoneAt: 8000, toolMs: 4200 })
ok(lp2.residual > 0, '调度与网络往返表现为残余（工具净耗时小于墙钟工具段）')
eq(lp2.residual, 800, '残余 = 墙钟工具段 5000 - 工具净耗时 4200')

// 定义 3.6.4 / 命题 3.6.2：命中判定
eq(hitLength('abcXYZ', 'abcABC'), 3, '第 4 个字符起不同 → 命中 3')
eq(hitLength('abc', 'abc'), 3, '完全相同 → 全长命中')
eq(hitLength('abc', 'xyz'), 0, '首位即不同 → 命中 0')
eq(hitLength('', 'abc'), 0, '无缓存 → 命中 0')
eq(hitLength('abcdef', 'abc'), 3, '一个是另一个的前缀 → 取短者')
// 前缀 2 万字符，第 500 位改一字
const longPrev = 'x'.repeat(20000)
const longCur = 'x'.repeat(499) + 'Y' + 'x'.repeat(19500)
eq(hitLength(longPrev, longCur), 499, '第 500 位改动 → 命中截到 499')

// 二 2.3 / 命题 3.6.2：缓存有效价格倍数
near(cacheEffectivePrice(10, 1, 9), 0.215, 1e-9, '1 写 9 读的有效价格倍数 0.215')
near(1 / cacheEffectivePrice(10, 1, 9), 4.651, 1e-3, '相对未命中省约 4.65 倍')
near(cacheEffectivePrice(10, 0, 0), 1.0, 1e-9, '全未命中的倍数 1.000')
near(cacheEffectivePrice(10, 0, 10), 0.1, 1e-9, '全命中（无写入）的倍数 0.1')
let threw = false
try { cacheEffectivePrice(10, 8, 8) } catch { threw = true }
ok(threw, '写入与命中之和超过总次数时抛错')

// 命题 3.6.3：均值与分位数
const longTail = [100, 100, 100, 100, 100, 100, 100, 100, 100, 10000]
near(mean(longTail), 1090, 1e-9, '长尾样本的均值')
eq(quantile(longTail, 0.95).value, 10000, '同一样本的 P95 反映长尾')
eq(quantile(longTail, 0.95).n, 10, '分位数报告连样本量一起给')
// 构造均值相同而 P95 不同的两个分布
const a = Array(100).fill(100)
const b = [...Array(99).fill(0), 10000]
near(mean(a), mean(b), 1e-9, '两个分布均值相同')
ok(quantile(a, 0.95).value !== quantile(b, 0.95).value, '两个分布 P95 不同')
eq(quantile([], 0.5), null, '空样本返回 null')
eq(mean([]), null, '空样本均值为 null')

// 定义 3.6.6：护栏与归因
eq(guardrails({ p95: 3000, cost: 1.2 }, { p95: 2000, cost: 5 }).length, 1, '只有越界的指标被报出')
eq(guardrails({ p95: 1000 }, { p95: 2000 }), [], '未越界时无告警')
eq(guardrails({ p95: 2000 }, { p95: 2000 }), [], '等于上限不算越界')
eq(attributionGap(8000, [50, 350, 2600, 5000]), { gap: 0, ratio: 0 }, '四段之和等于总量时差额为 0')
eq(attributionGap(8000, [50, 350, 2600, 4000]).gap, 1000, '缺一段时差额为缺失部分')
eq(attributionGap(0, []), { gap: 0, ratio: 0 }, '总量为 0 时不除零')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
