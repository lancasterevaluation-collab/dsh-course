// Part E · 演化与门控
//
// 对应讲义：4.5 演化。契约：见 ../CONTRACT.md 的「Part E」。
//
// 起步状态：四个函数都抛错。这一项的 15 分里有一半来自**"应当被拒绝"的五条判据**：
//   元控制对象、过期基线、无法应用的差异、改善落在噪声内、护栏退化。

/**
 * 从一条诊断结论构造提议。
 *
 * 契约要点：
 *   - diff.before 与 diff.after 均非空，否则抛错（信息含「差异」）
 *   - diagnosis.action.target 非空，否则抛错（信息含「可行动」）
 *   - 返回含 reason、rollback、originVersion
 *
 * 提示：两条校验把"可行动性"从分析题延伸到了演化入口——**一个没有可改对象的诊断
 *       结论连提议都构造不出来**。
 *
 * @param {{ phenomenon: string, conclusion: { cause: string }, action?: { target?: string } }} diagnosis
 * @param {{ target: object, diff: { before: string, after: string }, expectation: object, rollback: string, originVersion: string }} change
 * @returns {object}
 */
export function buildProposal(diagnosis, change) {
  throw new Error('未实现：buildProposal')
}

/**
 * 两层门控：静态（权限与一致性）与评估（改善与护栏）。
 *
 * 契约要点（顺序有意义）：
 *   静态：path 在 metaControlled → 拒绝（含「元控制」）；originVersion !== current.id → 拒绝（含「基线」）；
 *         applyDiff 抛错 → 拒绝（含「差异」）
 *   评估：gain <= 2 * noise → 拒绝（含「噪声」）；guardOk === false → 拒绝（含「护栏」）
 *   通过 → { ok: true, stage: 'ok' }
 *
 * 提示：噪声用**同一版本两次运行**的差异估计（这点讲义 4.5 的 0.3 讲过）。
 *       "改善大于两倍噪声"这条判据挡住的是震荡——**改来改去而系统没往任何方向走**。
 *
 * @param {object} proposal
 * @param {{ id: string, textOf: (path: string) => string }} current
 * @param {{ metaControlled: string[], applyDiff: Function, runs: { baseA: number[], baseB: number[], candidate: number[] }, guardOk: boolean }} ctx
 * @returns {{ ok: boolean, why?: string, stage: string }}
 */
export function gate(proposal, current, ctx) {
  throw new Error('未实现：gate')
}

/**
 * 发布：一组改动作为一个版本。
 *
 * 契约要点：changes 是数组、base 与 from 均为 current.id、不修改传入 store。
 *
 * @param {{ current: { id: string }, versions: Array<object> }} store
 * @param {object} proposal
 * @param {object} ctx
 * @returns {{ version: { id: string, base: string, changes: Array<object> }, from: string }}
 */
export function release(store, proposal, ctx) {
  throw new Error('未实现：release')
}

/**
 * 回滚：先检查状态兼容，再返回结果。
 *
 * 契约要点：ctx.canReadState(toVersion) === false → 抛错（信息含「状态」或「兼容」）。
 *
 * @param {object} store
 * @param {{ id: string }} toVersion
 * @param {{ canReadState: (v: object) => boolean }} ctx
 * @returns {{ ok: boolean, to: string }}
 */
export function rollback(store, toVersion, ctx) {
  throw new Error('未实现：rollback')
}
