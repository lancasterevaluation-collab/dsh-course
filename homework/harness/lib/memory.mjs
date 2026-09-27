// Part C 的参考实现。

const J = (a, b) => {
  const A = new Set(a); const B = new Set(b)
  let inter = 0
  for (const c of A) if (B.has(c)) inter++
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

const overlap = (query, text) => {
  const Q = new Set(query); const T = new Set(text)
  if (Q.size === 0) return 0
  let hit = 0
  for (const c of Q) if (T.has(c)) hit++
  return hit / Q.size
}

/** 写入：三个过滤器 + 容量 + 先合并。 */
export function write(entry, store, policy) {
  if (entry.crossSessionUseful === false) return { ok: false, reason: '不满足跨会话有用：会话内信息属于历史' }
  if (entry.temporary === true) return { ok: false, reason: '临时信息不应写入记忆' }
  if (entry.kind === 'inference' && !entry.source) throw new Error('推测类记忆必须标注来源')

  const entries = [...(store.entries ?? [])]
  const base = { text: entry.text, kind: entry.kind, source: entry.source, createdAt: 0, useCount: 0 }

  if (entries.length < store.capacity) {
    const e = { id: `m${entries.length + 1}`, ...base }
    return { ok: true, entry: e }
  }

  const similar = entries
    .map((e, i) => ({ e, i, s: J(entry.text, e.text) }))
    .filter((x) => x.s >= policy.similarityThreshold)
    .sort((a, b) => b.s - a.s)[0]

  if (!similar) return { ok: false, reason: `容量已满且无相似条目可合并（capacity=${store.capacity}）` }

  const merged = {
    id: similar.e.id,
    text: `${similar.e.text}；${entry.text}`,
    kind: entry.kind,
    source: entry.source ?? similar.e.source,
    createdAt: 0,
    useCount: (similar.e.useCount ?? 0) + 1,
  }
  return { ok: true, entry: merged, mergedInto: similar.e.id }
}

/** 检索：先过滤，再打分，再阈值，最后排序取前 k。 */
export function retrieve(query, store, opts) {
  const now = opts.now
  const decayDays = opts.decayDays ?? 30
  const alive = (store.entries ?? []).filter((e) => !e.suppressedAt && !(typeof e.expiresAt === 'number' && e.expiresAt <= now))
  const scored = alive.map((e) => {
    const recency = 1 / (1 + (now - e.createdAt) / decayDays)
    const frequency = Math.min(1, (e.useCount ?? 0) / 5)
    return { e, score: 1.0 * overlap(query, e.text) + 0.3 * recency + 0.2 * frequency }
  })
  return scored
    .filter((x) => x.score >= opts.threshold)
    .sort((a, b) => (b.score - a.score) || (b.e.createdAt - a.e.createdAt))
    .slice(0, opts.k)
    .map((x) => x.e)
}

/** 注入：分层 + 双预算 + 整条跳过。 */
export function inject(entries, budget, opts) {
  const stableUses = opts?.stableUses ?? 3
  const stable = entries.filter((e) => (e.useCount ?? 0) >= stableUses)
  const rest = entries.filter((e) => (e.useCount ?? 0) < stableUses)
  const order = [
    ...stable.sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0)),
    ...rest.sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0)),
  ]
  const label = { fact: '事实', preference: '偏好', inference: '推测' }
  const picked = []
  const skipped = []
  let text = ''
  let chars = 0
  for (const e of order) {
    const line = `${picked.length + 1}. [${label[e.kind] ?? e.kind}] ${e.text}`
    const add = (text ? 1 : 0) + line.length
    if (picked.length + 1 > budget.maxEntries || chars + add > budget.maxChars) {
      skipped.push(e.id)
      continue
    }
    text = text ? `${text}\n${line}` : line
    chars = text.length
    picked.push(e.id)
  }
  return { text, picked, chars, skipped }
}

/** 观测：从存储派生五类量。 */
export function observe(store, opts) {
  const now = opts?.now ?? 0
  const entries = store.entries ?? []
  const byKind = { fact: 0, preference: 0, inference: 0 }
  let suppressed = 0
  let expired = 0
  let totalUse = 0
  for (const e of entries) {
    if (byKind[e.kind] !== undefined) byKind[e.kind]++
    if (e.suppressedAt) suppressed++
    if (typeof e.expiresAt === 'number' && e.expiresAt <= now) expired++
    totalUse += e.useCount ?? 0
  }
  return { entries: entries.length, byKind, suppressed, expired, totalUse }
}
