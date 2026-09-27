// Part E · 交互与权限
//
// 对应讲义：5.3 交互与权限。契约：见 ../CONTRACT.md 的「Part E」。
//
// 起步状态：三个函数都抛错。三条特点判据：
//   风险分级按可逆性与影响范围、预设的拒绝不可被项目约定放宽、疲劳三信号必须合取。

/**
 * 构造审批请求。
 *
 * 契约要点：
 *   - origin 含 sessionId、preset、profile 与 taskSummary（任务语境）
 *   - 风险分级：read → low；write 且新增 → low；write 覆盖 → medium；
 *     destructive 工作区内 → high、工作区外 → critical；system → critical
 *   - undoable：read 与新增 write 为 true，其余为 false
 *   - summary 不含反引号与命令名，长度 >= 4
 *   - options 含 alternative，顺序从窄到宽
 *
 * 提示：风险分级的两条依据是**可逆性与影响范围**，而不是操作的名字——
 *       这解释了为什么"新增文件"是 low 而"覆盖文件"是 medium（讲义 5.3 的 1.1）。
 *
 * @param {{ name: string, sideEffect: string }} tool
 * @param {{ path?: string, target?: string }} args
 * @param {object} ctx
 * @returns {object}
 */
export function buildRequest(tool, args, ctx) {
  throw new Error('未实现：buildRequest')
}

/**
 * 权限判决（四层来源）。
 *
 * 契约要点（顺序固定，"上界"在最前）：
 *   1. 预设拒绝 → deny（**它是上界，任何下游授权都不能放宽它**）
 *   2. 用户长期授权（未撤销）→ allow
 *   3. 项目约定（未撤销）→ allow
 *   4. 低风险只读自动放行 → allow
 *   5. 其余 → ask
 *
 * 提示：注意第 2 与第 3 条的张力——**项目约定可以放行，但不能放过预设划定的上界**。
 *
 * @param {object} request
 * @param {Array<object>} permissions
 * @param {{ denies: Function, isReadOnly: Function, autoAllowReadOnly: boolean, matchConstraint: Function }} presets
 * @returns {'allow'|'ask'|'deny'}
 */
export function decide(request, permissions, presets) {
  throw new Error('未实现：decide')
}

/**
 * 疲劳三信号。
 *
 * 契约要点：
 *   - 只统计有 decidedAt 的事件
 *   - medianLatencyMs 取中位数（偶数个取中间两个的**较小者**）
 *   - allowRate 为允许类比例；refusalRate 为 deny + alternative 的比例
 *   - **fatigued 是三者的合取**：中位 < 3000 且 allowRate > 0.95 且 refusalRate === 0
 *   - 空输入：responded 0、比率为 0、fatigued false
 *
 * 提示：单一信号无法区分"都很安全"与"没在看"——**三者的合取才能区分**
 *       （讲义 5.3 的 0.1）。
 *
 * @param {Array<object>} events
 * @returns {{ responded: number, medianLatencyMs: number, allowRate: number, refusalRate: number, fatigued: boolean }}
 */
export function fatigueSignals(events) {
  throw new Error('未实现：fatigueSignals')
}
