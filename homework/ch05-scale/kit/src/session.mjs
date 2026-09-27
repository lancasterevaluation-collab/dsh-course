// Part D · 多会话与并发
//
// 对应讲义：5.2 多会话与并发。契约：见 ../CONTRACT.md 的「Part D」。
//
// 起步状态：四个函数都抛错。这一卷的核心判据在这里：
//   配额三维度、全局与会话的先后、优先级来自预设、轮转的公平性、
//   租约的超时与排队、关闭时"先取消后释放"、以及回收报告的诚实性。

/**
 * 配额判决（并发、速率、占用）。
 *
 * 契约要点（顺序固定）：
 *   1. 全局并发满 → 拒绝（reason 含「全局」）
 *   2. 会话并发满 → 拒绝（reason 含「会话」）
 *   3. 速率超限   → 拒绝（reason 含「速率」，retryAfter >= 1000）
 *
 * 提示：顺序有意义——前两者的拒绝是瞬时的（很快可重试），而速率超限的等待更长，
 *       因此把它放在最后让"被拒绝"的代价最小。
 *
 * @param {{ sessionId: string }} request
 * @param {{ globalRunning: Function, sessionRunning: Function, tokensInWindow: Function, estimate: Function }} registry
 * @param {{ globalMaxConcurrent: number, maxConcurrentPerSession: number, maxTokensPerMinute: number }} policy
 * @returns {{ ok: boolean, reason?: string, retryAfter?: number }}
 */
export function admit(request, registry, policy) {
  throw new Error('未实现：admit')
}

/**
 * 调度：优先级 + 配额轮转。
 *
 * 契约要点：
 *   - 只考虑 running 与 idle
 *   - 优先级数字大的先
 *   - 同优先级内取**剩余 credits > 0** 的第一个
 *   - 无可选 → null
 *   - **不得依赖传入顺序**（判据会打乱顺序核对结果一致）
 *
 * 提示：优先级用来表达重要性，轮转用来表达响应性——两者解决的问题不同（讲义 5.2 的 1.4）。
 *
 * @param {{ all: Function }} registry
 * @param {{ creditsPerRound?: number }} ctx
 * @returns {string | null}
 */
export function schedule(registry, ctx) {
  throw new Error('未实现：schedule')
}

/**
 * 工作区租约：超时、重入、排队。
 *
 * 契约要点：
 *   - 无租约或已过期（expiresAt <= now）→ 授予（expiresAt === now + ttlMs）
 *   - 未过期且 holder 相同 → 重入（返回新租约，不排队）
 *   - 未过期且 holder 不同：allowQueue 为真 → { ok: false, queued: true }；否则 → reason 含「占用」
 *   - 不修改传入 store
 *
 * @param {{ leases: Array<object> }} store
 * @param {string} workspace
 * @param {string} holder
 * @param {{ now: number, ttlMs: number, allowQueue: boolean }} ctx
 * @returns {object}
 */
export function acquire(store, workspace, holder, ctx) {
  throw new Error('未实现：acquire')
}

/**
 * 关闭会话：先取消后释放，并报告残留。
 *
 * 契约要点：
 *   - order 前两项是「取消」与「释放租约」（顺序不可颠倒）
 *   - released 列出被释放的全部工作区
 *   - leaked 是**未标记 expectedAfterDispose 且未标记 released: true** 的注册项（本应释放而实际没释放）
 *   - cancelled 为非负整数
 *
 * 提示：先取消再释放，因为取消是"断掉产生资源的路径"；顺序反了会让释放与仍在运行的操作交错。
 *
 * @param {{ id: string, workspaces: string[], registrations: Array<{ what: string, expectedAfterDispose?: boolean, released?: boolean }> }} session
 * @param {{ graceMs: number }} ctx
 * @returns {{ cancelled: number, released: string[], leaked: string[], order: string[] }}
 */
export function closeReport(session, ctx) {
  throw new Error('未实现：closeReport')
}
