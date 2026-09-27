// 1.2 配备算例：耦合、圈复杂度、利息率、还债窗口、债的分类与优先级。
//
// 每个函数对应讲义 1.2 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa16_debt.mjs
import { pathToFileURL } from 'node:url'

/**
 * 定义 1.2.2 / 命题 1.2.3：扇入扇出与耦合度。扇入决定改动成本。
 * @param nodes 节点数组 @param edges `[from, to]`（from 依赖 to）
 * @returns 每项 `{ node, fanIn, fanOut, coupling }`
 */
export function coupling(nodes, edges) {
  const fanOut = new Map(nodes.map((n) => [n, 0]))
  const fanIn = new Map(nodes.map((n) => [n, 0]))
  for (const [from, to] of edges) {
    fanOut.set(from, fanOut.get(from) + 1)
    fanIn.set(to, fanIn.get(to) + 1)
  }
  return nodes.map((n) => ({
    node: n,
    fanIn: fanIn.get(n),
    fanOut: fanOut.get(n),
    coupling: fanIn.get(n) + fanOut.get(n),
  }))
}

/**
 * 按扇入降序取前几名——它们就是"改动最贵的地方"。
 * @param nodes 节点数组 @param edges 边数组 @param top 取前几项
 * @returns 排序后的项数组
 */
export function riskiest(nodes, edges, top = 5) {
  return coupling(nodes, edges).sort((a, b) => b.fanIn - a.fanIn || b.coupling - a.coupling).slice(0, top)
}

/**
 * 命题 1.2.2：圈复杂度 = 判定点数 + 1。
 * @param decisionPoints 判定点数量 @returns 圈复杂度
 */
export function cyclomatic(decisionPoints) {
  return decisionPoints + 1
}

/**
 * 圈复杂度的分档（阈值需团队内统一）。
 * @param cc 圈复杂度 @returns 'easy' | 'needs-split' | 'must-split'
 */
export function ccBand(cc) {
  if (cc <= 10) return 'easy'
  if (cc <= 20) return 'needs-split'
  return 'must-split'
}

/**
 * 定义 1.2.4：利息率 i = f · c。
 * @param touchesPerWeek 每周触及次数 @param costPerTouch 单次额外代价（小时）
 * @returns 每周利息（小时）
 */
export function interestRate(touchesPerWeek, costPerTouch) {
  return touchesPerWeek * costPerTouch
}

/**
 * 定义 1.2.6：还债窗口 t* = R / i。
 * @param refactorHours 重构成本（小时） @param touchesPerWeek 每周触及次数
 * @param costPerTouch 单次额外代价 @returns 周数
 */
export function repaymentWindow(refactorHours, touchesPerWeek, costPerTouch) {
  return refactorHours / interestRate(touchesPerWeek, costPerTouch)
}

/**
 * 命题 1.2.4 / 工具箱 5.4：封装降频——触及频率下降后还债窗口变长。
 * @param refactorHours 重构成本 @param touchesPerWeek 原触及频率 @param costPerTouch 单次代价
 * @param encapsulatedTouches 封装后的触及频率 @returns `{ before, after, extendedBy }`
 */
export function afterEncapsulation(refactorHours, touchesPerWeek, costPerTouch, encapsulatedTouches) {
  const before = repaymentWindow(refactorHours, touchesPerWeek, costPerTouch)
  const after = repaymentWindow(refactorHours, encapsulatedTouches, costPerTouch)
  return { before, after, extendedBy: after - before }
}

/**
 * 命题 1.2.6：多笔债的利息叠加，合并重构成本不叠加。
 * @param debts `[{ touchesPerWeek, costPerTouch, refactorHours }]`
 * @param mergedRefactorHours 合并重构的成本
 * @returns `{ totalInterest, sumSeparate, mergedRefactorHours, saving, window }`
 */
export function portfolio(debts, mergedRefactorHours) {
  const totalInterest = debts.reduce((s, d) => s + interestRate(d.touchesPerWeek, d.costPerTouch), 0)
  const sumSeparate = debts.reduce((s, d) => s + d.refactorHours, 0)
  return {
    totalInterest,
    sumSeparate,
    mergedRefactorHours,
    saving: sumSeparate - mergedRefactorHours,
    window: mergedRefactorHours / totalInterest,
  }
}

/**
 * 定义 1.2.5：四类债。
 * @param debt `{ intentional, robust }` @returns 分类名
 */
export function classifyDebt({ intentional, robust }) {
  if (intentional && robust) return 'deliberate-prudent'
  if (intentional && !robust) return 'deliberate-reckless'
  if (!intentional && robust) return 'inadvertent-prudent'
  return 'inadvertent-reckless'
}

