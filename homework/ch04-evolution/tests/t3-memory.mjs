// Part C 的判据（14 条）。对应讲义 4.1 与 CONTRACT.md 的「Part C」。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('memory')
const s = createSuite('Part C · 记忆系统', { weight: 20 })

const DAY = 86400000
const entry = (text, extra = {}) => ({ text, kind: 'fact', createdAt: 0, useCount: 0, ...extra })
const store = (entries, capacity = 100) => ({ capacity, entries })

// ── write：三个过滤器 ──────────────────────────────────────────
s.check('C1 会话内信息被拒绝（reason 含跨会话）', () => {
  const r = impl.write({ text: '这次要删掉 build 目录', kind: 'fact', crossSessionUseful: false }, store([]), { similarityThreshold: 0.5 })
  assert.eq(r.ok, false)
  assert.ok(String(r.reason).includes('跨会话'), `reason 应提到跨会话，实际「${r.reason}」`)
})

s.check('C2 临时信息被拒绝（reason 含临时）', () => {
  const r = impl.write({ text: '当前分支名', kind: 'fact', temporary: true }, store([]), { similarityThreshold: 0.5 })
  assert.eq(r.ok, false)
  assert.ok(String(r.reason).includes('临时'), `reason 应提到临时，实际「${r.reason}」`)
})

s.check('C3 推测类无来源时抛错（信息含来源）', () => {
  assert.throws(() => impl.write({ text: '用户可能不熟悉 Rust', kind: 'inference' }, store([]), { similarityThreshold: 0.5 }), '来源')
})

s.check('C4 正常写入：返回条目且 useCount 从 0 开始', () => {
  const r = impl.write({ text: '这个仓库用 pnpm', kind: 'fact', crossSessionUseful: true }, store([]), { similarityThreshold: 0.5 })
  assert.eq(r.ok, true)
  assert.eq(r.entry.useCount, 0)
  assert.ok(r.entry.id, '应当生成 id')
})

s.check('C5 写入不修改传入的 store', () => {
  const st = store([])
  const frozen = JSON.stringify(st)
  impl.write({ text: 'x', kind: 'fact', crossSessionUseful: true }, st, { similarityThreshold: 0.5 })
  assert.eq(JSON.stringify(st), frozen, 'store 不应被修改')
})

s.check('C6 容量满且有相似条目时先合并（返回 mergedInto）', () => {
  const existing = entry('这个仓库用 pnpm 而不是 npm')
  const st = store([existing], 1)
  const r = impl.write({ text: '这个仓库使用 pnpm 而不是 npm', kind: 'fact', crossSessionUseful: true }, st, { similarityThreshold: 0.5 })
  assert.eq(r.ok, true, '应当合并而不是拒绝')
  assert.eq(r.mergedInto, existing.id)
  assert.ok(r.entry.text.includes('；'), '合并后的文本应当含分隔符')
  assert.eq(r.entry.useCount, existing.useCount + 1)
})

s.check('C7 容量满且无相似条目时拒绝（reason 含容量）', () => {
  const st = store([entry('完全不相干的一条内容')], 1)
  const r = impl.write({ text: 'zzzzzzzzzzzzzzzzzzzz', kind: 'fact', crossSessionUseful: true }, st, { similarityThreshold: 0.9 })
  assert.eq(r.ok, false)
  assert.ok(String(r.reason).includes('容量'), `reason 应提到容量，实际「${r.reason}」`)
})

// ── retrieve：过滤与阈值 ───────────────────────────────────────
const now = 1_000 * DAY

s.check('C8 被抑制的条目不参与检索', () => {
  const st = store([entry('偏好中文回复', { suppressedAt: 1 }), entry('偏好简短回复')])
  const got = impl.retrieve('偏好中文', st, { k: 5, threshold: 0.1, now })
  assert.ok(!got.some((e) => e.suppressedAt), '被抑制的条目不应出现')
})

s.check('C9 过期的条目不参与检索', () => {
  const st = store([entry('关于时区的旧记录', { expiresAt: now - DAY }), entry('关于时区的记录')])
  const got = impl.retrieve('时区', st, { k: 5, threshold: 0.1, now })
  assert.eq(got.length, 1)
  assert.ok(!got[0].expiresAt || got[0].expiresAt > now)
})

s.check('C10 低于阈值时返回空（不为凑满 k 而返回）', () => {
  const st = store([entry('偏好中文回复', { createdAt: now - 1000 * DAY })])
  const got = impl.retrieve('完全不同', st, { k: 5, threshold: 0.5, now })
  assert.eq(got.length, 0, '不相关的条目不应被返回')
})

s.check('C11 排序：分数降序、同分按 createdAt 降序、最多 k 条', () => {
  const st = store([
    entry('偏好中文回复', { createdAt: now - 100 * DAY, id: 'old' }),
    entry('偏好中文回复', { createdAt: now, id: 'new' }),
    entry('偏好中文回复', { createdAt: now - 200 * DAY, id: 'older' }),
  ])
  const got = impl.retrieve('偏好中文', st, { k: 2, threshold: 0.1, now, decayDays: 30 })
  assert.eq(got.length, 2)
  assert.eq(got[0].id, 'new', '更新的条目应当排在前（同分时按 createdAt 降序）')
})

// ── inject：预算与格式 ────────────────────────────────────────
s.check('C12 注入受条数与字符双预算限制', () => {
  const entries = [entry('AAAAAAAAAA', { id: 'a', useCount: 5 }), entry('BBBBBBBBBB', { id: 'b', useCount: 4 }), entry('CCCCCCCCCC', { id: 'c', useCount: 3 })]
  const r = impl.inject(entries, { maxEntries: 2, maxChars: 1000 }, {})
  assert.eq(r.picked.length, 2)
  const r2 = impl.inject(entries, { maxEntries: 10, maxChars: 30 }, {})
  assert.ok(r2.chars <= 30, `chars 不得超预算，实际 ${r2.chars}`)
})

s.check('C13 超预算时跳过整条而不是截断，并记入 skipped', () => {
  const long = entry('X'.repeat(200), { id: 'long', useCount: 5 })
  const short = entry('短记忆', { id: 'short', useCount: 1 })
  const r = impl.inject([long, short], { maxEntries: 10, maxChars: 40 }, {})
  assert.ok(r.skipped.includes('long'), '超预算的条目应当被跳过')
  assert.ok(r.picked.includes('short'), '预算内的条目应当被注入')
  assert.ok(!r.text.includes('X'.repeat(50)), '不得截断后注入片段')
})

s.check('C14 观测：五类量正确，空 store 为 0', () => {
  const st = store([
    entry('a', { kind: 'fact', useCount: 2 }),
    entry('b', { kind: 'preference', useCount: 1, suppressedAt: 1 }),
    entry('c', { kind: 'inference', useCount: 3, expiresAt: now - 1 }),
  ])
  const o = impl.observe(st, { now })
  assert.eq(o.entries, 3)
  assert.eq(o.byKind.fact, 1)
  assert.eq(o.byKind.preference, 1)
  assert.eq(o.suppressed, 1)
  assert.eq(o.expired, 1)
  assert.eq(o.totalUse, 6)
  const empty = impl.observe(store([]), { now })
  assert.eq(empty.entries, 0)
  assert.eq(empty.totalUse, 0)
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
