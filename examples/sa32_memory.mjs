// 4.1 记忆的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
// 算例里的时间单位是「天」，now = 100 表示第 100 天。
import { pathToFileURL } from 'node:url'

/**
 * 定义 4.1.2：三个过滤器——跨会话有用、来源可查、不是临时的。
 * @param candidate 形如 `{ kind, source, crossSession, temporary }` 的候选
 * @returns `{ accept, reasons }`
 */
export function checkWriteFilters(candidate) {
  const reasons = []
  if (!candidate.crossSession) reasons.push('只在本次会话有用')
  if (candidate.kind === 'inference' && !candidate.source) reasons.push('推测类记忆缺来源标注')
  if (candidate.temporary) reasons.push('临时信息')
  return { accept: reasons.length === 0, reasons }
}

/**
 * 定义 4.1.1：写入时补上计数与状态字段。
 * @param candidate 候选
 * @param now 当前时间（天）
 * @returns 记忆条目
 */
export function makeEntry(candidate, now) {
  return {
    id: candidate.id,
    text: candidate.text,
    kind: candidate.kind,
    source: candidate.source ?? null,
    createdAt: now,
    useCount: 0,
    lastUsedAt: null,
    status: 'active',
    tokens: candidate.tokens ?? 10,
  }
}

/** 定义 4.1.3：三种信号的权重，取值需要用标注集检验。 */
export const WEIGHTS = { overlap: 1.0, recency: 0.3, frequency: 0.2 }

/**
 * 定义 4.1.3：一条条目对查询的得分。
 * @param query 查询词
 * @param e 记忆条目
 * @param now 当前时间（天）
 * @param decayDays 时间衰减的半程尺度（天）
 * @returns 得分
 */
export function scoreEntry(query, e, now, decayDays = 30) {
  const q = query.toLowerCase()
  const overlap = e.text.toLowerCase().includes(q) ? 1 : 0
  const ageDays = now - (e.lastUsedAt ?? e.createdAt)
  const recency = 1 / (1 + ageDays / decayDays)
  const frequency = Math.min(1, e.useCount / 5)
  return WEIGHTS.overlap * overlap + WEIGHTS.recency * recency + WEIGHTS.frequency * frequency
}

/**
 * 定义 4.1.3：检索——先过滤不应参与的条目，再按得分排序并应用阈值。
 * @param query 查询词
 * @param entries 条目数组
 * @param opts `{ now, k, threshold, decayDays }`
 * @returns 有序的条目数组
 */
export function retrieve(query, entries, opts) {
  return entries
    .filter((e) => e.status === 'active')
    .map((e) => ({ e, s: scoreEntry(query, e, opts.now, opts.decayDays) }))
    .filter((x) => x.s >= opts.threshold)
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.k)
    .map((x) => x.e)
}

/**
 * 定义 4.1.4：双重预算、稳定在前、预算不足时跳过整条。
 * @param entries 条目数组
 * @param budget `{ maxEntries, maxTokens }`
 * @param stableThreshold 判定稳定的使用次数阈值
 * @returns `{ picked, tokens, skipped }`
 */
export function planInjection(entries, budget, stableThreshold = 3) {
  const stable = entries.filter((e) => e.useCount >= stableThreshold)
  const rest = entries.filter((e) => e.useCount < stableThreshold)
  const picked = []
  let tokens = 0
  for (const e of [...stable, ...rest]) {
    if (picked.length >= budget.maxEntries) break
    if (tokens + e.tokens > budget.maxTokens) continue      // 整条跳过，不截断
    picked.push(e)
    tokens += e.tokens
  }
  return { picked, tokens, skipped: entries.length - picked.length }
}

/**
 * 定义 4.1.4：注入内容的格式——带编号与性质说明。
 * @param picked 选中的条目
 * @returns 给模型的一段文本；空选择时返回空串
 */
export function formatInjection(picked) {
  if (picked.length === 0) return ''
  const lines = picked.map((e, i) => `${i + 1}. [${e.kind}] ${e.text}`)
  return `以下是已知的偏好与事实：\n${lines.join('\n')}`
}

/**
 * 定义 4.1.6 / 命题 4.1.2：污染在 n 次相关任务里的期望影响次数。
 * @param p 单次相关任务中该条目被注入的概率
 * @param n 相关任务次数
 * @returns 期望影响次数
 */
export function pollutionExposure(p, n) {
  return p * n
}

/**
 * 命题 4.1.4：前缀失效长度。
 * @param stableTokens 稳定部分的 token 数
 * @param taskTokens 任务相关部分的 token 数
 * @param layered 是否按稳定性分层放置
 * @returns 每次任务相关记忆变化时的失效长度
 */
