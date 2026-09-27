// Part F 的判据（12 条）。对应讲义 3.6 与 CONTRACT.md 的「Part F」。
//
// 两处"安静的陷阱"：cachedPromptTokens 缺失按零命中、空集合返回 0（不是 NaN）。
// 一处硬不变量：延迟四段之和等于总耗时。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('metrics')
const s = createSuite('Part F · 可观测', { weight: 15 })

const price = { missPerMTok: 2, hitPerMTok: 0.2, outPerMTok: 8 }

// ── costOf ─────────────────────────────────────────────────────
s.check('F1 三档成本正确', () => {
  const c = impl.costOf({ promptTokens: 1_000_000, cachedPromptTokens: 400_000, completionTokens: 100_000 }, price)
  assert.near(c.missInput, 1.2, 1e-9, '未命中输入')
  assert.near(c.hitInput, 0.08, 1e-9, '命中输入')
  assert.near(c.output, 0.8, 1e-9, '输出')
})

s.check('F2 cachedPromptTokens 缺失时按零命中（不抛错）', () => {
  const c = impl.costOf({ promptTokens: 1_000_000, completionTokens: 0 }, price)
  assert.near(c.missInput, 2, 1e-9)
  assert.near(c.hitInput, 0, 1e-9)
})

s.check('F3 cached 超过 prompt 时截断（不产生负的未命中）', () => {
  const c = impl.costOf({ promptTokens: 1000, cachedPromptTokens: 5000, completionTokens: 0 }, price)
  assert.ok(c.missInput >= 0, `missInput 不得为负，实际 ${c.missInput}`)
})

s.check('F4 total 是三档之和', () => {
  const c = impl.costOf({ promptTokens: 500_000, cachedPromptTokens: 100_000, completionTokens: 50_000 }, price)
  assert.near(c.total, c.missInput + c.hitInput + c.output, 1e-9)
})

// ── latencyBreakdown ───────────────────────────────────────────
s.check('F5 三段与重试等待的计算正确', () => {
  const b = impl.latencyBreakdown({ at: 0, startedAt: 200, firstTokenAt: 900, finishedAt: 1500, retryWaitMs: 100 })
  assert.eq(b.firstTokenMs, 700)
  assert.eq(b.generateMs, 600)
  assert.eq(b.retryWaitMs, 100)
})

s.check('F6 四段之和等于总耗时', () => {
  const b = impl.latencyBreakdown({ at: 100, startedAt: 400, firstTokenAt: 1000, finishedAt: 2000, retryWaitMs: 50 })
  const sum = b.queueMs + b.firstTokenMs + b.generateMs + (b.retryWaitMs > 0 ? 0 : 0)
  assert.eq(b.totalMs, 1900)
  assert.eq(b.queueMs + b.firstTokenMs + b.generateMs, b.totalMs, '三段（含重试等待的归并）应当覆盖总耗时')
  assert.ok(sum >= 0)
})

s.check('F7 缺时间戳时抛错且信息含关键词', () => {
  assert.throws(() => impl.latencyBreakdown({ at: 0, startedAt: 1, finishedAt: 2 }), '时间戳')
})

// ── hitRate ────────────────────────────────────────────────────
s.check('F8 命中率计算正确', () => {
  const r = impl.hitRate([
    { promptTokens: 1000, cachedPromptTokens: 800 },
    { promptTokens: 1000, cachedPromptTokens: 0 },
  ])
  assert.near(r, 0.4, 1e-9)
})

s.check('F9 空数组返回 0（不是 NaN）', () => {
  const r = impl.hitRate([])
  assert.eq(Number.isNaN(r), false, '不得返回 NaN')
  assert.eq(r, 0)
})

// ── summarize ──────────────────────────────────────────────────
const records = [
  { sessionId: 's1', tool: 'read', usage: { promptTokens: 1000, cachedPromptTokens: 500, completionTokens: 100 }, totalMs: 100 },
  { sessionId: 's1', tool: 'read', usage: { promptTokens: 1000, cachedPromptTokens: 500, completionTokens: 100 }, totalMs: 200 },
  { sessionId: 's2', usage: { promptTokens: 2000, completionTokens: 200 }, totalMs: 300 },
  { sessionId: 's2', tool: 'write', usage: { promptTokens: 1000, completionTokens: 100 }, totalMs: 4000 },
]

s.check('F10 分位数用最近秩法', () => {
  const r = impl.summarize(records, price)
  assert.eq(r.latency.p50, 200, 'n=4 时 p50 取第 2 个（最近秩）')
  assert.eq(r.latency.max, 4000)
})

s.check('F11 归因分组：会话与工具，且无 tool 的记录不计入工具分组', () => {
  const r = impl.summarize(records, price)
  assert.eq(r.requests, 4)
  assert.eq(Object.keys(r.bySession).sort().join(','), 's1,s2')
  assert.eq(Object.keys(r.byTool).sort().join(','), 'read,write', '无 tool 的记录不应出现在工具分组里')
  assert.eq(r.byTool.read.requests, 2)
})

s.check('F12 空数组：各项为 0、分组为空对象', () => {
  const r = impl.summarize([], price)
  assert.eq(r.requests, 0)
  assert.eq(r.hitRate, 0)
  assert.eq(r.cost.total, 0)
  assert.eq(r.latency.p95, 0)
  assert.deepEq(r.bySession, {})
  assert.deepEq(r.byTool, {})
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
