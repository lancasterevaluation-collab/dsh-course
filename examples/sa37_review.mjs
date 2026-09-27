// 4.6 复盘周期的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/**
 * 命题 4.6.1：任务集对某类退化的漏检率。
 * @param p 单任务上出现退化的概率
 * @param n 任务数
 * @returns 漏检概率
 */
export function missRate(p, n) {
  return (1 - p) ** n
}

/**
 * 定义 4.6.2：三种触发，严重程度递增。
 * @param state 形如 `{ lastReviewAt, failures, metrics, thresholds }`
 * @param config 形如 `{ now, reviewInterval, burstWindow, burstCount }`
 * @returns 触发对象；都不满足时为 null
 */
export function shouldReview(state, config) {
  if (config.now - state.lastReviewAt >= config.reviewInterval) return { kind: 'time', reason: '周期到' }
  const recent = state.failures.filter((f) => config.now - f.at <= config.burstWindow)
  const byKind = new Map()
  for (const f of recent) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1)
  const top = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top && top[1] >= config.burstCount) return { kind: 'event', reason: `同类失败 ${top[1]} 次` }
  const breach = Object.entries(state.metrics ?? {}).find(([k, v]) => v > (state.thresholds?.[k] ?? Infinity))
  if (breach) return { kind: 'threshold', reason: `${breach[0]} 越过阈值` }
  return null
}

/**
 * 定义 4.6.3：稳定性与判据双筛，再按 kind 轮流分层取样。
 * @param samples 候选任务
 * @param target 目标规模
 * @param minStability 稳定性下限
 * @returns 任务集
 */
export function buildTaskSet(samples, target = 100, minStability = 0.9) {
  const stable = samples.filter((t) => t.check && t.stability >= minStability)
  const byKind = new Map()
  for (const t of stable) {
    if (!byKind.has(t.kind)) byKind.set(t.kind, [])
    byKind.get(t.kind).push(t)
  }
  const picked = []
  const kinds = [...byKind.keys()].sort()
  let i = 0
  while (picked.length < target && kinds.some((k) => byKind.get(k).length > 0)) {
    const kind = kinds[i % kinds.length]
    const next = byKind.get(kind).shift()
    if (next) picked.push(next)
    i++
  }
  return picked
}

/**
 * 命题 4.6.4：按比例替换而不是重建。
 * @param current 现有任务集
 * @param samples 新采样候选
 * @param ratio 替换比例
 * @returns 新任务集
 */
export function rotateTaskSet(current, samples, ratio) {
  const keep = Math.floor(current.length * (1 - ratio))
  const need = current.length - keep
  const fresh = buildTaskSet(samples, need)
  return [...current.slice(0, keep), ...fresh]
}

/**
 * 定义 4.6.5：带理由的放弃计入覆盖。
 * @param outputs 产出数组
 * @returns 覆盖率
 */
export function coverage(outputs) {
  if (outputs.length === 0) return 1
  const closed = outputs.filter((o) => o.state === 'done' || (o.state === 'dropped' && o.dropReason))
  return closed.length / outputs.length
}

/**
 * 命题 4.6.3：覆盖率低时本轮不再新增。
 * @param outputs 产出数组
 * @param minCoverage 覆盖率下限
 * @returns 是否允许新增
 */
export function gateOnCoverage(outputs, minCoverage) {
  return coverage(outputs) >= minCoverage
}

/**
 * 命题 4.6.4 的配套：同一版本两次运行的一致度与噪声。
 * @param runA 第一次运行的布尔结果
 * @param runB 第二次运行的布尔结果
 * @returns `{ consistent, noise, unstable }`
 */
