/**
 * 参考答案：工具契约 + 参数校验 + 注册表 + 结果截断 + 最小防线。
 *
 * 这份实现的每一处都对应 CONTRACT-tools.md 里的一条——注释里标出了是哪一条。
 * 它有两个用途：
 *   ① 验证判分器本身（跑它应当得满分——否则是判分器有问题）；
 *   ② 作为"合格实现长什么样"的参照。
 *
 * 验证：node tests/t4-build.mjs（默认读 kit/src/tools.mjs）
 *       IMPL=../grade/tools.reference.mjs node tests/t4-build.mjs
 */

import { resolve, sep } from 'node:path'
// ★ 复用模型层的解析器，而不是自己写一份 JSON.parse（契约承诺 6 第 2 步、讲义 5.3 第一条）。
import { parseArguments } from './llm.reference.mjs'

/** 不变量 3：四级，从 readonly（0 级）到 external（3 级）。 */
export const SIDE_EFFECTS = ['readonly', 'reversible', 'irreversible', 'external']

/**
 * 取一个工具声明的副作用等级。
 *
 * 承诺 8：纯函数。
 * 不变量 2：没声明时返回 'irreversible'——保守默认（讲义 3.4.1）。
 *   为什么不默认成 'readonly'：第 3 卷的守卫会直接放行一个可能删文件的工具，
 *   而"忘记声明"比"故意声明错"常见得多。
 *
 * @param {{ sideEffect?: string }} definition 工具定义
 * @returns {string} 四级之一
 * @throws {Error} 声明了一个不在四级里的值（误配置要早失败）
 */
export function resolveSideEffect(definition) {
  const declared = definition?.sideEffect
  if (declared === undefined) return 'irreversible' // 不变量 2
  if (!SIDE_EFFECTS.includes(declared)) throw new Error(`未知的副作用等级：${declared}`)
  return declared
}

/** 拼接报错用的字段路径。统一成 a.b[0] 一种表示法（讲义 3.3）。 */
function join(path, key) {
  return path ? `${path}.${key}` : key
}

/** 把收到的值写成一句人能读的话。 */
function describe(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return '数组'
  return typeof value
}

/**
 * 校验一个字段的值是否符合它的 schema。
 *
 * @param {object} prop 字段的 schema
 * @param {unknown} value 模型给的值
 * @param {string} path 报错定位
 * @returns {string} 错误信息；'' 表示通过
 */
function validateProperty(prop, value, path) {
  switch (prop.type) {
    case 'string':
      if (typeof value !== 'string') return `${path} 应当是字符串，收到 ${describe(value)}`
      if (prop.enum && !prop.enum.includes(value)) {
        return `${path} 只能是 ${prop.enum.join(' / ')} 之一，收到 ${JSON.stringify(value)}`
      }
      return ''
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) return `${path} 应当是数字，收到 ${describe(value)}`
      return ''
    case 'boolean':
      if (typeof value !== 'boolean') return `${path} 应当是布尔值，收到 ${describe(value)}`
      return ''
    case 'array': {
      if (!Array.isArray(value)) return `${path} 应当是数组，收到 ${describe(value)}`
      if (!prop.items) return ''
      for (const [i, item] of value.entries()) {
        const err = validateProperty(prop.items, item, `${path}[${i}]`)
        if (err) return err
      }
      return ''
    }
    case 'object':
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return `${path} 应当是一个对象，收到 ${describe(value)}`
      }
      return ''
    default:
      // 子集之外的 type 是写 schema 的人写错了，不是模型的问题——但仍然如实报出来。
      return `${path} 的 schema 用了不支持的 type：${prop.type}`
  }
}

/**
 * 递归校验参数是否符合 schema。
 *
 * 承诺 1：返回字符串（'' 表示通过），不抛异常——校验失败是可预期的失败（讲义 1.5）。
 * 承诺 8：纯函数。
 *
 * 检查五条约束：必填缺失、类型不匹配、enum、数组元素、以及未知字段。
 * ★ 未知字段也要拒绝：多出来的字段通常说明模型理解错了这个工具（讲义 3.3）。
 *
 * @param {object} schema 参数的形状
 * @param {unknown} value 参数（已过 parseArguments）
 * @param {string} [path] 当前定位，调用方从 '' 开始
 * @returns {string} 错误信息；'' 表示通过
 */
export function validateArgs(schema, value, path = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `${path || '参数'} 应当是一个对象`
  }
  const properties = schema?.properties ?? {}

  for (const key of schema?.required ?? []) {
    if (!(key in value)) return `缺少必填参数 ${join(path, key)}`
  }

  for (const key of Object.keys(value)) {
    if (!(key in properties)) return `出现未知参数 ${join(path, key)}（本工具不接收它）`
  }

  for (const [key, prop] of Object.entries(properties)) {
    if (!(key in value)) continue // 非必填且未提供：跳过
    const err = validateProperty(prop, value[key], join(path, key))
    if (err) return err
  }
  return ''
}

