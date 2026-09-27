// 1.5 配备算例：状态分类、真相源、可逆性四级、覆盖窗口、有界策略、原子切换、日志恢复。
//
// 每个函数对应讲义 1.5 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa19_state.mjs
import { pathToFileURL } from 'node:url'

/** 定义 1.5.1：状态三分类的取值。 */
export const STATE_KINDS = ['authoritative', 'derived', 'ephemeral']

/** 定义 1.5.3：可逆性四级的取值（由内到外）。 */
export const LEVELS = ['L0', 'L1', 'L2', 'L3']

/** 各等级的回滚代价（与 1.1 命题 1.1.5 同一模型）。 */
export const COST_BY_LEVEL = { L0: 0.1, L1: 1, L2: 10, L3: 100 }

/**
 * 定义 1.5.1：状态分类。判据是能否从其他状态重建。
 * @param rebuildable 能否重建 @param lifetimeWithinOneOp 生命周期是否不超过一次操作
 * @returns 分类名
 */
export function classifyState(rebuildable, lifetimeWithinOneOp = false) {
  if (lifetimeWithinOneOp) return 'ephemeral'
  return rebuildable ? 'derived' : 'authoritative'
}

/**
 * 定义 1.5.2 / 命题 1.5.1：真相源唯一性检查。
 * @param ownership `{ owner: stateName[] }` @returns `{ ok, duplicated }`
 */
export function checkSourceOfTruth(ownership) {
  const byState = new Map()
  for (const [owner, states] of Object.entries(ownership)) {
    for (const s of states) {
      if (!byState.has(s)) byState.set(s, [])
      byState.get(s).push(owner)
    }
  }
  const duplicated = [...byState.entries()].filter(([, owners]) => owners.length > 1)
  return { ok: duplicated.length === 0, duplicated }
}

/**
 * 定义 1.5.3：可逆性四级判定，由内到外逐层问。
 * @param scope `{ touchesExternalWorld, spansMultipleStores, crossesMachines, writesLocalData }`
 * @returns 'L0' | 'L1' | 'L2' | 'L3'
 */
export function reversibilityLevel(scope) {
  if (scope.touchesExternalWorld) return 'L3'
  if (scope.spansMultipleStores || scope.crossesMachines) return 'L2'
  if (scope.writesLocalData) return 'L1'
  return 'L0'
}

/**
 * 命题 1.5.3：可容忍缺陷率随等级递减（与 1.1 命题 1.1.5 同一公式）。
 * @param level 可逆性等级 @param lossBudget 可接受的期望损失 @returns 可容忍缺陷率
 */
export function tolerableDefectRate(level, lossBudget = 1) {
  if (!(level in COST_BY_LEVEL)) throw new Error(`未知等级：${level}`)
  return lossBudget / COST_BY_LEVEL[level]
}

/**
 * 命题 1.5.4：有界容器的覆盖窗口 T = C / r。
 * @param capacity 容量（条） @param writesPerSecond 写入速率（条/秒） @returns 覆盖秒数
 */
export function coverageWindow(capacity, writesPerSecond) {
  if (writesPerSecond <= 0) return Number.POSITIVE_INFINITY
  return capacity / writesPerSecond
}

/**
 * 命题 1.5.5：有界策略必须带可观测信号。
 * @param policy 'fail' | 'dropOldest' | 'spill' @param evictions 累计淘汰数
 * @returns `{ policy, signal, observable }`
 */
export function boundedPolicy(policy, evictions = 0) {
  const signals = {
    fail: '返回错误',
    dropOldest: `淘汰计数 ${evictions}`,
    spill: '留下指针',
  }
  return { policy, signal: signals[policy] ?? '无信号（缺陷）', observable: policy in signals }
}

/**
 * 工具箱 5.3：迁移的原子切换三步（与 3.5 工具箱 5.2 同一方法）。
 * @param staging 临时路径 @param target 目标路径 @returns 三步数组
 */