export function stability(runA, runB) {
  const same = runA.filter((v, i) => v === runB[i]).length
  const rate = (xs) => xs.filter(Boolean).length / Math.max(1, xs.length)
  return {
    consistent: same / Math.max(1, runA.length),
    noise: Math.abs(rate(runA) - rate(runB)),
    unstable: runA.filter((v, i) => v !== runB[i]).length,
  }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('4.6 复盘周期 · 算例（SA-37）')
  rows.push('')

  rows.push('[1] 触发')
  const base = { lastReviewAt: 100, failures: [], metrics: {}, thresholds: {} }
  const cfg = { now: 110, reviewInterval: 5, burstWindow: 10, burstCount: 3 }
  line('周期到时的触发类型', shouldReview(base, cfg)?.kind)
  const burst = { ...base, lastReviewAt: 108, failures: [{ kind: 'timeout', at: 105 }, { kind: 'timeout', at: 106 }, { kind: 'timeout', at: 107 }] }
  line('同类失败聚集时的触发类型', shouldReview(burst, cfg)?.kind)
  line('聚集触发的原因', shouldReview(burst, cfg)?.reason)
  const breach = { ...base, lastReviewAt: 108, metrics: { cost: 12 }, thresholds: { cost: 10 } }
  line('指标越界时的触发类型', shouldReview(breach, cfg)?.kind)
  const quiet = { ...base, lastReviewAt: 108, metrics: { cost: 1 }, thresholds: { cost: 10 } }
  line('三者都不满足时是否触发', shouldReview(quiet, cfg) === null)
  rows.push('')

  rows.push('[2] 任务集')
  const samples = [
    { id: 't1', kind: 'code', check: 'x', stability: 1 },
    { id: 't2', kind: 'code', check: 'x', stability: 0.95 },
    { id: 't3', kind: 'doc', check: 'x', stability: 0.92 },
    { id: 't4', kind: 'doc', check: 'x', stability: 0.5 },
    { id: 't5', kind: 'chore', check: null, stability: 1 },
    { id: 't6', kind: 'chore', check: 'x', stability: 1 },
  ]
  const built = buildTaskSet(samples, 4)
  line('样本数', samples.length)
  line('构建出的任务集大小', built.length)
  line('不稳定任务是否被剔除', !built.some((t) => t.id === 't4'))
  line('没有检查的任务是否被剔除', !built.some((t) => t.id === 't5'))
  line('分层是否覆盖多个 kind', new Set(built.map((t) => t.kind)).size)
  const current = [{ id: 'old1', kind: 'k', check: 'x', stability: 1 }, { id: 'old2', kind: 'k', check: 'x', stability: 1 }, { id: 'old3', kind: 'k', check: 'x', stability: 1 }, { id: 'old4', kind: 'k', check: 'x', stability: 1 }]
  const rotated = rotateTaskSet(current, samples, 0.25)
  line('按比例替换后保留的旧任务数', rotated.filter((t) => t.id.startsWith('old')).length)
  line('替换后的任务集大小', rotated.length)
  rows.push('')

  rows.push('[3] 跟踪')
  const mk = (state, dropReason) => ({ state, dropReason })
  line('全部完成时的覆盖率', coverage([mk('done'), mk('done'), mk('done'), mk('done')]))
  line('含带理由放弃时的覆盖率', coverage([mk('done'), mk('done'), mk('todo'), mk('dropped', '不需要了')]))
  line('含无理由放弃时的覆盖率', coverage([mk('done'), mk('done'), mk('todo'), mk('dropped')]))
  line('空产出集合的覆盖率', coverage([]))
  line('覆盖率低于阈值时是否允许新增', gateOnCoverage([mk('done'), mk('done'), mk('todo'), mk('todo')], 0.75))
  line('覆盖率达标时是否允许新增', gateOnCoverage([mk('done'), mk('done'), mk('done'), mk('todo')], 0.75))
  rows.push('')

  rows.push('[4] 稳定性与漏检')
  const runA = [true, true, false, true, true, true, true, true, true, true]
  const runB = [true, true, true, true, true, true, true, true, true, true]
  const s = stability(runA, runB)
  line('两次运行的一致度', s.consistent)
  line('成功率差异（噪声）', s.noise)
  line('不稳定任务数', s.unstable)
  line('20 个任务对 5% 退化的漏检率', missRate(0.05, 20).toFixed(3))
  line('50 个任务对 5% 退化的漏检率', missRate(0.05, 50).toFixed(3))
  line('100 个任务对 5% 退化的漏检率', missRate(0.05, 100).toFixed(4))
  line('200 个任务对 5% 退化的漏检率', missRate(0.05, 200).toFixed(6))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
