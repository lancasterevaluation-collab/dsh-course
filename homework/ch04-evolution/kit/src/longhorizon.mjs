// Part F · 长程任务与复盘
//
// 对应讲义：4.7 长程任务与 4.6 复盘周期。契约：见 ../CONTRACT.md 的「Part F」。
//
// 起步状态：四个函数都抛错。三条核心判据：
//   goal 字段不被修改（判分器用冻结对象调用）、续作的过时警告、覆盖率低时不再新增产出。

/**
 * 写入任务状态（三条校验）。
 *
 * 契约要点：
 *   - next 非空且长度 >= 8，否则抛错（含「下一步」）
 *   - 每条 constraint 必须可检查（匹配 /(通过|不通过|等于|大于|小于|不含|包含|存在|>=|<=|==|\d)/），
 *     否则抛错（含「判据」）
 *   - doing.length > 1 → 抛错（含「进行中」）
 *   - 返回对象的 updatedAt === ctx.now；不修改入参
 *
 * 提示：三条校验对应讲义 4.7 的 1.2 里那三句——**唯一下一步是续作的入口**，
 *       **约束要写成判据而不是原则**，**进行中只留一项**（否则续作者要先做选择）。
 *
 * @param {object} state
 * @param {{ now: number }} ctx
 * @returns {object}
 */
export function writeState(state, ctx) {
  throw new Error('未实现：writeState')
}

/**
 * 续作：入口、上下文、剩余、检查点与过时警告。
 *
 * 契约要点：
 *   - startHere === state.next
 *   - context 含 goal、constraints、decisions
 *   - remaining = { todos, added }（added 是标记为新增的待办数）
 *   - verifyAt 是第一个未完成里程碑的 { name, check }（全完成时为 null）
 *   - warnings 三条：产物比状态新（含「产物」）、长期未更新（含「未更新」）、有待办无进行中（含「进行中」）
 *
 * @param {object} state
 * @param {{ now: number, staleAfterDays?: number, mtimeOf: (path: string) => number }} ctx
 * @returns {object}
 */
export function resume(state, ctx) {
  throw new Error('未实现：resume')
}

/**
 * 目标修订（只追加）与范围变更（标记新增）。
 *
 * 契约要点：
 *   - reason 为空 → 抛错（含「理由」）
 *   - kind==='goal'：**goal 字段保持原值**，revisions 追加记录
 *   - kind==='scope'：todo 追加 { ...item, added: true }，revisions 追加一条不含文本改动的记录
 *   - 不修改入参
 *
 * 提示：goal 的不可变是"冻结"的实现方式——**允许逐步修改等于允许漂移**（讲义 4.7 的 1.6）。
 *
 * @param {object} state
 * @param {{ kind: 'goal'|'scope', reason: string, text?: string, item?: object }} revision
 * @param {{ now: number }} ctx
 * @returns {object}
 */
export function revise(state, revision, ctx) {
  throw new Error('未实现：revise')
}

/**
 * 复盘的覆盖率与门控。
 *
 * 契约要点：
 *   - 计入覆盖：state==='done'，或 state==='dropped' 且 dropReason 非空
 *   - coverage = closed / total；**空数组时为 0**（不得 NaN）
 *   - gated === coverage >= minCoverage；**空数组时 gated 为 false**
 *
 * 提示："带理由的放弃计入覆盖"避免了两种失真：只认完成会让人不愿标记放弃（积压被隐藏），
 *       无理由的放弃算完成会让覆盖率虚高（讲义 4.6 的 3.4）。
 *
 * @param {Array<object>} outputs
 * @param {{ minCoverage?: number }} ctx
 * @returns {{ coverage: number, gated: boolean, closed: number, total: number }}
 */
export function coverage(outputs, ctx) {
  throw new Error('未实现：coverage')
}
