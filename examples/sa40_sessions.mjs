// 5.2 多会话与并发的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/**
 * 定义 5.2.3：请求的 token 估算。
 * @param request 形如 `{ tokens }` 的请求
 * @returns token 数
 */
export function estimate(request) {
  return request.tokens ?? 0
}

/**
 * 定义 5.2.3：三维配额的准入判断，顺序按拒绝后的等待时长排。
 * @param session 形如 `{ id, running, quota }` 的会话
 * @param registry 形如 `{ config, globalConcurrent, tokensInWindow }`
 * @param request 请求
 * @returns `{ ok, reason?, retryAfter? }`
 */
export function admit(session, registry, request) {
  if (registry.globalConcurrent() >= registry.config.globalMaxConcurrent) {
    return { ok: false, reason: '全局并发已满', retryAfter: 1000 }
  }
  if (session.running >= session.quota.maxConcurrent) {
    return { ok: false, reason: '会话并发已满', retryAfter: 500 }
  }
  const used = registry.tokensInWindow(session.id, 60_000)
  if (used + estimate(request) > session.quota.maxTokensPerMinute) {
    return { ok: false, reason: '速率超限', retryAfter: 60_000 }
  }
  return { ok: true }
}

/**
 * 命题 5.2.2：先来先服务的等待时间。
 * @param work 各会话的工作量
 * @returns `{ waits, total }`
 */
export function fifoWait(work) {
  let t = 0
  const waits = work.map((w) => {
    const start = t
    t += w
    return start
  })
  return { waits, total: t }
}

/**
 * 命题 5.2.2：按配额轮转的首次响应时间与总时长。
 * @param work 各会话的工作量
 * @param quantum 时间片
 * @returns `{ first, total }`
 */
export function roundRobinWait(work, quantum) {
  const left = [...work]
  const first = new Array(work.length).fill(null)
  let t = 0
  while (left.some((w) => w > 0)) {
    for (let i = 0; i < left.length; i++) {
      if (left[i] <= 0) continue
      if (first[i] === null) first[i] = t
      const slice = Math.min(quantum, left[i])
      t += slice
      left[i] -= slice
    }
  }
  return { first, total: t }
}

/**
 * 定义 5.2.4：轮转加优先级——先按优先级分组，再在组内按剩余配额挑选。
 * @param sessions 会话数组
 * @param presetOf 预设查询
 * @param creditsOf 剩余配额查询
 * @returns 下一个执行者的 id；没有可执行者时为 null
 */
export function schedule(sessions, presetOf, creditsOf) {
  const ready = sessions.filter((s) => s.state === 'running' || s.state === 'idle')
  if (ready.length === 0) return null
  const byPriority = new Map()
  for (const s of ready) {
    const p = presetOf(s.preset).priority ?? 0
    if (!byPriority.has(p)) byPriority.set(p, [])
    byPriority.get(p).push(s)
  }
  for (const level of [...byPriority.keys()].sort((a, b) => b - a)) {
    const next = byPriority.get(level).find((s) => creditsOf(s.id) > 0)
    if (next) return next.id
  }
  return null
}

/** 定义 5.2.5：一个最小的租约注册表。 */
export class LeaseRegistry {
  #leases = new Map()
  #queues = new Map()

  /**
   * @param ttl 租约时长
   */
  constructor(ttl = 60000) {
    this.ttl = ttl
  }

  /**
   * 获取租约；冲突时排队。
   * @param workspace 工作区
   * @param holder 持有者
   * @param now 当前时间
   * @returns `{ queued, lease, position }`
   */
  acquire(workspace, holder, now) {
    const existing = this.#leases.get(workspace)
    if (existing && existing.expiresAt > now && existing.holder !== holder) {
      const queue = this.#queues.get(workspace) ?? []
      queue.push(holder)
      this.#queues.set(workspace, queue)
      return { queued: true, lease: null, position: queue.length }
    }
    const lease = { workspace, holder, expiresAt: now + this.ttl, mode: 'exclusive' }
    this.#leases.set(workspace, lease)
    return { queued: false, lease, position: 0 }
  }

