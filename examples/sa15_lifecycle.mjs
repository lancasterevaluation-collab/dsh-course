// 1.1 配备算例：拓扑排序、可逆性分级、影响面、债的利息、完成判据。
//
// 每个函数对应讲义 1.1 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa15_lifecycle.mjs
import { pathToFileURL } from 'node:url'

/** 定义 1.1.1：十站。每站有输入、产出、判据、失败代价四要素。 */
export const STAGES = ['意图', '判据', '影响面', '方案', '依赖序', '实现', '验证', '发布', '观测', '退役']

/** 各站的产出（走查时逐站核对）。 */
export const STAGE_OUTPUTS = {
  意图: '一句话说明要解决什么问题',
  判据: '可观测的完成断言',
  影响面: '受影响的节点清单',
  方案: '至少两个可选方案及取舍',
  依赖序: '偏序与它的线性扩展',
  实现: '可运行的代码',
  验证: '覆盖影响面的检查',
  发布: '发布方式与回滚路径',
  观测: '判据对应的度量',
  退役: '移除方式与依赖它的调用方',
}

/**
 * 工具箱 5.1：Kahn 拓扑排序。给出线性扩展，并检测依赖环。
 * @param nodes 节点数组 @param edges `[from, to]` 数组（from 必须先于 to）
 * @returns `{ order, cyclic }`
 */
export function topoOrder(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n, 0]))
  const out = new Map(nodes.map((n) => [n, []]))
  for (const [from, to] of edges) {
    out.get(from).push(to)
    indeg.set(to, indeg.get(to) + 1)
  }
  const queue = nodes.filter((n) => indeg.get(n) === 0)
  const order = []
  while (queue.length) {
    const n = queue.shift()
    order.push(n)
    for (const m of out.get(n)) {
      indeg.set(m, indeg.get(m) - 1)
      if (indeg.get(m) === 0) queue.push(m)
    }
  }
  return { order, cyclic: order.length < nodes.length }
}

/**
 * 定义 1.1.2 / 工具箱 5.2：可逆性三级判据。
 * @param spec `{ rollbackMinutes, externalDependents, needsCoordination }`
 * @returns 'two-way' | 'slow' | 'one-way'
 */
export function reversibility(spec) {
  if (spec.needsCoordination || spec.rollbackMinutes > 60 * 24) return 'one-way'
  if (spec.externalDependents > 0 || spec.rollbackMinutes > 60) return 'slow'
  return 'two-way'
}

/**
 * 命题 1.1.5：单向门可容忍的缺陷率。
 * @param lossBudget 可接受的期望损失 @param rollbackCost 回滚代价 @returns 可容忍缺陷率
 */
export function tolerableDefectRate(lossBudget, rollbackCost) {
  return lossBudget / rollbackCost
}

/**
 * 定义 1.1.3 / 工具箱 5.3：影响面——从变更集合出发的正向可达。
 * @param delta 变更节点数组 @param graph `Map<node, node[]>`（值是依赖该节点的节点）
 * @returns 受影响的节点数组
 */
export function blastRadius(delta, graph) {
  const seen = new Set(delta)
  const queue = [...delta]
  while (queue.length) {
    const v = queue.shift()
    for (const w of graph.get(v) ?? []) {
      if (!seen.has(w)) { seen.add(w); queue.push(w) }
    }
  }
  return [...seen]
}

/**
 * 命题 1.1.4：债的临界时间 t* = R / i。
 * @param refactorHours 重构成本（小时） @param interestPerWeek 每周利息（小时） @returns 周数
 */
export function debtBreakEven(refactorHours, interestPerWeek) {
  return refactorHours / interestPerWeek
}

/**
 * 命题 1.1.4：债在给定时间窗内的累计利息。
 * @param interestPerWeek 每周利息 @param weeks 周数 @returns 累计小时数
 */
export function debtInterest(interestPerWeek, weeks) {
  return interestPerWeek * weeks
}

/**
 * 定义 1.1.4 / 工具箱 5.5：完成判据检查。判据须可观测且含阈值。
 * @param criteria `[{ metric, threshold, windowDays }]` @param observations `{ metric: value }`
 * @returns `{ done, failed }`
 */