export function prefixInvalidation(stableTokens, taskTokens, layered) {
  return layered ? 0 : stableTokens + taskTokens
}

/**
 * 命题 4.1.5：淘汰策略可用的依据数。
 * @param hasObservation 是否有使用观测
 * @returns 依据数；无观测时为零
 */
export function evictionEvidence(hasObservation) {
  return hasObservation ? 1 : 0
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('4.1 记忆 · 算例（SA-32）')
  rows.push('')

  rows.push('[1] 写入过滤器')
  const candidates = [
    { id: 'c1', text: '用户偏好简体中文', kind: 'preference', source: 'user', crossSession: true },
    { id: 'c2', text: '这次提交信息是 fix typo', kind: 'fact', source: 'user', crossSession: false },
    { id: 'c3', text: '用户可能不喜欢长回答', kind: 'inference', source: null, crossSession: true },
    { id: 'c4', text: '这个项目用 pnpm 而不是 npm', kind: 'fact', source: 'user', crossSession: true },
  ]
  const checked = candidates.map((c) => ({ c, r: checkWriteFilters(c) }))
  line('候选数', candidates.length)
  line('通过的候选数', checked.filter((x) => x.r.accept).length)
  line('被拒绝的原因', checked.flatMap((x) => x.r.reasons).join(', '))
  line('临时信息也被拒绝', checkWriteFilters({ kind: 'fact', source: 'user', crossSession: true, temporary: true }).accept)
  line('带来源的推测可以通过', checkWriteFilters({ kind: 'inference', source: 'model', crossSession: true }).accept)
  rows.push('')

  rows.push('[2] 检索')
  const entries = [
    { ...makeEntry({ id: 'm1', text: '用户偏好简短回答', kind: 'preference', source: 'user' }, 0), useCount: 0 },
    { ...makeEntry({ id: 'm2', text: '用户偏好简体中文', kind: 'preference', source: 'user' }, 90), useCount: 1 },
    { ...makeEntry({ id: 'm3', text: '这个项目用 pnpm 而不是 npm', kind: 'fact', source: 'user' }, 10), useCount: 0 },
  ]
  const opts = { now: 100, k: 5, threshold: 0.5, decayDays: 30 }
  const hits = retrieve('用户', entries, opts)
  line('命中条数', hits.length)
  line('排序第一名', hits[0]?.id)
  line('不相关查询的命中条数', retrieve('sql', entries, opts).length)
  line('阈值把低分条目挡在外面', retrieve('用户', entries, { ...opts, threshold: 1.2 }).length)
  line('时间衰减把较新的排到前面', hits[0].id === 'm2')
  const scored = entries.map((e) => [e.id, Number(scoreEntry('用户', e, 100).toFixed(3))])
  line('三条的得分', JSON.stringify(scored))
  const suppressed = entries.map((e) => (e.id === 'm2' ? { ...e, status: 'suppressed' } : e))
  line('抑制之后命中条数', retrieve('用户', suppressed, opts).length)
  rows.push('')

  rows.push('[3] 注入')
  const injectable = [
    { id: 's1', text: '用户偏好简体中文', kind: 'preference', useCount: 5, tokens: 20 },
    { id: 's2', text: '这个项目用 pnpm', kind: 'fact', useCount: 4, tokens: 20 },
    { id: 's3', text: '一段很长的过程描述', kind: 'fact', useCount: 0, tokens: 100 },
  ]
  const plan = planInjection(injectable, { maxEntries: 5, maxTokens: 60 })
  line('注入条数', plan.picked.length)
  line('注入 token 数', plan.tokens)
  line('跳过的条数', plan.skipped)
  line('稳定条目是否排在前', plan.picked[0].useCount >= 3 && plan.picked[1].useCount >= 3)
  line('预算不足时是否截断单条', plan.picked.some((e) => e.id === 's3'))
  line('注入文本的首行', formatInjection(plan.picked).split('\n')[0])
  line('空选择时注入文本为空', formatInjection([]) === '')
  rows.push('')

  rows.push('[4] 污染与容量')
  line('10 次相关任务的期望影响次数', pollutionExposure(0.3, 10))
  line('30 次相关任务的期望影响次数', pollutionExposure(0.3, 30))
  line('概率降一半后的影响次数', pollutionExposure(0.15, 10))
  line('全部前部注入时的失效长度', prefixInvalidation(1500, 500, false))
  line('分层注入时的失效长度', prefixInvalidation(1500, 500, true))
  line('无观测时淘汰策略的依据数', evictionEvidence(false))
  line('有观测时淘汰策略的依据数', evictionEvidence(true))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
