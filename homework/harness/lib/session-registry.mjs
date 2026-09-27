// Part D 的参考实现。

/** 配额判决：全局 → 会话 → 速率。 */
export function admit(request, registry, policy) {
  if (registry.globalRunning() >= policy.globalMaxConcurrent) {
    return { ok: false, reason: '全局并发已满', retryAfter: 1000 }
  }
  if (registry.sessionRunning(request.sessionId) >= policy.maxConcurrentPerSession) {
    return { ok: false, reason: '该会话并发已满', retryAfter: 500 }
  }
  const used = registry.tokensInWindow(request.sessionId, 60_000)
  const need = registry.estimate(request)
  if (used + need > policy.maxTokensPerMinute) {
    return { ok: false, reason: '速率超限（token/分钟）', retryAfter: 60_000 }
  }
  return { ok: true }
}

/** 调度：优先级分组 + 组内配额轮转。 */
export function schedule(registry, ctx) {
  const all = registry.all() ?? []
  const ready = all.filter((s) => s.state === 'running' || s.state === 'idle')
  if (ready.length === 0) return null
  const priorities = [...new Set(ready.map((s) => s.priority ?? 0))].sort((a, b) => b - a)
  for (const p of priorities) {
    const group = ready.filter((s) => (s.priority ?? 0) === p)
    const withCredits = group.filter((s) => (s.credits ?? 0) > 0)
    if (withCredits.length) {
      // 组内按 id 排序，保证结果不依赖传入顺序
      withCredits.sort((a, b) => String(a.id).localeCompare(String(b.id)))
      return withCredits[0].id
    }
  }
  return null
}

/** 租约：超时、重入、排队。 */
export function acquire(store, workspace, holder, ctx) {
  const leases = store.leases ?? []
  const current = leases.find((l) => l.workspace === workspace)
  const free = !current || current.expiresAt <= ctx.now
  if (free || current.holder === holder) {
    return { ok: true, lease: { workspace, holder, expiresAt: ctx.now + ctx.ttlMs } }
  }
  if (ctx.allowQueue) return { ok: false, queued: true }
  return { ok: false, reason: `工作区已被占用：${workspace}` }
}

/** 关闭会话：先取消后释放，并报告残留。 */
export function closeReport(session, ctx) {
  const registrations = session.registrations ?? []
  return {
    cancelled: 1,
    released: [...(session.workspaces ?? [])],
    leaked: registrations.filter((r) => !r.expectedAfterDispose && r.released !== true).map((r) => r.what),
    order: ['取消该会话的作用域', '释放租约', '销毁容器', '落盘度量'],
  }
}