  /**
   * 查询工作区的当前租约。
   * @param workspace 工作区
   * @returns 租约或 undefined
   */
  leaseOf(workspace) { return this.#leases.get(workspace) }

  /**
   * 释放租约。
   * @param workspace 工作区
   * @returns 无
   */
  release(workspace) { this.#leases.delete(workspace) }
}

/**
 * 定义 5.2.6 / 命题 5.2.5：关闭与回收核对。
 * @param handle 会话句柄
 * @param registry 会话注册表
 * @param ctx 形如 `{ graceMs, cancelScope, release, disposeContainer, flushMetrics, listRegistrations }`
 * @returns `{ cancelled, released, leaked }`
 */
export function closeSession(handle, registry, ctx) {
  registry.setState(handle.id, 'closing')
  const cancelled = ctx.cancelScope(handle.scope.id, ctx.graceMs)
  const released = handle.leases.map((l) => ctx.release(l))
  ctx.disposeContainer(handle.container)
  ctx.flushMetrics(handle.id)
  registry.setState(handle.id, 'closed')
  registry.remove(handle.id)
  const leaked = ctx.listRegistrations()
    .filter((r) => r.scope === handle.scope.id && !r.expectedAfterDispose)
    .map((r) => `${r.what}（来自 ${r.plugin}）`)
  return { cancelled, released, leaked }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('5.2 多会话与并发 · 算例（SA-40）')
  rows.push('')

  rows.push('[1] 调度的等待分布')
  const work = [10, 2, 2]
  const fifo = fifoWait(work)
  const rr = roundRobinWait(work, 2)
  line('先来先服务的等待时间', JSON.stringify(fifo.waits))
  line('轮转的首次响应时间', JSON.stringify(rr.first))
  line('两者总时长', `${fifo.total} / ${rr.total}`)
  line('轮转把第二个会话的等待缩短', rr.first[1] < fifo.waits[1])
  line('轮转把第三个会话的等待缩短', rr.first[2] < fifo.waits[2])
  const rr4 = roundRobinWait(work, 4)
  line('时间片为 4 时的首次响应', JSON.stringify(rr4.first))
  line('时间片变大后第二位的等待变化', `${rr.first[1]} → ${rr4.first[1]}`)
  rows.push('')

  rows.push('[2] 配额准入')
  const session = { id: 's1', running: 2, quota: { maxConcurrent: 3, maxTokensPerMinute: 1000 } }
  const base = { config: { globalMaxConcurrent: 10 }, globalConcurrent: () => 1, tokensInWindow: () => 0 }
  line('未超限时是否准入', admit(session, base, { tokens: 100 }).ok)
  line('全局并发已满时的拒绝原因', admit(session, { ...base, globalConcurrent: () => 10 }, { tokens: 1 }).reason)
  line('全局满时的重试建议', admit(session, { ...base, globalConcurrent: () => 10 }, { tokens: 1 }).retryAfter)
  line('会话并发已满时的拒绝原因', admit({ ...session, running: 3 }, base, { tokens: 1 }).reason)
  line('会话满时的重试建议', admit({ ...session, running: 3 }, base, { tokens: 1 }).retryAfter)
  const rate = { ...base, tokensInWindow: () => 950 }
  line('速率超限时的拒绝原因', admit(session, rate, { tokens: 100 }).reason)
  line('速率超限时的重试建议', admit(session, rate, { tokens: 100 }).retryAfter)
  line('建议的等待时长递增', admit(session, rate, { tokens: 100 }).retryAfter > admit({ ...session, running: 3 }, base, { tokens: 1 }).retryAfter)
  rows.push('')

  rows.push('[3] 租约')
  const leases = new LeaseRegistry(60000)
  line('首次获取是否成功', !leases.acquire('ws', 'a', 0).queued)
  const conflict = leases.acquire('ws', 'b', 100)
  line('冲突时是否排队', conflict.queued)
  line('排队位置', conflict.position)
  const again = leases.acquire('ws', 'b', 200)
  line('再次冲突时的排队位置', again.position)
  line('同一持有者重复获取时是否直接成功', !leases.acquire('ws', 'a', 300).queued)
  const afterExpiry = leases.acquire('ws', 'b', 60301)
  line('租约过期后是否可被他人获取', !afterExpiry.queued)
  line('过期后新租约的持有者', afterExpiry.lease.holder)
  line('租约的模式', afterExpiry.lease.mode)
  rows.push('')

  rows.push('[4] 回收')
  const registry = {
    state: null,
    setState(id, s) { this.state = s },
    remove() {},
  }
  const ctx = {
    graceMs: 5000,
    cancelScope: () => 3,
    release: (l) => l,
    disposeContainer: () => {},
    flushMetrics: () => {},
    listRegistrations: () => [
      { scope: 'sc1', what: 'tool/read', plugin: 'a-plugin', expectedAfterDispose: false },
      { scope: 'sc1', what: 'logger', plugin: 'log-plugin', expectedAfterDispose: true },
      { scope: 'sc1', what: 'timer', plugin: 'a-plugin', expectedAfterDispose: true },
    ],
  }
  const handle = { id: 's1', scope: { id: 'sc1' }, container: {}, leases: ['ws'] }
  const report = closeSession(handle, registry, ctx)
  line('回收报告里的未释放项数', report.leaked.length)
  line('未释放项的描述', report.leaked[0])
  line('期望存活的注册不计入泄漏', !report.leaked.some((l) => l.includes('logger')))
  line('回收后会话状态', registry.state)
  line('取消的操作数', report.cancelled)
  line('释放的租约数', report.released.length)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
