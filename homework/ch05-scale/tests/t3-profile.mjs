// Part C 的判据（14 条）。对应讲义 5.1 与 CONTRACT.md 的「Part C」。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('profile')
const s = createSuite('Part C · 模式与预设', { weight: 20 })

const L = (name, values) => ({ name, values })

// ── compose ────────────────────────────────────────────────────
s.check('C1 覆盖顺序：后层覆盖前层的标量', () => {
  const r = impl.compose([L('内建', { concurrency: 4 }), L('用户级', { concurrency: 8 })])
  assert.eq(r.values.concurrency, 8)
})

s.check('C2 对象深合并（一层）', () => {
  const r = impl.compose([L('内建', { retry: { n: 3, backoff: 1000 } }), L('用户级', { retry: { n: 5 } })])
  assert.deepEq(r.values.retry, { n: 5, backoff: 1000 })
})

s.check('C3 数组整体替换（不拼接下层元素）', () => {
  const r = impl.compose([L('内建', { tools: ['a', 'b'] }), L('用户级', { tools: ['c'] })])
  assert.deepEq(r.values.tools, ['c'], '数组必须整段替换')
})

s.check('C4 上层是空数组时同样整体替换', () => {
  const r = impl.compose([L('内建', { tags: ['x'] }), L('项目级', { tags: ['y', 'z'] }), L('运行参数', { tags: [] })])
  assert.deepEq(r.values.tags, [])
})

s.check('C5 来源追踪记录最终生效的层', () => {
  const r = impl.compose([L('内建', { a: 1, b: 2 }), L('项目级', { b: 3 }), L('运行参数', { a: 9 })])
  assert.deepEq(r.values, { a: 9, b: 3 })
  assert.eq(r.origin.a, '运行参数')
  assert.eq(r.origin.b, '项目级')
})

s.check('C6 空 layers 返回空对象', () => {
  assert.deepEq(impl.compose([]), { values: {}, origin: {} })
})

s.check('C7 compose 不修改入参', () => {
  const layers = [L('内建', { a: 1, o: { x: 1 } }), L('用户级', { o: { y: 2 } })]
  const frozen = JSON.stringify(layers)
  impl.compose(layers)
  assert.eq(JSON.stringify(layers), frozen)
})

// ── expandCapabilities ─────────────────────────────────────────
const registry = {
  has: (n) => ['a-plugin', 'b-plugin', 'c-plugin'].includes(n),
  provides: (n) => ({ 'a-plugin': ['llm/complete'], 'b-plugin': ['tool/read', 'tool/write'], 'c-plugin': ['cache/get'] })[n] ?? [],
  dependencies: (n) => ({ 'a-plugin': ['b-plugin'], 'b-plugin': ['c-plugin'], 'c-plugin': [] })[n] ?? [],
}

s.check('C8 能力集展开间接依赖', () => {
  const r = impl.expandCapabilities({ plugins: [{ name: 'a-plugin' }], requires: [] }, registry)
  assert.ok(r.caps.includes('cache/get'), 'c-plugin 提供的能力应当被展开（间接依赖）')
  assert.eq(r.size, r.caps.length)
})

s.check('C9 能力集去重并按字典序', () => {
  const r = impl.expandCapabilities({ plugins: [{ name: 'a-plugin' }, { name: 'b-plugin' }], requires: [] }, registry)
  assert.deepEq(r.caps, [...r.caps].sort())
  assert.eq(new Set(r.caps).size, r.caps.length)
})

s.check('C10 循环依赖不死循环', () => {
  const cyc = {
    has: () => true,
    provides: (n) => [`cap/${n}`],
    dependencies: (n) => (n === 'x' ? ['y'] : ['x']),
  }
  const r = impl.expandCapabilities({ plugins: [{ name: 'x' }], requires: [] }, cyc)
  assert.eq(r.size, 2)
})

// ── validate ───────────────────────────────────────────────────
s.check('C11 插件不存在时报 error', () => {
  const r = impl.validate({ plugins: [{ name: 'missing-plugin' }], requires: [] }, registry, { maxCapabilities: 100 })
  assert.eq(r.ok, false)
  assert.ok(r.issues.some((i) => i.level === 'error' && String(i.what).includes('missing-plugin')))
})

s.check('C12 缺少必需能力时报 error 且带提示', () => {
  // 注意：tool/read 由 b-plugin 提供，而 a-plugin 依赖 b-plugin，因此它在能力集里。
  // 这里要用一个确实无人提供的能力。
  const r = impl.validate({ plugins: [{ name: 'a-plugin' }], requires: ['vector/search'] }, registry, { maxCapabilities: 100 })
  assert.eq(r.ok, false)
  const issue = r.issues.find((i) => String(i.what).includes('vector/search'))
  assert.ok(issue, '应当报告缺少必需能力')
  assert.ok(String(issue.hint ?? '').includes('可能由'), `hint 应给出线索，实际「${issue.hint}」`)
})

s.check('C13 能力集超上限时报 error；全部通过时 issues 为空', () => {
  const over = impl.validate({ plugins: [{ name: 'a-plugin' }], requires: [] }, registry, { maxCapabilities: 1 })
  assert.eq(over.ok, false)
  assert.ok(over.issues.some((i) => String(i.what).includes('上限')))
  const ok = impl.validate({ plugins: [{ name: 'a-plugin' }], requires: ['llm/complete'] }, registry, { maxCapabilities: 100 })
  assert.eq(ok.ok, true)
  assert.deepEq(ok.issues, [])
})

// ── planSwitch ─────────────────────────────────────────────────
s.check('C14 切换计划：整体模式、四步齐全、残留预期不含应当存活的项', () => {
  const from = {
    name: 'dev',
    registrations: [
      { what: '工具集', scope: 'session' },
      { what: '日志写入器', scope: 'process', surviving: true },
      { what: '守卫规则', scope: 'session' },
    ],
  }
  const r = impl.planSwitch(from, { name: 'prod' }, {})
  assert.eq(r.mode, 'whole', '必须整体切换')
  const steps = r.steps.join(' ')
  for (const kw of ['校验', '构造', '激活', '残留']) {
    assert.ok(steps.includes(kw), `steps 应含「${kw}」，实际 ${JSON.stringify(r.steps)}`)
  }
  assert.ok(!r.expectResidual.includes('日志写入器'), '标记 surviving 的注册项不应出现在残留预期里')
  assert.eq(r.expectResidual.length, 2)
  assert.ok(r.stateToMigrate.length > 0)
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