export function atomicSwitch(staging, target) {
  return [
    { step: 1, action: 'write', path: staging },
    { step: 2, action: 'fsync', path: staging },
    { step: 3, action: 'rename', from: staging, to: target },
  ]
}

/**
 * 命题 1.5.6：先写日志使中断可判定——按日志重做未应用的条目（要求 apply 幂等）。
 * @param log `[{ op, applied }]` @param apply 单条应用 @param state 初始状态 @returns 恢复后的状态
 */
export function recoverFrom(log, apply, state) {
  let s = state
  for (const entry of log) {
    if (entry.applied) continue
    s = apply(s, entry.op)
  }
  return s
}

/**
 * 命题 1.5.2：浅复制的可观察后果——改动原件后副本也被改。
 * @param obj 原对象 @param shallow 是否浅复制 @returns `{ copy, changed }`
 */
export function copyBehavior(obj, shallow = true) {
  const copy = shallow ? { ...obj } : { ...obj, tags: [...(obj.tags ?? [])] }
  // 判据是副本「自身」在改动原件前后是否变化，而不是副本与原件是否相等
  const before = JSON.stringify(copy.tags)
  if (Array.isArray(obj.tags)) obj.tags.push('mutated')
  const changed = JSON.stringify(copy.tags) !== before ? 'followed' : 'isolated'
  return { copy, changed }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(46)} ${v}`)

  // 状态分类
  line('状态分类（不可重建）', classifyState(false))
  line('状态分类（可重建）', classifyState(true))
  line('状态分类（一次操作内）', classifyState(true, true))

  // 真相源
  const okOwner = { 'session-store': ['messages'], 'cache': ['embeddings'] }
  const badOwner = { 'session-store': ['messages'], 'mirror': ['messages'] }
  line('真相源检查（唯一）', JSON.stringify(checkSourceOfTruth(okOwner).ok))
  line('真相源检查（双写）', JSON.stringify(checkSourceOfTruth(badOwner).duplicated))

  // 可逆性
  line('等级（只动内存）', reversibilityLevel({}))
  line('等级（写本地数据）', reversibilityLevel({ writesLocalData: true }))
  line('等级（跨机器）', reversibilityLevel({ crossesMachines: true }))
  line('等级（触及外部）', reversibilityLevel({ touchesExternalWorld: true }))
  line('L0 可容忍缺陷率', tolerableDefectRate('L0').toFixed(2))
  line('L3 可容忍缺陷率', tolerableDefectRate('L3').toFixed(4))
  line('两者之比', (tolerableDefectRate('L0') / tolerableDefectRate('L3')).toFixed(0) + ' 倍')

  // 覆盖窗口
  line('覆盖窗口 @ C=1000, r=5', coverageWindow(1000, 5) + ' 秒')
  line('10 分钟回溯所需容量 @ r=5', 5 * 600 + ' 条')
  line('覆盖窗口 @ r=50（速率上升）', coverageWindow(1000, 50) + ' 秒')
  line('覆盖窗口 @ r=0', coverageWindow(1000, 0))

  // 有界策略
  line('策略 fail', JSON.stringify(boundedPolicy('fail')))
  line('策略 dropOldest（淘汰 12）', JSON.stringify(boundedPolicy('dropOldest', 12)))
  line('未知策略', JSON.stringify(boundedPolicy('whatever')))

  // 原子切换与恢复
  line('原子切换步数', atomicSwitch('/tmp/new', '/data/state').length)
  const log = [
    { op: { set: 1 }, applied: true },
    { op: { set: 2 }, applied: false },
    { op: { set: 3 }, applied: false },
  ]
  line('日志恢复（跳过已应用）', JSON.stringify(recoverFrom(log, (s, op) => op.set, 0)))

  // 浅复制
  line('浅复制后改原件', copyBehavior({ tags: ['a'] }, true).changed)
  line('深复制后改原件', copyBehavior({ tags: ['a'] }, false).changed)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