export function checkCompletion(criteria, observations) {
  const failed = criteria.filter((c) => {
    const v = observations[c.metric]
    return v === undefined || v >= c.threshold
  })
  return { done: failed.length === 0, failed: failed.map((c) => c.metric) }
}

/**
 * 定义 1.1.5 / 命题 1.1.6：错误预算与发布判定。
 * @param requests 窗口内请求数 @param allowedFailures 允许的失败数 @param actualFailures 实际失败数
 * @returns `{ budget, rate, releasable }`
 */
export function releaseDecision(requests, allowedFailures, actualFailures) {
  const budget = allowedFailures / requests
  const rate = actualFailures / requests
  return { budget, rate, releasable: rate <= budget }
}

/**
 * 十站走查：返回缺失产出的站。
 * @param provided 已具备产出的站名数组 @returns 缺失站名数组
 */
export function walkthrough(provided) {
  const set = new Set(provided)
  return STAGES.filter((s) => !set.has(s))
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  line('十站', STAGES.join(' → '))

  // 依赖序
  const t1 = topoOrder(['判据', '方案', '实现'], [['判据', '方案'], ['方案', '实现']])
  line('拓扑序（无环）', t1.order.join(' → ') + `，有环=${t1.cyclic}`)
  const t2 = topoOrder(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']])
  line('拓扑序（有环）', `输出 ${t2.order.length} 个节点，有环=${t2.cyclic}`)

  // 可逆性
  line('可逆性（回滚 5 分钟，无外部依赖）', reversibility({ rollbackMinutes: 5, externalDependents: 0, needsCoordination: false }))
  line('可逆性（回滚 2 小时）', reversibility({ rollbackMinutes: 120, externalDependents: 0, needsCoordination: false }))
  line('可逆性（有外部依赖）', reversibility({ rollbackMinutes: 5, externalDependents: 3, needsCoordination: false }))
  line('可逆性（需他人配合）', reversibility({ rollbackMinutes: 5, externalDependents: 0, needsCoordination: true }))

  // 可容忍缺陷率
  line('双向门可容忍缺陷率 @ c=0.1', tolerableDefectRate(1, 0.1).toFixed(2))
  line('单向门可容忍缺陷率 @ c=100', tolerableDefectRate(1, 100).toFixed(4))
  line('两者之比', (tolerableDefectRate(1, 0.1) / tolerableDefectRate(1, 100)).toFixed(0) + ' 倍')

  // 影响面
  const graph = new Map([
    ['schema', ['api', 'etl']],
    ['api', ['sdk', 'docs']],
    ['etl', ['report']],
    ['sdk', []], ['docs', []], ['report', []],
  ])
  line('影响面（改 schema）', blastRadius(['schema'], graph).join(', '))
  line('影响面（改 sdk）', blastRadius(['sdk'], graph).join(', '))

  // 债
  line('债的临界时间 @ R=60, i=2', debtBreakEven(60, 2) + ' 周')
  line('债的年利息 @ i=2', debtInterest(2, 52) + ' 小时')
  line('债的半年利息 @ i=2', debtInterest(2, 26) + ' 小时')

  // 完成判据
  const criteria = [
    { metric: 'p95Ms', threshold: 800, windowDays: 7 },
    { metric: 'failureRate', threshold: 0.01, windowDays: 7 },
  ]
  line('完成检查（达标）', JSON.stringify(checkCompletion(criteria, { p95Ms: 700, failureRate: 0.005 })))
  line('完成检查（缺指标）', JSON.stringify(checkCompletion(criteria, { p95Ms: 700 })))

  // 发布决策
  line('发布决策（1% 预算，0.5% 实际）', JSON.stringify(releaseDecision(1000, 10, 5)))
  line('发布决策（1% 预算，2% 实际）', JSON.stringify(releaseDecision(1000, 10, 20)))

  // 走查
  line('走查（缺三站）', walkthrough(['意图', '判据', '方案', '依赖序', '实现', '验证', '发布']).join(', '))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
