// Part F 的判据（13 条）。对应讲义 5.4 与 CONTRACT.md 的「Part F」。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('delegation')
const s = createSuite('Part F · 派发与外部工具', { weight: 15 })

const parent = { id: 's1', goal: '把课程的第 5 卷写完', tools: ['read', 'write', 'shell'], depth: 0, constraints: ['不得改动其他卷'] }
const spec = () => ({
  goal: '为 5.4 写一节关于外部工具接入的内容',
  context: { give: ['5.4 的骨架', '0.3 的篇幅门槛'], notGive: ['其他篇的正文'] },
  constraints: ['不得改动其他篇', '必须用 17 节骨架'],
  outputFormat: { kind: 'text', maxChars: 4000 },
})

// ── buildDelegation ────────────────────────────────────────────
s.check('F1 四个要素缺一即抛错', () => {
  const cases = [
    [{ ...spec(), goal: '' }, '目标'],
    [{ ...spec(), context: undefined }, '上下文'],
    [{ ...spec(), constraints: [] }, '约束'],
    [{ ...spec(), outputFormat: undefined }, '产出格式'],
  ]
  for (const [bad, kw] of cases) {
    assert.throws(() => impl.buildDelegation(parent, bad), kw, `缺少${kw}时应当抛错`)
  }
})

s.check('F2 notGive 为空时抛错（必须说明不给什么）', () => {
  assert.throws(() => impl.buildDelegation(parent, { ...spec(), context: { give: ['x'], notGive: [] } }), '不给什么')
})

s.check('F3 outputFormat 缺少容量时抛错', () => {
  assert.throws(() => impl.buildDelegation(parent, { ...spec(), outputFormat: { kind: 'text' } }), '容量')
})

s.check('F4 深度递增且带父任务语境', () => {
  const d = impl.buildDelegation(parent, spec())
  assert.eq(d.depth, 1)
  assert.eq(d.parentTask, '把课程的第 5 卷写完')
  assert.eq(d.parentSession, 's1')
})

s.check('F5 默认预算与自定义预算', () => {
  const d = impl.buildDelegation(parent, spec())
  assert.deepEq(d.budget, { maxTokens: 50000, maxToolCalls: 30 })
  const custom = impl.buildDelegation(parent, { ...spec(), budget: { maxTokens: 1000, maxToolCalls: 5 } })
  assert.deepEq(custom.budget, { maxTokens: 1000, maxToolCalls: 5 })
})

// ── admitDelegation ────────────────────────────────────────────
const lim = (over = {}) => ({ maxDepth: 2, maxChildrenPerSession: 2, globalRunning: 0, globalMaxConcurrent: 4, runningChildrenOf: () => 0, ...over })

s.check('F6 深度越界时拒绝（reason 含深度）', () => {
  const r = impl.admitDelegation({ id: 's1', depth: 2 }, lim())
  assert.eq(r.ok, false)
  assert.ok(String(r.reason).includes('深度'))
})

s.check('F7 子任务数越界时拒绝（reason 含子任务）', () => {
  const r = impl.admitDelegation(parent, lim({ runningChildrenOf: () => 2 }))
  assert.eq(r.ok, false)
  assert.ok(String(r.reason).includes('子任务'))
})

s.check('F8 全局并发满时拒绝（reason 含全局）；三者同时越界时报深度', () => {
  const full = impl.admitDelegation(parent, lim({ globalRunning: 4 }))
  assert.eq(full.ok, false)
  assert.ok(String(full.reason).includes('全局'))
  const all = impl.admitDelegation({ id: 's1', depth: 5 }, lim({ runningChildrenOf: () => 9, globalRunning: 9 }))
  assert.ok(String(all.reason).includes('深度'), `应当先报深度，实际「${all.reason}」`)
})

// ── collectResult ──────────────────────────────────────────────
s.check('F9 格式不符时返回可重试的失败', () => {
  const r = impl.collectResult({ id: 'c1', result: 42 }, { kind: 'text', maxChars: 100 }, {})
  assert.eq(r.ok, false)
  assert.eq(r.retryable, true)
  assert.ok(String(r.reason).includes('格式'))
  const r2 = impl.collectResult({ id: 'c1', result: 'a string' }, { kind: 'list', maxChars: 100 }, {})
  assert.eq(r2.ok, false)
  assert.ok(String(r2.reason).includes('格式'))
})

s.check('F10 超容量时被裁剪到容量内', () => {
  const r = impl.collectResult({ id: 'c1', result: 'x'.repeat(500) }, { kind: 'text', maxChars: 100 }, {})
  assert.eq(r.ok, true)
  assert.eq(r.truncated, true)
  assert.eq(String(r.content).length, 100)
  const within = impl.collectResult({ id: 'c1', result: 'short' }, { kind: 'text', maxChars: 100 }, {})
  assert.eq(within.truncated, false)
})

s.check('F11 成功时带追溯元数据', () => {
  const r = impl.collectResult({ id: 'c9', result: 'ok', tokens: 1234, turns: 7 }, { kind: 'text', maxChars: 100 }, {})
  assert.eq(r.meta.childId, 'c9')
  assert.eq(r.meta.tokens, 1234)
  assert.eq(r.meta.turns, 7)
  const missing = impl.collectResult({ id: 'c9', result: 'ok' }, { kind: 'text', maxChars: 100 }, {})
  assert.eq(missing.meta.tokens, 0)
})

// ── normalizeExternalError ─────────────────────────────────────
s.check('F12 已知错误的映射', () => {
  assert.eq(impl.normalizeExternalError({ code: 'ECONNREFUSED' }, 'mcp-a').kind, 'retryable')
  assert.eq(impl.normalizeExternalError({ code: 'ECONNRESET' }, 'mcp-a').kind, 'retryable')
  assert.eq(impl.normalizeExternalError({ code: 'timeout' }, 'mcp-a').kind, 'retryable')
  assert.eq(impl.normalizeExternalError({ code: 'ENOENT' }, 'mcp-a').kind, 'fatal')
  assert.eq(impl.normalizeExternalError({ code: 'InvalidRequest' }, 'mcp-a').kind, 'fatal')
})

s.check('F13 未识别的错误视为 fatal 且需人介入，信息含来源', () => {
  const r = impl.normalizeExternalError({ code: 'E-WEIRD' }, 'mcp-b')
  assert.eq(r.kind, 'fatal', '未识别时应当保守（不盲目重试）')
  assert.eq(r.needsHuman, true)
  assert.ok(String(r.message).includes('mcp-b'), `message 应当含来源，实际「${r.message}」`)
  assert.eq(impl.normalizeExternalError({ code: 'ECONNREFUSED' }, 'mcp-b').needsHuman, false)
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
