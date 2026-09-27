// 4.7 长程任务的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/**
 * 命题 4.7.1：两种续作方式的成本比。
 * @param historyTokens 历史规模
 * @param stateTokens 状态规模
 * @returns 成本比
 */
export function resumeCostRatio(historyTokens, stateTokens) {
  return historyTokens / stateTokens
}

/**
 * 命题 4.7.2：用早期分母与晚期分母估算完成度之差。
 * @param done 已完成项
 * @param totalEarly 早期估计的总量
 * @param totalLate 后期估计的总量
 * @returns `{ early, late, bias }`
 */
export function optimismBias(done, totalEarly, totalLate) {
  const early = done / totalEarly
  const late = done / totalLate
  return { early, late, bias: early - late }
}

/**
 * 定义 4.7.2：约束是否是判据形式。
 * @param c 约束文本
 * @returns 是否可检查
 */
export function isCheckable(c) {
  return /(通过|不超过|齐全|等于|至少|不大于|不少于|\d+\s*%|\d+\s*节|\d+\s*篇|\d+\s*个)/.test(c)
}

/**
 * 定义 4.7.2：写入状态时的三条校验。
 * @param state 任务状态
 * @param now 当前时间
 * @returns 补上更新时间的状态
 * @throws 唯一下一步缺失、约束不可检查、进行中超过一项时
 */
export function writeState(state, now) {
  if (!state.next || state.next.length < 8) throw new Error('缺少唯一下一步（或它太短，无法作为入口）')
  const bad = state.constraints.filter((c) => !isCheckable(c))
  if (bad.length) throw new Error(`约束必须可检查：${bad.join('、')}`)
  if (state.doing.length > 1) throw new Error('进行中的项应当只有一项')
  return { ...state, updatedAt: now }
}

/**
 * 命题 4.7.5：状态是否过时的三条机械判据。
 * @param state 任务状态
 * @param ctx 形如 `{ now, mtimeOf, staleAfter }`
 * @returns 警告数组
 */
export function detectStale(state, ctx) {
  const out = []
  const newest = Math.max(0, ...state.artifacts.map((a) => ctx.mtimeOf(a)))
  if (newest > state.updatedAt) out.push('产物比状态新：状态可能漏记了进展')
  if (ctx.now - state.updatedAt > ctx.staleAfter) out.push('状态长期未更新')
  if (state.doing.length === 0 && state.todo.length > 0) out.push('有待办而没有进行中的项：进度记录可能不完整')
  return out
}

/**
 * 定义 4.7.4：续作包。
 * @param state 任务状态
 * @param ctx 形如 `{ now, mtimeOf, staleAfter }`
 * @returns `{ startHere, context, remaining, verifyAt, warnings }`
 */
export function resume(state, ctx) {
  const nextMilestone = state.milestones.find((m) => !m.done)
  return {
    startHere: state.next,
    context: { goal: state.goal, constraints: state.constraints, decisions: state.decisions },
    remaining: { todos: state.todo.length, added: state.todo.filter((t) => t.added).length },
    verifyAt: nextMilestone ? { name: nextMilestone.name, check: nextMilestone.check } : null,
    warnings: detectStale(state, ctx),
  }
}

/**
 * 定义 4.7.5：双度量与偏差信号。
 * @param state 任务状态
 * @param baselineTodoCount 任务开始时的待办基线
 * @returns `{ milestones, todos, divergence, note }`
 */
export function assess(state, baselineTodoCount) {
  const ms = { done: state.milestones.filter((m) => m.done).length, total: state.milestones.length }
  const todos = { open: state.todo.length, added: state.todo.filter((t) => t.added).length }
  const divergence = ms.done > 0 && todos.open >= baselineTodoCount
  return { milestones: ms, todos, divergence, note: divergence ? '里程碑推进但待办未减少：范围可能在扩张' : null }
}

/**
 * 定义 4.7.6：目标修订只做追加。
 * @param state 任务状态
 * @param revision `{ content, reason }`
 * @param now 当前时间
 * @returns 新状态
 * @throws 缺理由时
 */
export function reviseGoal(state, revision, now) {
  if (!revision.reason) throw new Error('目标修订必须给出理由')
  return { ...state, revisions: [...state.revisions, { ...revision, at: now }] }
}

/**
 * 定义 4.7.6：新增工作项带标记。
 * @param state 任务状态
 * @param item `{ name }`
 * @param now 当前时间
 * @returns 新状态
 */
export function addScope(state, item, now) {
  return { ...state, todo: [...state.todo, { ...item, added: true, addedAt: now }] }
}

