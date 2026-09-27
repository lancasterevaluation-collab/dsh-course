// Part E 的判据（13 条）。对应讲义 3.5 与 CONTRACT.md 的「Part E」。
//
// 四类损坏输入的处置各不相同（截断 / 截断 / 抛错 / 拒绝），而幂等是恢复的核心不变量。
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('persist')
const s = createSuite('Part E · 持久化与恢复', { weight: 20 })

const line = (seq, extra = {}) => JSON.stringify({ seq, type: 'session/user', committed: true, ...extra })

// ── readAll：正常与四类损坏 ─────────────────────────────────────
s.check('E1 正常行按顺序进入 events', () => {
  const r = impl.readAll([line(1), line(2), line(3)])
  assert.eq(r.events.length, 3)
  assert.eq(r.truncatedAt, undefined)
})

s.check('E2 半行（解析失败）→ 截断并报告，不抛错', () => {
  const r = impl.readAll([line(1), '{"seq":2,"type":"session/assist'])
  assert.eq(r.events.length, 1)
  assert.eq(r.truncatedAt, 1, 'truncatedAt 应为已读条数')
})

s.check('E3 缺字段 → 同样按截断处理', () => {
  const r = impl.readAll([line(1), JSON.stringify({ type: 'session/user' })])
  assert.eq(r.events.length, 1)
  assert.eq(r.truncatedAt, 1)
})

s.check('E4 顺序号跳号 → 抛错且信息含关键词', () => {
  assert.throws(() => impl.readAll([line(1), line(3)]), null, '跳号应当抛错')
  try {
    impl.readAll([line(1), line(3)])
  } catch (e) {
    assert.ok(/跳号|gap/.test(String(e.message)), `错误信息应含「跳号」或「gap」，实际「${e.message}」`)
  }
})

s.check('E5 未知类型且可忽略 → 跳过该条并继续', () => {
  const r = impl.readAll([line(1), JSON.stringify({ seq: 2, type: 'session/future-kind', ignorable: true }), line(3)])
  assert.eq(r.events.length, 2, '应当跳过未知但可忽略的事件')
  assert.ok(!r.rejected, '不应拒绝整份日志')
})

s.check('E6 未知类型且不可忽略 → 拒绝整份日志', () => {
  const r = impl.readAll([line(1), JSON.stringify({ seq: 2, type: 'session/unknown-kind' })])
  assert.ok(r.rejected && typeof r.rejected.reason === 'string', '应当返回 rejected')
  assert.eq(r.events.length, 0, '拒绝时不应返回事件')
})

s.check('E7 空输入返回空事件列表', () => {
  const r = impl.readAll([])
  assert.deepEq(r.events, [])
  assert.eq(r.truncatedAt, undefined)
})

s.check('E8 首条 seq 可以是任意值（只检查相邻连续性）', () => {
  const r = impl.readAll([line(100), line(101)])
  assert.eq(r.events.length, 2)
})

// ── recover：三步与幂等 ────────────────────────────────────────
const commit = (seq, value) => ({ seq, type: 'session/state', committed: true, op: 'append', value })

s.check('E9 从空状态恢复：重做全部已提交事件', async () => {
  const r = await impl.recover([commit(1, 'a'), commit(2, 'b')], null)
  assert.eq(r.fromCheckpoint, false)
  assert.eq(r.redone, 2)
  assert.eq(r.state.count, 2)
  assert.deepEq(r.state.items, ['a', 'b'])
  assert.eq(r.state.lastSeq, 2)
})

s.check('E10 从检查点恢复：跳过已覆盖的事件', async () => {
  const cp = { lastSeq: 1, state: { lastSeq: 1, count: 1, items: ['a'] } }
  const r = await impl.recover([commit(1, 'a'), commit(2, 'b')], cp)
  assert.eq(r.fromCheckpoint, true)
  assert.eq(r.redone, 1)
  assert.deepEq(r.state.items, ['a', 'b'])
})

s.check('E11 重做幂等：连做两次的最终状态相同且第二次 redone 为 0', async () => {
  const events = [commit(1, 'a'), commit(2, 'b'), commit(3, 'c')]
  const first = await impl.recover(events, null)
  const second = await impl.recover(events, { lastSeq: first.state.lastSeq, state: first.state })
  assert.eq(second.redone, 0, '第二次不应重做任何事件')
  assert.deepEq(second.state, first.state, '两次的最终状态必须相同')
})

s.check('E12 未提交事件被撤销并计数', async () => {
  const events = [
    commit(1, 'a'),
    { seq: 2, type: 'session/state', committed: false, op: 'append', value: 'b' },
  ]
  const r = await impl.recover(events, null)
  assert.eq(r.reverted, 1)
  assert.deepEq(r.state.items, ['a'], '未提交的 append 不应留在状态里')
  assert.eq(r.state.lastSeq, 2)
})

s.check('E13 从检查点恢复与从头重放结果相同', async () => {
  const events = [commit(1, 'a'), commit(2, 'b'), commit(3, 'c'), commit(4, 'd')]
  const full = await impl.recover(events, null)
  const mid = await impl.recover(events, { lastSeq: 2, state: { lastSeq: 2, count: 2, items: ['a', 'b'] } })
  assert.deepEq(mid.state.items, full.state.items, '两条路径的 items 必须相同')
  assert.eq(mid.state.count, full.state.count)
  assert.eq(mid.state.lastSeq, full.state.lastSeq)
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
