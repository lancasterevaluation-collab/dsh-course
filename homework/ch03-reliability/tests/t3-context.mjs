// Part C 的判据（12 条）。对应讲义 3.3 与 CONTRACT.md 的「Part C」。
//
// 三个反直觉的判据在这里被直接检验：阈值恰好等于时不触发、范围不足最小时不压缩、
// 溢出时 inline 必须同时含头尾且带指针。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('context')
const s = createSuite('Part C · 压缩与溢出', { weight: 15 })

// ── shouldCompact ──────────────────────────────────────────────
s.check('C1 使用率严格大于阈值时触发', () => {
  assert.eq(impl.shouldCompact({ usedTokens: 80, maxTokens: 100 }, { threshold: 0.7 }), true)
})

s.check('C2 恰好等于阈值时不触发', () => {
  assert.eq(impl.shouldCompact({ usedTokens: 70, maxTokens: 100 }, { threshold: 0.7 }), false)
})

s.check('C3 使用率为 0 时不触发', () => {
  assert.eq(impl.shouldCompact({ usedTokens: 0, maxTokens: 100 }, { threshold: 0.7 }), false)
})

s.check('C4 不修改参数', () => {
  const state = Object.freeze({ usedTokens: 90, maxTokens: 100 })
  impl.shouldCompact(state, Object.freeze({ threshold: 0.5 }))
})

// ── compactRange ───────────────────────────────────────────────
const ev = (n) => Array.from({ length: n }, (_, i) => ({ seq: i + 1, type: 'session/user' }))

s.check('C5 保留末尾 keepTail 条（to 为保留区的第一条 seq）', () => {
  const r = impl.compactRange(ev(10), { keepTail: 3, minRange: 2 })
  assert.deepEq(r, { from: 1, to: 8 })
})

s.check('C6 seq 不从 1 开始时 from 取真实首条 seq', () => {
  const events = [{ seq: 100 }, { seq: 101 }, { seq: 102 }, { seq: 103 }]
  const r = impl.compactRange(events, { keepTail: 1, minRange: 2 })
  assert.deepEq(r, { from: 100, to: 103 })
})

s.check('C7 可压缩条数少于 minRange 时返回 null', () => {
  assert.eq(impl.compactRange(ev(5), { keepTail: 4, minRange: 3 }), null)
})

s.check('C8 事件数不超过 keepTail 时返回 null', () => {
  assert.eq(impl.compactRange(ev(2), { keepTail: 2, minRange: 1 }), null)
})

s.check('C9 空数组返回 null', () => {
  assert.eq(impl.compactRange([], { keepTail: 1, minRange: 1 }), null)
})

// ── spill ──────────────────────────────────────────────────────
s.check('C10 不超预算时原样返回且无指针', () => {
  const r = impl.spill('短内容', { maxChars: 100, headRatio: 0.6 })
  assert.eq(r.inline, '短内容')
  assert.eq(r.pointer, null)
  assert.eq(r.spilled, null)
})

s.check('C11 超预算时保留完整内容、给出指针、inline 含头尾且不超预算', () => {
  const content = 'HEAD' + 'x'.repeat(5000) + 'TAIL'
  const r = impl.spill(content, { maxChars: 300, headRatio: 0.6 })
  assert.eq(r.spilled, content, '完整内容必须被保留')
  assert.ok(typeof r.pointer === 'string' && r.pointer.length > 0, '必须给出非空指针')
  assert.ok(r.inline.includes('HEAD'), 'inline 应含头部')
  assert.ok(r.inline.includes('TAIL'), 'inline 应含尾部')
  assert.ok(r.inline.length <= 300, `inline 不得超预算，实际 ${r.inline.length}`)
})

s.check('C12 应用压缩：替换区间、水位线为被替换部分的末尾 seq、不修改入参', () => {
  const events = ev(10)
  const frozen = JSON.parse(JSON.stringify(events))
  const r = impl.applyCompaction(events, { from: 1, to: 8 }, '前七条的小结')
  const compaction = r.events.filter((e) => e.type === 'session/compaction')
  assert.eq(compaction.length, 1, '应当只有一条压缩事件')
  assert.eq(compaction[0].atSeq, 7, 'atSeq 为被替换部分的最后一条 seq')
  assert.eq(compaction[0].summary, '前七条的小结')
  assert.eq(r.watermark, 7, '水位线等于 atSeq')
  assert.eq(r.events.length, 4, '替换后的条数：1 条压缩事件 + 3 条保留')
  assert.deepEq(events, frozen, '不得修改传入数组')
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