/** 算例用的任务状态。 */
export const STATE = {
  goal: '把课程第 4 卷写完（7 篇讲义）',
  revisions: [],
  constraints: ['每篇 17 节骨架齐全', '导论不超过 20%', '检查不通过不算完成'],
  milestones: [
    { name: '4.1-4.3', done: true, check: 'check-lecture 全通过' },
    { name: '4.4-4.6', done: true, check: '同上' },
    { name: '4.7', done: false, check: '同上' },
    { name: '全卷复检', done: false, check: 'check-lecture --all 全通过' },
  ],
  done: ['4.1', '4.2', '4.3', '4.4', '4.5', '4.6'],
  doing: ['4.7'],
  todo: [{ name: '写 4.7' }, { name: '全卷复检' }, { name: '补作业工作区', added: true }],
  decisions: [{ what: '4.7 放在第 4 卷末', why: '任务级长程的正面回答', excluded: ['放在第 6 卷'] }],
  open: [{ what: '作业工作区尚未建', who: '本人', due: '本卷收口前' }],
  artifacts: ['D:/dsh-course/04-学习进化/', 'D:/dsh-course/进度.md'],
  next: '写 4.7 全篇，然后跑 node scripts/check-lecture.mjs',
  updatedAt: 1000,
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('4.7 长程任务 · 算例（SA-38）')
  rows.push('')

  rows.push('[1] 状态校验')
  let threw = 0
  try { writeState({ ...STATE, next: '' }, 1) } catch { threw++ }
  try { writeState({ ...STATE, constraints: ['保持代码整洁'] }, 1) } catch { threw++ }
  try { writeState({ ...STATE, doing: ['a', 'b'] }, 1) } catch { threw++ }
  line('三类校验各自抛错', threw === 3)
  line('缺少唯一下一步时是否抛错', (() => { try { writeState({ ...STATE, next: '' }, 1); return false } catch { return true } })())
  line('约束不可检查时是否抛错', (() => { try { writeState({ ...STATE, constraints: ['保持整洁'] }, 1); return false } catch { return true } })())
  line('进行中超过一项时是否抛错', (() => { try { writeState({ ...STATE, doing: ['a', 'b'] }, 1); return false } catch { return true } })())
  line('合法状态是否通过', writeState(STATE, 1).updatedAt === 1)
  line('判据式约束可识别', isCheckable('导论不超过 20%'))
  line('原则式约束不可识别', isCheckable('保持代码整洁'))
  rows.push('')

  rows.push('[2] 续作')
  const ctx = { now: 1001, mtimeOf: () => 1100, staleAfter: 7 }
  const r = resume(STATE, ctx)
  line('入口', r.startHere)
  line('剩余待办数', r.remaining.todos)
  line('新增待办数', r.remaining.added)
  line('下一个检查点', r.verifyAt.name)
  line('过时警告条数', r.warnings.length)
  line('过时警告的内容', r.warnings[0])
  const fresh = resume(STATE, { now: 1001, mtimeOf: () => 900, staleAfter: 7 })
  line('产物不比状态新时的警告条数', fresh.warnings.length)
  const stale = resume(STATE, { now: 2000, mtimeOf: () => 900, staleAfter: 7 })
  line('长期未更新时的警告条数', stale.warnings.length)
  const emptyDoing = resume({ ...STATE, doing: [] }, { now: 1001, mtimeOf: () => 900, staleAfter: 7 })
  line('有待办无进行中时的警告条数', emptyDoing.warnings.length)
  rows.push('')

  rows.push('[3] 进度')
  const p = assess(STATE, 3)
  line('里程碑完成数 / 总数', `${p.milestones.done} / ${p.milestones.total}`)
  line('剩余待办数', p.todos.open)
  line('新增待办数', p.todos.added)
  line('偏差信号', p.divergence)
  line('偏差提示', p.note)
  line('待办降到基线以下时是否报偏差', assess({ ...STATE, todo: [{ name: 'x' }] }, 3).divergence)
  line('没有完成里程碑时是否报偏差', assess({ ...STATE, milestones: [{ name: 'a', done: false, check: 'x' }] }, 3).divergence)
  rows.push('')

  rows.push('[4] 变更与成本')
  line('无理由的修订是否抛错', (() => { try { reviseGoal(STATE, { content: 'x' }, 1); return false } catch { return true } })())
  const revised = reviseGoal(STATE, { content: '把 4.7 的范围限定在任务级', reason: '避免与 4.6 重叠' }, 5)
  line('修订后原始目标是否不变', revised.goal === STATE.goal)
  line('修订记录条数', revised.revisions.length)
  line('修订带时间', revised.revisions[0].at)
  const added = addScope(STATE, { name: '新增一件事' }, 6)
  line('新增待办是否带标记', added.todo[added.todo.length - 1].added === true)
  line('新增后待办数', added.todo.length)
  line('续作成本比（H=200000, S=2000）', resumeCostRatio(200000, 2000))
  const bias = optimismBias(6, 10, 15)
  line('早期估算的完成度', bias.early.toFixed(2))
  line('后期估算的完成度', bias.late.toFixed(2))
  line('乐观偏差', bias.bias.toFixed(2))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
