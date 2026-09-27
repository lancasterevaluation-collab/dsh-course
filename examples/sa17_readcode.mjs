// 1.3 配备算例：不稳定性、稳定依赖检查、热点、隐藏度、波及面。
//
// 每个函数对应讲义 1.3 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa17_readcode.mjs
import { pathToFileURL } from 'node:url'

/** 模块卡片的六项字段（工具箱 5.5）。 */
export const MODULE_CARD_FIELDS = ['职责', '对外暴露', '依赖', '被依赖', '约束清单', '已知债']

/**
 * 定义 1.3.4：不稳定性 I = out / (in + out)。
 * @param nodes 节点数组 @param edges `[from, to]`（from 依赖 to）
 * @returns `Map<node, number>`
 */
export function instability(nodes, edges) {
  const fanOut = new Map(nodes.map((n) => [n, 0]))
  const fanIn = new Map(nodes.map((n) => [n, 0]))
  for (const [from, to] of edges) {
    fanOut.set(from, fanOut.get(from) + 1)
    fanIn.set(to, fanIn.get(to) + 1)
  }
  return new Map(nodes.map((n) => {
    const i = fanIn.get(n)
    const o = fanOut.get(n)
    return [n, i + o === 0 ? 0 : o / (i + o)]
  }))
}

/**
 * 命题 1.3.2：稳定依赖检查——依赖不应指向更不稳定的方向（I(from) < I(to) 即逆流）。
 * @param nodes 节点数组 @param edges 边数组 @returns 逆流边数组
 */
export function dependencyViolations(nodes, edges) {
  const I = instability(nodes, edges)
  return edges
    .filter(([from, to]) => I.get(from) < I.get(to))
    .map(([from, to]) => ({ from, to, iFrom: I.get(from), iTo: I.get(to) }))
}

/**
 * 命题 1.3.3：热点 H = 变更频率 × 圈复杂度。
 * @param modules `[{ id, changesPerMonth, complexity }]` @returns 按 H 降序的新数组
 */
export function hotspot(modules) {
  return modules
    .map((m) => ({ ...m, H: m.changesPerMonth * m.complexity }))
    .sort((a, b) => b.H - a.H)
}

/**
 * 对照组：按复杂度排序。与热点排序不同。
 * @param modules 模块数组 @returns 按复杂度降序的新数组
 */
export function byComplexity(modules) {
  return [...modules].sort((a, b) => b.complexity - a.complexity)
}

/**
 * 定义 1.3.6：隐藏度 = 1 - 暴露面 / 功能量。负值表示暴露多于职责。
 * @param exposedMembers 对外可见的成员数 @param responsibilities 实现的职责数
 * @returns 隐藏度
 */
export function hiddenness(exposedMembers, responsibilities) {
  if (responsibilities === 0) return exposedMembers === 0 ? 0 : Number.NEGATIVE_INFINITY
  return 1 - exposedMembers / responsibilities
}

/**
 * 工具箱 5.4：波及面——从被改模块出发的正向可达。
 * @param module 被改模块 @param graph `Map<node, node[]>`（值是依赖该节点的模块）
 * @returns 受影响的模块数组
 */
export function impact(module, graph) {
  const seen = new Set([module])
  const stack = [module]
  while (stack.length) {
    const v = stack.pop()
    for (const w of graph.get(v) ?? []) {
      if (!seen.has(w)) { seen.add(w); stack.push(w) }
    }
  }
  return [...seen]
}

/**
 * 波及面里带测试的比例——决定验证成本。
 * @param modules 受影响模块 @param tested 有测试的模块集合 @returns 比例
 */
export function verifiedShare(modules, tested) {
  if (modules.length === 0) return 1
  return modules.filter((m) => tested.has(m)).length / modules.length
}

/**
 * 命题 1.3.1：目的句校验——读之前必须能写出目的。
 * @param goal 目的句 @returns `{ ok, reason? }`
 */
export function checkGoal(goal) {
  if (typeof goal !== 'string' || goal.trim().length < 4) return { ok: false, reason: '目的句过短或缺失' }
  if (/^(读代码|看懂|了解一下|熟悉一下)/.test(goal.trim())) return { ok: false, reason: '这不是目的句，是动作描述' }
  if (!/？|\?|吗|什么|哪|是否/.test(goal)) return { ok: false, reason: '目的句应当是问句形式' }
  return { ok: true }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  const nodes = ['core', 'api', 'ui', 'util', 'dead']
  const edges = [['ui', 'api'], ['api', 'core'], ['core', 'util']]
  const I = instability(nodes, edges)
  line('不稳定性（core）', I.get('core').toFixed(2))
  line('不稳定性（ui）', I.get('ui').toFixed(2))
  line('不稳定性（util）', I.get('util').toFixed(2))
  line('不稳定性（dead）', I.get('dead').toFixed(2))

  const vs = dependencyViolations(nodes, edges)
  line('逆流边数', vs.length + (vs.length ? '（' + vs.map((v) => `${v.from}→${v.to}`).join(', ') + '）' : ''))

  const modules = [
    { id: 'compressor', changesPerMonth: 4, complexity: 25 },
    { id: 'codec', changesPerMonth: 0.2, complexity: 45 },
    { id: 'router', changesPerMonth: 2, complexity: 12 },
  ]
  const hot = hotspot(modules)
  line('热点排序', hot.map((m) => `${m.id}(${m.H})`).join(' > '))
  line('复杂度排序', byComplexity(modules).map((m) => `${m.id}(${m.complexity})`).join(' > '))
  line('热点倍数（compressor / codec）', (hot[0].H / modules[1].changesPerMonth / modules[1].complexity).toFixed(1))

  line('隐藏度（暴露 12、职责 6）', hiddenness(12, 6).toFixed(0))
  line('隐藏度（暴露 3、职责 6）', hiddenness(3, 6).toFixed(2))

  const graph = new Map([['core', ['api']], ['api', ['ui']], ['ui', []]])
  line('波及面（改 core）', impact('core', graph).join(', '))
  line('波及面带测试比例', verifiedShare(impact('core', graph), new Set(['core', 'api'])).toFixed(2))

  line('目的句校验（"这个改动会不会影响缓存？"）', JSON.stringify(checkGoal('这个改动会不会影响缓存？')))
  line('目的句校验（"读代码"）', JSON.stringify(checkGoal('读代码')))

  line('模块卡片字段', MODULE_CARD_FIELDS.join('、'))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