/**
 * 截断过长的文本。
 *
 * 承诺 2：未超限原样返回；超限时保留头【与】尾（约 80% / 20%），
 * 并在说明里写清省略了多少、原文共多少（讲义 1.6）。
 *
 * @param {string} text 原始文本
 * @param {number} limit 上限（字符数）
 * @returns {string} 截断后的文本
 */
export function truncate(text, limit) {
  const source = String(text ?? '')
  if (!Number.isFinite(limit) || limit <= 0) return source
  if (source.length <= limit) return source
  const head = Math.floor(limit * 0.8)
  const tail = limit - head
  const omitted = source.length - limit
  return (
    source.slice(0, head) +
    `\n\n…（此处省略 ${omitted} 个字符，共 ${source.length} 个）\n\n` +
    source.slice(source.length - tail)
  )
}

/**
 * 把模型给的路径解析为工作目录内的绝对路径。
 *
 * 承诺 3：这是【最小防线】，不是沙箱（讲义 1.7、契约"不承诺 2"）。
 *
 * @param {string} workspace 工作目录
 * @param {string} input 模型给的路径
 * @returns {string} 绝对路径
 * @throws {Error} 解析结果落在工作目录之外时
 */
export function resolveInside(workspace, input) {
  const base = resolve(workspace)
  const target = resolve(base, String(input ?? ''))
  // ★ 必须比较带分隔符的前缀，否则 /work-evil 会被误判为在 /work 之内（讲义 1.7）。
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`路径越界：${input} 解析到 ${target}，不在工作目录内`)
  }
  return target
}

/**
 * 工具注册表：工具名到工具定义的映射，同时是调用工具的唯一入口。
 *
 * 承诺 4 / 5 / 6 / 9 / 10 与不变量 1、4 都落在这个类里。
 */
export class ToolRegistry {
  #tools = new Map()

  /**
   * 注册一个工具。
   *
   * 承诺 4：返回卸载函数；重名抛错（编程错误要早失败）；卸载函数可重复调用。
   *
   * @param {object} definition 工具定义
   * @returns {() => void} 卸载函数
   * @throws {Error} 名字与已注册的工具重复时
   */
  register(definition) {
    if (this.#tools.has(definition.name)) {
      throw new Error(`工具名重复：${definition.name}`)
    }
    this.#tools.set(definition.name, definition)
    let done = false
    return () => {
      // 承诺 4：重复调用不抛，也不做第二次删除。
      if (done) return
      done = true
      this.#tools.delete(definition.name)
    }
  }

  /**
   * 给模型看的工具清单。
   *
   * 承诺 5：不含实现（run），且每一项都能被 JSON 往返——
   * 因为它要进请求（模型读它）也要进日志（2.7 的"模型可见 ⟺ 可重建"）。
   *
   * @returns {readonly { name: string, description: string, parameters: object }[]}
   */
  list() {
    return [...this.#tools.values()].map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }))
  }

  /**
   * 调用一个工具。五步见契约承诺 6。
   *
   * 承诺 10 / 不变量 4：对模型的任何输入都不抛异常。
   * 承诺 9：不改变工具集。
   *
   * @param {string} name 模型给出的工具名
   * @param {string} rawArguments 模型给出的原始参数字符串
   * @param {{ workspace: string, maxResultChars: number }} ctx 运行上下文
   * @returns {Promise<object>} ToolResult
   */
  async run(name, rawArguments, ctx) {
    const definition = this.#tools.get(name)
    // ① 未注册的工具名：模型"猜"一个工具名是可预期的事（L2 第 12 条）。
    if (!definition) {
      const available = [...this.#tools.keys()]
      return {
        ok: false,
        error: `没有名为 ${name} 的工具。可用的工具：${available.length ? available.join('、') : '（当前没有注册任何工具）'}`,
      }
    }

    // ② 解析：复用模型层，因为"合法 JSON 但不是对象"那一情形只有它处理过（讲义 5.3）。
    let args
    try {
      args = parseArguments(rawArguments, name)
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) }
    }

    // ③ 校验：错误信息要能定位到字段（承诺 6 第 3 步）。
    const invalid = validateArgs(definition.parameters, args)
    if (invalid) return { ok: false, error: `${name} 的参数不合法：${invalid}` }

    // ④ 执行：实现内部的异常在这里被接住并标注（承诺 7、讲义 3.2）。
    let result
    try {
      result = await definition.run(args, ctx)
    } catch (err) {
      return {
        ok: false,
        error: `${name} 的实现抛出了异常：${err?.message ?? err}`,
        internal: true,
      }
    }

    // ⑤ 出口统一截断：成功与失败都要过这一道（不变量 1）。
    const limit = ctx?.maxResultChars ?? 20000
    if (result?.ok) return { ok: true, content: truncate(result.content, limit) }
    return {
      ok: false,
      error: truncate(result?.error ?? '工具没有给出失败原因', limit),
      ...(result?.internal ? { internal: true } : {}),
    }
  }
}
