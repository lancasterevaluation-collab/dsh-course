// Part F 的判据（14 条）。对应讲义 4.7 与 4.6，以及 CONTRACT.md 的「Part F」。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('longhorizon')
const s = createSuite('Part F · 长程与复盘', { weight: 20 })

const DAY = 86400000
const base = (extra = {}) => ({
  goal: '把课程的第 5 卷写完',
  revisions: [],
  constraints: ['每篇 17 节骨架齐全', '检查脚本通过'],
  milestones: [
    { name: '5.1', done: true, check: 'node scripts/check-lecture.mjs 5.1' },
    { name: '5.2', done: false, check: 'node scripts/check-lecture.mjs 5.2' },
  ],
  done: [], doing: ['写 5.2'],
  todo: [{ text: '写 5.3' }, { text: '写 5.4', added: true }],
  decisions: [{ text: '5.4 放最后' }],
  open: [], artifacts: ['D:/x/5.2.md'],
  next: '写 5.2 的 L2 决策表，然后跑检查脚本',
  updatedAt: 10 * DAY,
  baselineTodoCount: 2,
  ...extra,
})

// ── writeState ─────────────────────────────────────────────────
s.check('F1 缺少唯一下一步时抛错（含「下一步」）', () => {
  assert.throws(() => impl.writeState(base({ next: '短' }), { now: 0 }), '下一步')
})

s.check('F2 约束不可检查时抛错（含「判据」）', () => {
  assert.throws(() => impl.writeState(base({ constraints: ['保持代码整洁'] }), { now: 0 }), '判据')
})

s.check('F3 进行中超过一项时抛错（含「进行中」）', () => {
  assert.throws(() => impl.writeState(base({ doing: ['a', 'b'] }), { now: 0 }), '进行中')
})

s.check('F4 写入返回 updatedAt 且不修改入参', () => {
  const st = base()
  const frozen = JSON.stringify(st)
  const out = impl.writeState(st, { now: 123 })
  assert.eq(out.updatedAt, 123)
  assert.eq(JSON.stringify(st), frozen, '入参不应被修改')
})

// ── resume ─────────────────────────────────────────────────────
const ctx = (extra = {}) => ({ now: 12 * DAY, staleAfterDays: 14, mtimeOf: () => 5 * DAY, ...extra })

s.check('F5 续作返回唯一下一步与必要上下文', () => {
  const r = impl.resume(base(), ctx())
  assert.eq(r.startHere, '写 5.2 的 L2 决策表，然后跑检查脚本')
  assert.eq(r.context.goal, '把课程的第 5 卷写完')
  assert.ok(Array.isArray(r.context.constraints) && r.context.constraints.length === 2)
  assert.ok(Array.isArray(r.context.decisions) && r.context.decisions.length === 1)
})

s.check('F6 剩余量可数：todos 与 added', () => {
  const r = impl.resume(base(), ctx())
  assert.eq(r.remaining.todos, 2)
  assert.eq(r.remaining.added, 1, '应当能数出被标记为新增的待办')
})

s.check('F7 verifyAt 是第一个未完成里程碑的检查方式；全完成时为 null', () => {
  const r = impl.resume(base(), ctx())
  assert.eq(r.verifyAt.name, '5.2')
  assert.ok(r.verifyAt.check.includes('check-lecture'))
  const allDone = base({ milestones: [{ name: 'a', done: true, check: 'x' }] })
  assert.eq(impl.resume(allDone, ctx()).verifyAt, null)
})

s.check('F8 产物比状态新 → 警告含「产物」', () => {
  const r = impl.resume(base(), ctx({ mtimeOf: () => 20 * DAY })) // 比 updatedAt(10 天) 新
  assert.ok(r.warnings.some((w) => w.includes('产物')), `warnings 应含产物警告，实际 ${JSON.stringify(r.warnings)}`)
})

s.check('F9 长期未更新 → 警告含「未更新」', () => {
  const r = impl.resume(base(), ctx({ now: 100 * DAY }))
  assert.ok(r.warnings.some((w) => w.includes('未更新')), `实际 ${JSON.stringify(r.warnings)}`)
})

s.check('F10 有待办而无进行中 → 警告含「进行中」', () => {
  const r = impl.resume(base({ doing: [] }), ctx())
  assert.ok(r.warnings.some((w) => w.includes('进行中')), `实际 ${JSON.stringify(r.warnings)}`)
})

// ── revise ─────────────────────────────────────────────────────
s.check('F11 修订缺少理由时抛错（含「理由」）', () => {
  assert.throws(() => impl.revise(base(), { kind: 'goal', text: '改为写完 5.1–5.3' }, { now: 0 }), '理由')
})

s.check('F12 目标修订不修改 goal 字段，只追加 revisions', () => {
  const st = base()
  const out = impl.revise(st, { kind: 'goal', reason: '范围缩小', text: '改为写完 5.1–5.3' }, { now: 7 })
  assert.eq(out.goal, st.goal, 'goal 字段必须保持原值')
  assert.eq(out.revisions.length, 1)
  assert.eq(out.revisions[0].reason, '范围缩小')
  assert.eq(out.revisions[0].at, 7)
})

s.check('F13 范围新增：待办被标记 added 并留一条记录', () => {
  const out = impl.revise(base(), { kind: 'scope', reason: '用户要求补一节', item: { text: '补写一节' } }, { now: 7 })
  const last = out.todo[out.todo.length - 1]
  assert.eq(last.text, '补写一节')
  assert.eq(last.added, true, '新增的待办必须被标记')
  assert.eq(out.revisions.length, 1)
  assert.eq(out.revisions[0].kind, 'scope')
})

// ── coverage ───────────────────────────────────────────────────
s.check('F14 覆盖率把带理由的放弃计入；空数组为 0 且不开放新增', () => {
  const outputs = [
    { id: 'o1', state: 'done' },
    { id: 'o2', state: 'dropped', dropReason: '已由别的改动覆盖' },
    { id: 'o3', state: 'todo' },
    { id: 'o4', state: 'dropped' },
  ]
  const r = impl.coverage(outputs, { minCoverage: 0.5 })
  assert.eq(r.total, 4)
  assert.eq(r.closed, 2, '带理由的放弃应当计入覆盖，无理由的不计入')
  assert.near(r.coverage, 0.5, 1e-9)
  assert.eq(r.gated, true)

  const empty = impl.coverage([], { minCoverage: 0.6 })
  assert.eq(empty.coverage, 0)
  assert.eq(Number.isNaN(empty.coverage), false)
  assert.eq(empty.gated, false, '没有历史时不应开放新增')
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
