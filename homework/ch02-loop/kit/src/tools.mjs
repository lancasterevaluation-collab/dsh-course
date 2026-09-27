/**
 * 2.2 构建题 · 按契约实现工具系统。
 *
 * ★ 你的依据是 ../CONTRACT-tools.md，不是这份骨架的注释。
 *   骨架只给出结构与两个讲义里给过的函数，每一处 TODO 都要你自己判断怎么写。
 *
 * 判分：node tests/t4-build.mjs
 * 参考：../grade/tools.reference.mjs（做完再看）
 */

import { resolve, sep } from 'node:path'
// ★ 参数字符串的解析必须复用模型层那一份（契约承诺 6 第 2 步、讲义 5.3 第一条）。
import { parseArguments } from './llm.mjs'

/**
 * TODO 1：写出四个副作用等级。
 *
 * 依据：契约的不变量 3。顺序有意义——从"无需撤销"到"无法撤销"。
 */
export const SIDE_EFFECTS = []

/**
 * TODO 2：取一个工具声明的副作用等级。
 *
 * 依据：契约的承诺 8 与不变量 2。
 * ★ 难点不在读字段，而在【没声明时返回什么】——讲义 3.4.1 讲的就是这个决定。
 *
 * @param {{ sideEffect?: string }} definition 工具定义
 * @returns {string} 四级之一
 */
export function resolveSideEffect(definition) {
  throw new Error('TODO 2：还没有实现 resolveSideEffect')
}

/**
 * 校验一个字段的值是否符合它的 schema。
 *
 * TODO 3：实现它。五条约束里的三条在这里：
 *   类型匹配、`enum` 取值、数组的 `items`。
 * ★ 返回字符串而不是 boolean，也不抛异常——理由见契约承诺 1。
 *
 * @param {object} prop 字段的 schema
 * @param {unknown} value 模型给的值
 * @param {string} path 报错定位
 * @returns {string} 错误信息；'' 表示通过
 */
function validateProperty(prop, value, path) {
  throw new Error('TODO 3：还没有实现 validateProperty')
}

/**
 * 递归校验参数是否符合 schema。
 *
 * TODO 4：实现它。这里要多做两件事：
 *   ★ 必填缺失（`required`）——注意报错里要有字段名；
 *   ★ 【未知字段】——schema 里没有的键要拒绝。这一条最容易被漏，
 *     因为"多一个字段"看起来无害；而讲义 3.3 说明了为什么它有害。
 *
 * @param {object} schema 参数的形状
 * @param {unknown} value 参数（已过 parseArguments）
 * @param {string} [path] 当前定位，调用方从 '' 开始
 * @returns {string} 错误信息；'' 表示通过
 */
export function validateArgs(schema, value, path = '') {
  throw new Error('TODO 4：还没有实现 validateArgs')
}

/**
 * 截断过长的文本。这一处已经给好了——它是讲义 1.6 的原文。
 *
 * 契约的承诺 2 要求它：未超限原样返回；超限时保留头【与】尾，
 * 并说明省略了多少、原文共多少。
 *
 * @param {string} text 原始文本
 * @param {number} limit 上限（字符数）
 * @returns {string} 截断后的文本
 */
export function truncate(text, limit) {
  if (text.length <= limit) return text
  const head = Math.floor(limit * 0.8)
  const tail = limit - head
  const omitted = text.length - limit
  return (
    text.slice(0, head) +
    `\n\n…（此处省略 ${omitted} 个字符，共 ${text.length} 个）\n\n` +
    text.slice(text.length - tail)
  )
}

/**
 * 把模型给的路径解析为工作目录内的绝对路径。这一处也已经给好了（讲义 1.7）。
 *
 * ★ 契约的承诺 3 要的是"最小防线"，所以它挡不住全部越界访问——
 *   真正的隔离靠第 3 卷的沙箱。而注释里那一行是这个函数唯一的难点。
 *
 * @param {string} workspace 工作目录
 * @param {string} input 模型给的路径
 * @returns {string} 绝对路径
 * @throws {Error} 解析结果落在工作目录之外时
 */
export function resolveInside(workspace, input) {
  const base = resolve(workspace)
  const target = resolve(base, input)
  // ★ 必须比较带分隔符的前缀，否则 /work-evil 会被误判为在 /work 之内。
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`路径越界：${input} 解析到 ${target}，不在工作目录内`)
  }
  return target
}

/**
 * 工具注册表。
 *
 * 契约的承诺 4 / 5 / 6 / 9 / 10 与不变量 1、4 都落在这个类里。
 */
export class ToolRegistry {
  #tools = new Map()

  /**
   * TODO 5：注册一个工具。
   *
   * 依据：契约的承诺 4。三个要点：
   *   ★ 返回的是【卸载函数】，不是一个结果码（讲义 3.4：注册是 effect）；
   *   ★ 重名要抛错——它与 run 的不抛形成刻意的对比，理由见讲义 3.4；
   *   ★ 卸载函数重复调用不该抛。
   *
   * @param {object} definition 工具定义
   * @returns {() => void} 卸载函数
   */
  register(definition) {
    throw new Error('TODO 5：还没有实现 register')
  }

  /**
   * TODO 6：给模型看的工具清单。
   *
   * 依据：契约的承诺 5 与不变量 1。
   * ★ 它要能进请求（模型读它）也要能进日志，所以【不能】含实现函数。
   *
   * @returns {readonly object[]}
   */
  list() {
    throw new Error('TODO 6：还没有实现 list')
  }

  /**
   * TODO 7：调用一个工具。五步见契约的承诺 6。
   *
   * ★ 这五步里最容易写错的是第 4 步与第 5 步的配合：
   *   实现返回失败时要【原样透传】它的 error，而透传之后仍然要过截断。
   * ★ 另一处是第 4 步要区分"返回失败"与"抛出异常"——后者要带 `internal`。
   *
   * @param {string} name 模型给出的工具名
   * @param {string} rawArguments 模型给出的原始参数字符串
   * @param {{ workspace: string, maxResultChars: number }} ctx 运行上下文
   * @returns {Promise<object>} ToolResult
   */
  async run(name, rawArguments, ctx) {
    throw new Error('TODO 7：还没有实现 run')
  }
}