/**
 * 命题 1.2.5：处置优先级。数值越大越优先。
 * 无意的债基础分更高（无人知晓），鲁莽的债加上期望崩溃损失。
 * @param debt `{ intentional, robust, collapsesUnderLoad, crashProbability, crashCost }`
 * @returns 优先级分数
 */
export function debtPriority(debt) {
  const base = debt.intentional ? 1 : 2
  const crashTerm = debt.collapsesUnderLoad ? (debt.crashProbability ?? 0) * (debt.crashCost ?? 0) : 0
  return base * 10 + crashTerm
}

/**
 * 工具箱 5.5：可达性分析 —— 从入口可达的节点集合。
 * @param entry 入口节点 @param edges `[from, to]` @returns 可达节点数组
 */
export function reachable(entry, edges) {
  const out = new Map()
  for (const [from, to] of edges) {
    if (!out.has(from)) out.set(from, [])
    out.get(from).push(to)
  }
  const seen = new Set()
  const stack = [entry]
  while (stack.length) {
    const v = stack.pop()
    if (seen.has(v)) continue
    seen.add(v)
    for (const w of out.get(v) ?? []) stack.push(w)
  }
  return [...seen]
}

/**
 * 工具箱 5.5：删除候选 —— 从入口不可达的节点。
 * @param nodes 全部节点 @param entry 入口 @param edges 边 @returns 候选节点数组
 */
export function candidatesForDeletion(nodes, entry, edges) {
  const live = new Set(reachable(entry, edges))
  return nodes.filter((n) => !live.has(n))
}

/**
 * 命题 1.2.1：重写的收益上界——不超过偶然复杂度所占比例。
 * @param totalComplexity 总复杂度 @param accidentalShare 偶然复杂度占比（0-1）
 * @returns `{ upperBound, essential }`
 */
export function rewriteUpperBound(totalComplexity, accidentalShare) {
  const accidental = totalComplexity * accidentalShare
  return { upperBound: accidental, essential: totalComplexity - accidental }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  // 耦合
  const nodes = ['ui', 'api', 'core', 'store', 'util']
  const edges = [['ui', 'api'], ['api', 'core'], ['api', 'store'], ['core', 'util'], ['store', 'util'], ['api', 'util']]
  line('扇入最高的三个模块', riskiest(nodes, edges, 3).map((x) => `${x.node}(扇入 ${x.fanIn})`).join(', '))
  line('util 的耦合度', JSON.stringify(coupling(nodes, edges).find((x) => x.node === 'util')))

  // 圈复杂度
  line('圈复杂度 @ 7 个判定点', cyclomatic(7))
  line('分档 @ cc=8', ccBand(8))
  line('分档 @ cc=15', ccBand(15))
  line('分档 @ cc=25', ccBand(25))

  // 利息与窗口
  line('利息率 @ f=4, c=0.5', interestRate(4, 0.5) + ' 小时/周')
  line('还债窗口 @ R=60, i=2', repaymentWindow(60, 4, 0.5) + ' 周')
  const enc = afterEncapsulation(60, 4, 0.5, 1)
  line('封装后窗口（f 从 4 降到 1）', enc.after + ' 周（延长 ' + enc.extendedBy + ' 周）')

  // 组合
  const pf = portfolio([
    { touchesPerWeek: 4, costPerTouch: 0.5, refactorHours: 60 },
    { touchesPerWeek: 2, costPerTouch: 1.5, refactorHours: 40 },
    { touchesPerWeek: 1, costPerTouch: 1, refactorHours: 20 },
  ], 90)
  line('三笔债的利息之和', pf.totalInterest + ' 小时/周')
  line('分别重构成本之和', pf.sumSeparate + ' 小时')
  line('合并重构成本', pf.mergedRefactorHours + ' 小时（省 ' + pf.saving + ' 小时）')
  line('合并后的还债窗口', pf.window.toFixed(1) + ' 周')

  // 分类与优先级
  line('分类（有意且鲁棒）', classifyDebt({ intentional: true, robust: true }))
  line('分类（无意且鲁棒）', classifyDebt({ intentional: false, robust: true }))
  const risky = { intentional: false, robust: false, collapsesUnderLoad: true, crashProbability: 0.05, crashCost: 40 }
  const safe = { intentional: true, robust: true, collapsesUnderLoad: false }
  line('优先级（无意且鲁莽）', debtPriority(risky).toFixed(2))
  line('优先级（有意且鲁棒）', debtPriority(safe).toFixed(2))

  // 重写上界
  const bound = rewriteUpperBound(100, 0.3)
  line('重写收益上界（偶然占 30%）', bound.upperBound + '（必要复杂度 ' + bound.essential + ' 保留）')

  // 删除候选
  line('删除候选', candidatesForDeletion(['a', 'b', 'c', 'dead1', 'dead2'], 'a', [['a', 'b'], ['b', 'c']]).join(', '))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
