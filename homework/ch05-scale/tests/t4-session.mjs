// Part D 的判据（14 条）。对应讲义 5.2 与 CONTRACT.md 的「Part D」。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('session')
const s = createSuite('Part D · 多会话与并发', { weight: 20 })

const policy = { globalMaxConcurrent: 4, maxConcurrentPerSession: 2, maxTokensPerMinute: 1000 }
const reg = (over = {}) => ({
  globalRunning: () => 0,
  sessionRunning: () => 0,
  tokensInWindow: () => 0,
  estimate: () => 10,
  ...over,
})

// ── admit ──────────────────────────────────────────────────────
s.check('D1 正常放行', () => {
  assert.eq(impl.admit({ sessionId: 's1' }, reg(), policy).ok, true)
})

s.check('D2 全局满时拒绝（即使该会话未满）', () => {
  const r = impl.admit({ sessionId: 's1' }, reg({ globalRunning: () => 4 }), policy)
  assert.eq(r.ok, false)
  assert.ok(String(r.reason).includes('全局'), `reason 应提到全局，实际「${r.reason}」`)
  assert.ok(r.retryAfter > 0)
})

s.check('D3 会话满时拒绝（reason 含会话）', () => {
  const r = impl.admit({ sessionId: 's1' }, reg({ sessionRunning: () => 2 }), policy)
  assert.eq(r.ok, false)
  assert.ok(String(r.reason).includes('会话'))
})

s.check('D4 速率超限时拒绝且等待更长（>= 1000ms）', () => {
  const r = impl.admit({ sessionId: 's1' }, reg({ tokensInWindow: () => 995 }), policy)
  assert.eq(r.ok, false)
  assert.ok(String(r.reason).includes('速率'))
  assert.ok(r.retryAfter >= 1000, `速率超限的等待应当更长，实际 ${r.retryAfter}`)
})

s.check('D5 判决顺序：全局先于会话（两者都满时报全局）', () => {
  const r = impl.admit({ sessionId: 's1' }, reg({ globalRunning: () => 4, sessionRunning: () => 2 }), policy)
  assert.ok(String(r.reason).includes('全局'), `应当先报全局，实际「${r.reason}」`)
})

// ── schedule ───────────────────────────────────────────────────
s.check('D6 只考虑 running 与 idle', () => {
  const all = [
    { id: 'a', state: 'closed', priority: 9, credits: 5 },
    { id: 'b', state: 'running', priority: 0, credits: 5 },
  ]
  assert.eq(impl.schedule({ all: () => all }, {}), 'b')
})

s.check('D7 优先级高的先', () => {
  const all = [
    { id: 'low', state: 'running', priority: 0, credits: 5 },
    { id: 'high', state: 'running', priority: 5, credits: 5 },
  ]
  assert.eq(impl.schedule({ all: () => all }, {}), 'high')
})

s.check('D8 同优先级内取剩余 credits > 0 的；全部为 0 时返回 null', () => {
  const all = [
    { id: 'a', state: 'running', priority: 1, credits: 0 },
    { id: 'b', state: 'running', priority: 1, credits: 3 },
  ]
  const pick = impl.schedule({ all: () => all }, {})
  assert.eq(pick, 'b')
  const none = impl.schedule({ all: () => [{ id: 'x', state: 'running', priority: 1, credits: 0 }] }, {})
  assert.eq(none, null)
})

s.check('D9 结果不依赖传入顺序（配额轮转的公平性）', () => {
  const all = [
    { id: 'a', state: 'running', priority: 1, credits: 2 },
    { id: 'b', state: 'running', priority: 1, credits: 2 },
    { id: 'c', state: 'idle', priority: 1, credits: 2 },
  ]
  const first = impl.schedule({ all: () => all }, {})
  const reversed = impl.schedule({ all: () => [...all].reverse() }, {})
  assert.eq(first, reversed, '打乱输入顺序后结果应当一致')
})

// ── acquire ────────────────────────────────────────────────────
const NOW = 1000
const ctx = (over = {}) => ({ now: NOW, ttlMs: 500, allowQueue: false, ...over })

s.check('D10 无租约时授予，到期时间正确', () => {
  const r = impl.acquire({ leases: [] }, '/ws', 's1', ctx())
  assert.eq(r.ok, true)
  assert.eq(r.lease.expiresAt, NOW + 500)
  assert.eq(r.lease.holder, 's1')
})

s.check('D11 已过期的租约可被他人获取', () => {
  const store = { leases: [{ workspace: '/ws', holder: 's0', expiresAt: NOW - 1 }] }
  const r = impl.acquire(store, '/ws', 's1', ctx())
  assert.eq(r.ok, true)
})

s.check('D12 同一 holder 重入不排队；不同 holder 在允许排队时排队，否则拒绝', () => {
  const store = { leases: [{ workspace: '/ws', holder: 's1', expiresAt: NOW + 100 }] }
  assert.eq(impl.acquire(store, '/ws', 's1', ctx()).ok, true, '同一 holder 应当重入')
  const queued = impl.acquire(store, '/ws', 's2', ctx({ allowQueue: true }))
  assert.eq(queued.ok, false)
  assert.eq(queued.queued, true, '允许排队时应当排队而不是失败')
  const denied = impl.acquire(store, '/ws', 's2', ctx())
  assert.eq(denied.ok, false)
  assert.ok(String(denied.reason).includes('占用'))
})

s.check('D13 acquire 不修改传入的 store', () => {
  const store = { leases: [{ workspace: '/ws', holder: 's0', expiresAt: NOW + 100 }] }
  const frozen = JSON.stringify(store)
  impl.acquire(store, '/ws', 's1', ctx())
  assert.eq(JSON.stringify(store), frozen)
})

// ── closeReport ────────────────────────────────────────────────
s.check('D14 关闭报告：先取消后释放、列出释放的工作区、只报告真正未释放的项', () => {
  const session = {
    id: 's1',
    workspaces: ['/ws-a', '/ws-b'],
    registrations: [
      { what: '工具集', expectedAfterDispose: false, released: true },
      { what: '日志写入器', expectedAfterDispose: true },
      { what: '定时器', expectedAfterDispose: false, released: false },
    ],
  }
  const r = impl.closeReport(session, { graceMs: 800 })
  assert.ok(Array.isArray(r.order) && r.order.length >= 2, '应当给出顺序')
  const first = r.order[0]
  const second = r.order[1]
  assert.ok(first.includes('取消'), `第一步应当是取消，实际「${first}」`)
  assert.ok(second.includes('释放'), `第二步应当是释放租约，实际「${second}」`)
  assert.deepEq(r.released, ['/ws-a', '/ws-b'])
  assert.deepEq(r.leaked, ['定时器'], '只报告本应释放而实际没释放的项')
  assert.ok(Number.isInteger(r.cancelled) && r.cancelled >= 0)
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
