// 4.7 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  resumeCostRatio, optimismBias, isCheckable, writeState, detectStale, resume,
  assess, reviseGoal, addScope, STATE,
} from './sa38_longhorizon.mjs'

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
const throws = (fn, label) => {
  try { fn() } catch { pass++; return }
  fail++
  console.log(`不通过：${label} —— 未抛错`)
}

// 命题 4.7.1：续作成本比
{
  eq(resumeCostRatio(200000, 2000), 100, '20 万与 2 千的比是 100')
  eq(resumeCostRatio(200000, 200000), 1, '两者相等时比为 1')
  eq(resumeCostRatio(100, 10), 10, '简单比值')
  ok(resumeCostRatio(400000, 2000) > resumeCostRatio(200000, 2000), '历史越长比值越大')
  ok(resumeCostRatio(200000, 2000) > 10, '这是量级差而不是常数因子')
}

// 命题 4.7.2：乐观偏差
{
  const b = optimismBias(6, 10, 15)
  near(b.early, 0.6, 1e-9, '早期估算完成度 0.6')
  near(b.late, 0.4, 1e-9, '后期估算完成度 0.4')
  near(b.bias, 0.2, 1e-9, '乐观偏差 0.2')
  eq(optimismBias(5, 5, 5).bias, 0, '分母不变时没有偏差')
  ok(optimismBias(6, 10, 15).bias > 0, '分母增长时偏差为正')
  ok(optimismBias(6, 10, 15).early > optimismBias(6, 10, 15).late, '早期估算更乐观')
}

// 定义 4.7.2：状态校验
{
  ok(isCheckable('每篇 17 节骨架齐全'), '含数量与“齐全”的约束可识别')
  ok(isCheckable('导论不超过 20%'), '含上限的约束可识别')
  ok(isCheckable('检查不通过不算完成'), '含“通过”的约束可识别')
  ok(!isCheckable('保持代码整洁'), '原则式约束不可识别')
  ok(!isCheckable('注意质量'), '模糊表述不可识别')
}
{
  const s = writeState(STATE, 42)
  eq(s.updatedAt, 42, '写入时补上更新时间')
  eq(s.goal, STATE.goal, '写入不改变目标')
  throws(() => writeState({ ...STATE, next: '' }, 1), '缺唯一下一步时抛错')
  throws(() => writeState({ ...STATE, next: '短' }, 1), '下一步过短时抛错')
  throws(() => writeState({ ...STATE, constraints: ['保持整洁'] }, 1), '约束不可检查时抛错')
  throws(() => writeState({ ...STATE, doing: ['a', 'b'] }, 1), '进行中超过一项时抛错')
  ok(writeState({ ...STATE, doing: [] }, 1) !== null, '允许没有进行中的项')
  ok(writeState({ ...STATE, constraints: [] }, 1) !== null, '允许没有约束')
}

// 命题 4.7.5：过时判据
{
  const ctx = { now: 1001, mtimeOf: () => 1100, staleAfter: 7 }
  eq(detectStale(STATE, ctx), ['产物比状态新：状态可能漏记了进展'], '产物更新时给出一条警告')
  eq(detectStale(STATE, { now: 1001, mtimeOf: () => 900, staleAfter: 7 }), [], '一切正常时没有警告')
  eq(detectStale(STATE, { now: 2000, mtimeOf: () => 900, staleAfter: 7 }), ['状态长期未更新'], '长期未更新时给出一条警告')
  eq(detectStale({ ...STATE, doing: [] }, { now: 1001, mtimeOf: () => 900, staleAfter: 7 }), ['有待办而没有进行中的项：进度记录可能不完整'], '记录不完整时给出一条警告')
  eq(detectStale({ ...STATE, doing: [] }, { now: 2000, mtimeOf: () => 1100, staleAfter: 7 }).length, 3, '三条同时成立时给出三条')
  eq(detectStale({ ...STATE, artifacts: [] }, { now: 1001, mtimeOf: () => 0, staleAfter: 7 }), [], '没有产物时不做时间戳比对')
}

// 定义 4.7.4：续作包
{
  const r = resume(STATE, { now: 1001, mtimeOf: () => 900, staleAfter: 7 })
  eq(Object.keys(r).length, 5, '续作包有五个字段')
  eq(r.startHere, STATE.next, '入口是唯一下一步')
  eq(r.remaining.todos, 3, '剩余待办数为 3')
  eq(r.remaining.added, 1, '新增待办数为 1')
  eq(r.verifyAt.name, '4.7', '下一个检查点是 4.7')
  eq(r.verifyAt.check, '同上', '检查点带检查方式')
  eq(r.context.goal, STATE.goal, '上下文含目标')
  eq(r.context.constraints.length, 3, '上下文含约束')
  eq(r.context.decisions.length, 1, '上下文含决策记录')
  eq(r.warnings, [], '状态新鲜时没有警告')
  const done = { ...STATE, milestones: STATE.milestones.map((m) => ({ ...m, done: true })) }
  eq(resume(done, { now: 1, mtimeOf: () => 0, staleAfter: 99 }).verifyAt, null, '全部完成时没有下一个检查点')
}

// 定义 4.7.5：进度与偏差
{
  const p = assess(STATE, 3)
  eq(p.milestones, { done: 2, total: 4 }, '里程碑二比四')
  eq(p.todos, { open: 3, added: 1 }, '剩余三项，其中新增一项')
  eq(p.divergence, true, '待办未降到基线以下时报偏差')
  ok(p.note.includes('范围'), '偏差提示说明范围可能在扩张')
  eq(assess({ ...STATE, todo: [{ name: 'x' }] }, 3).divergence, false, '待办降到基线以下时不报偏差')
  eq(assess({ ...STATE, milestones: [{ name: 'a', done: false, check: 'x' }] }, 3).divergence, false, '没有完成里程碑时不报偏差')
  eq(assess({ ...STATE, todo: [] }, 3).todos.open, 0, '空待办时剩余为零')
}

// 定义 4.7.6：变更
{
  throws(() => reviseGoal(STATE, { content: 'x' }, 1), '缺理由的修订抛错')
  const revised = reviseGoal(STATE, { content: '限定范围', reason: '避免重叠' }, 5)
  eq(revised.goal, STATE.goal, '修订不改变原始目标')
  eq(revised.revisions.length, 1, '追加一条修订')
  eq(revised.revisions[0].reason, '避免重叠', '修订保留理由')
  eq(revised.revisions[0].at, 5, '修订带时间')
  eq(STATE.revisions.length, 0, '原状态不被修改')
  const twice = reviseGoal(revised, { content: '再改', reason: '再一个理由' }, 6)
  eq(twice.revisions.length, 2, '连续修订被追加')
  eq(twice.goal, STATE.goal, '两次修订后原目标仍不变')
}
{
  const added = addScope(STATE, { name: '新工作' }, 6)
  eq(added.todo.length, 4, '新增后待办多一项')
  eq(added.todo[3].added, true, '新增项带标记')
  eq(added.todo[3].addedAt, 6, '新增项带时间')
  eq(STATE.todo.length, 3, '原状态不被修改')
  eq(added.todo.filter((t) => t.added).length, 2, '新增项可数')
}

// 量级关系
{
  near(resumeCostRatio(200000, 2000) / 100, 1, 1e-9, '成本比恰好是 100 倍')
  ok(resumeCostRatio(1000000, 2000) > resumeCostRatio(200000, 2000), '任务越长优势越大')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
