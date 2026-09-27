// Part C · 记忆系统
//
// 对应讲义：4.1 记忆。契约：见 ../CONTRACT.md 的「Part C」。
//
// 起步状态：四个函数都抛错。这一项的判据里有四条是"看起来对、其实错"的：
//   被抑制的条目不参与检索、低于阈值返回空、注入时整条跳过、写满时先合并。

/**
 * 写入策略的三个过滤器 + 有界处置。
 *
 * 契约要点：
 *   - crossSessionUseful === false → 拒绝（reason 含「跨会话」）
 *   - temporary === true → 拒绝（reason 含「临时」）
 *   - kind === 'inference' 且无 source → 抛错（信息含「来源」）
 *   - 容量满：先找相似条目合并（返回 mergedInto），找不到才拒绝（reason 含「容量」）
 *   - 相似度用字符级 Jaccard；不修改传入的 store
 *
 * 提示：这道题的顺序很重要——三个过滤器在容量判断**之前**，否则一个本该被拒的候选
 *       会把容量用掉。而"先合并"是讲义 4.1 的 1.4 里那条"推荐的处置"。
 *
 * @param {{ text: string, kind: string, source?: string, crossSessionUseful?: boolean, temporary?: boolean }} entry
 * @param {{ capacity: number, entries: Array<object> }} store
 * @param {{ similarityThreshold: number }} policy
 * @returns {{ ok: boolean, entry?: object, reason?: string, mergedInto?: string }}
 */
export function write(entry, store, policy) {
  throw new Error('未实现：write')
}

/**
 * 检索：三种信号打分 + 阈值 + 抑制与过期过滤。
 *
 * 契约要点：
 *   - **打分之前**过滤 suppressedAt 与 expiresAt <= now 的条目
 *   - score = 1.0 * overlap + 0.3 * recency + 0.2 * frequency
 *     overlap = |Q ∩ T| / |Q|（字符集合）；recency = 1/(1+age/decayDays)；frequency = min(1, useCount/5)
 *   - 分数 < threshold 的不返回（不为凑满 k 而返回）
 *   - 同分按 createdAt 降序
 *
 * @param {string} query
 * @param {{ entries: Array<object> }} store
 * @param {{ k: number, threshold: number, now: number, decayDays?: number }} opts
 * @returns {Array<object>}
 */
export function retrieve(query, store, opts) {
  throw new Error('未实现：retrieve')
}

/**
 * 注入：双预算、按稳定性分层、超预算整条跳过。
 *
 * 契约要点：
 *   - useCount >= stableUses 的在前（组内按 useCount 降序）
 *   - 条数与字符双预算；**超预算跳过整条**（不得截断），被跳过的进 skipped
 *   - text 每条带编号与性质说明（[事实]/[偏好]/[推测]）
 *
 * 提示：这一条判据（整条跳过）是讲义 4.1 的 1.3 里那句"半句记忆比没有记忆更糟"。
 *
 * @param {Array<object>} entries
 * @param {{ maxEntries: number, maxChars: number }} budget
 * @param {{ stableUses?: number }} opts
 * @returns {{ text: string, picked: string[], chars: number, skipped: string[] }}
 */
export function inject(entries, budget, opts) {
  throw new Error('未实现：inject')
}

/**
 * 观测：从存储派生的四类量。
 *
 * 契约要点：
 *   - { entries, byKind, suppressed, expired, totalUse }
 *   - 空 store 各项为 0
 *   - expired 用 opts.now 判定（缺省按 0）
 *
 * @param {{ entries: Array<object> }} store
 * @param {{ now?: number }} [opts]
 * @returns {{ entries: number, byKind: object, suppressed: number, expired: number, totalUse: number }}
 */
export function observe(store, opts) {
  throw new Error('未实现：observe')
}
