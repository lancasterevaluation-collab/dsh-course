// 2.2 工具系统与副作用分级的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArguments } from './sa25_llm.mjs'

/** 定义 2.2.1：本系统允许的 schema 能力白名单（完整 JSON Schema 之外的一律禁止）。 */
export const SCHEMA_CAPABILITIES = ['type', 'required', 'properties', 'enum', 'items']

/** 定义 2.2.3：副作用四级，按「撤销它要付出什么」划分。 */
export const SIDE_EFFECTS = ['readonly', 'reversible', 'irreversible', 'external']

/**
 * 定义 2.2.3：取副作用等级的序号。
 *
 * 未声明时返回最高一级——忘记声明比声明错误常见，缺省必须偏向安全一侧。
 * @param name 工具名（仅用于诊断）
 * @param declared 声明的等级
 * @returns 0–3
 */
export function sideEffectLevel(name, declared) {
  if (!declared) return 3
  const i = SIDE_EFFECTS.indexOf(declared)
  return i < 0 ? 3 : i
}

/**
 * 定义 2.2.5：截断的保留计划，头 80% 加尾 20%。
 * @param limit 上限（字符数）
 * @returns `{ head, tail }`
 */
export function truncatePlan(limit) {
  const head = Math.floor(limit * 0.8)
  return { head, tail: limit - head }
}

/**
 * 定义 2.2.5：截断过长文本，保留头尾并报告丢失量与原文总量。
 * @param text 原始文本
 * @param limit 上限（字符数）
 * @returns 截断后的文本；未超限时原样返回
 */
export function truncate(text, limit) {
  if (text.length <= limit) return text
  const { head, tail } = truncatePlan(limit)
  const omitted = text.length - limit
  return (
    text.slice(0, head) +
    `\n\n…（此处省略 ${omitted} 个字符，共 ${text.length} 个）\n\n` +
    text.slice(text.length - tail)
  )
}

/**
 * 定义 2.2.1：按 schema 校验单个属性。
 * @param prop 属性 schema
 * @param value 模型给的值
 * @param path 当前位置（用于报错定位）
 * @returns 错误信息；'' 表示通过
 */
export function validateProp(prop, value, path) {
  if (prop.type === 'array') {
    if (!Array.isArray(value)) return `${path} 应当是数组`
    for (const [i, item] of value.entries()) {
      if (prop.items) {
        const why = validateProp(prop.items, item, `${path}[${i}]`)
        if (why) return why
      }
    }
  } else if (prop.type === 'string') {
    if (typeof value !== 'string') return `${path} 应当是字符串`
  } else if (prop.type === 'number') {
    if (typeof value !== 'number') return `${path} 应当是数字`
  } else if (prop.type === 'boolean') {
    if (typeof value !== 'boolean') return `${path} 应当是布尔值`
  }
  if (prop.enum && !prop.enum.includes(value)) {
    return `${path} 只能是 ${prop.enum.join(' / ')} 之一，收到 ${String(value)}`
  }
  return ''
}

/**
 * 定义 2.2.1：递归校验参数，未知字段一律拒绝。
 * @param schema 参数 schema
 * @param value 模型给的参数对象
 * @param path 当前位置，调用方从 '' 开始
 * @returns 错误信息；'' 表示通过
 */
export function validateArgs(schema, value, path = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `${path || '参数'} 应当是一个对象`
  }
  for (const key of schema.required ?? []) {
    if (!(key in value)) return `缺少必填参数 ${path ? `${path}.` : ''}${key}`
  }
  const properties = schema.properties ?? {}
  for (const [key, prop] of Object.entries(properties)) {
    if (!(key in value)) continue
    const here = path ? `${path}.${key}` : key
    const why = validateProp(prop, value[key], here)
    if (why) return why
  }
  const extra = Object.keys(value).filter((k) => !(k in properties))
  if (extra.length) return `不认识的参数 ${extra.join(' / ')}`
  return ''
}

/**
 * 命题 2.2.4 的反面：只比较裸字符串前缀。
 * 它放过 /work-evil/x 这一类兄弟目录，因此是一个真实缺陷。
 * @param workspace 工作目录
 * @param target 待检查的路径
 * @returns `{ resolved, passes }`
 */
export function naivePrefixCheck(workspace, target) {
  const base = posix.resolve(workspace)
  const resolved = posix.resolve(base, target)
  return { resolved, passes: resolved.startsWith(base) }
}

/**
 * 定义 2.2.6 / 命题 2.2.4：比较带分隔符的前缀。
 * @param workspace 工作目录
 * @param target 待检查的路径
 * @returns `{ resolved, passes }`
 */
export function guardedPrefixCheck(workspace, target) {
  const base = posix.resolve(workspace)
  const resolved = posix.resolve(base, target)
  const inside = resolved === base || resolved.startsWith(base + '/')
  return { resolved, passes: inside }
}

/**
 * 定义 2.2.6：解析模型给的路径，越界即拒绝。
 * @param workspace 工作目录
 * @param input 模型给的路径
 * @returns 解析后的绝对路径
 * @throws 当解析结果落在工作目录之外时
 */
export function resolveInside(workspace, input) {
  const { resolved, passes } = guardedPrefixCheck(workspace, input)
  if (!passes) throw new Error(`路径越界：${input} 解析到 ${resolved}，不在工作目录内`)
  return resolved
}

/**
 * 命题 2.2.1：agent 能产生的效果集合的上界。
 * @param toolEffects 每个工具的效果列表
 * @returns `{ reachable, count }`
 */
export function capabilityUpperBound(toolEffects) {
  const reachable = [...new Set(toolEffects.flat())].sort()
  return { reachable, count: reachable.length }
}

/**
 * 命题 2.2.1：期望效果中无法被达到的部分。
 * @param toolEffects 每个工具的效果列表
 * @param desired 期望的效果列表
 * @returns 缺失的效果
 */
export function capabilityGap(toolEffects, desired) {
  const reachable = new Set(toolEffects.flat())
  return desired.filter((e) => !reachable.has(e))
}

/**
 * 定义 2.2.1 / 命题 2.2.6：工具注册表——注册、列出、调用。
 *
 * `register` 对编程错误抛错（重名），`run` 对模型输入永不抛错。
 */
export class ToolRegistry {
  #tools = new Map()

  /**
   * 注册一个工具。
   * @param def 工具定义
   * @returns 卸载函数
   * @throws 当名字与已注册的工具重名时
   */
  register(def) {
    if (this.#tools.has(def.name)) throw new Error(`工具名重复：${def.name}`)
    this.#tools.set(def.name, def)
    return () => { this.#tools.delete(def.name) }
  }

  /**
   * 给模型看的工具清单。返回的对象不含实现，因为要进请求与日志。
   * @returns `{ name, description, parameters }[]`
   */
  list() {
    return [...this.#tools.values()].map(({ name, description, parameters }) => ({
      name, description, parameters,
    }))
  }

  /**
   * 调用一个工具。解析、校验、执行、标注、截断五步都在这里。
   * @param name 模型给出的工具名
   * @param rawArguments 模型给出的原始参数字符串
   * @param ctx 运行上下文（`workspace` 与 `maxResultChars`）
   * @returns 结果对象；对模型的任何输入都不抛异常
   */
  async run(name, rawArguments, ctx) {
    const def = this.#tools.get(name)
    if (!def) return { ok: false, error: `没有名为 ${name} 的工具。可用的工具见工具清单。` }

    let args
    try {
      args = parseArguments(rawArguments, name)
    } catch (err) {
      return { ok: false, error: err.message }
    }

    const bad = validateArgs(def.parameters, args)
    if (bad) return { ok: false, error: `${name} 的参数不合法：${bad}` }

    let result
    try {
      result = await def.run(args, ctx)
    } catch (err) {
      return { ok: false, error: `${name} 的实现抛出了异常：${err?.message ?? err}`, internal: true }
    }

    return result.ok
      ? { ok: true, content: truncate(result.content, ctx.maxResultChars) }
      : {
        ok: false,
        error: truncate(result.error, ctx.maxResultChars),
        ...(result.internal ? { internal: true } : {}),
      }
  }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export async function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('2.2 工具系统与副作用分级 · 算例（SA-26）')
  rows.push('')

  rows.push('[1] 契约与缺省')
  line('schema 能力数量', `${SCHEMA_CAPABILITIES.length}（${SCHEMA_CAPABILITIES.join(', ')}）`)
  line('副作用等级数量', SIDE_EFFECTS.length)
  line('未声明等级时的取值', `${sideEffectLevel('x', undefined)}（${SIDE_EFFECTS[3]}，保守）`)
  line('非法等级名的取值', `${sideEffectLevel('x', 'harmless')}（保守）`)
  line('声明为 reversible 的取值', sideEffectLevel('write_file', 'reversible'))
  rows.push('')

  rows.push('[2] 截断')
  const plan = truncatePlan(1000)
  line('上限 1000 的保留', `${plan.head} + ${plan.tail}`)
  const long = 'x'.repeat(2500)
  const cut = truncate(long, 1000)
  line('丢失量 / 原文总量', `${long.length - 1000} / ${long.length}`)
  line('截断后含丢失说明', cut.includes('省略 1500 个字符'))
  line('截断后含总量', cut.includes('共 2500 个'))
  line('未超限时原样返回', truncate('abc', 1000) === 'abc')
  rows.push('')

  rows.push('[3] 路径防线')
  const naive = naivePrefixCheck('/work', '../work-evil/x')
  line('裸前缀比较 /work-evil/x', `${naive.passes ? '通过（缺陷）' : '拒绝'}`)
  const guarded = guardedPrefixCheck('/work', '../work-evil/x')
  line('带分隔符比较 /work-evil/x', `${guarded.passes ? '通过' : '拒绝'}`)
  line('带分隔符比较 src/a.md', `${guardedPrefixCheck('/work', 'src/a.md').passes ? '通过' : '拒绝'}`)
  let threw = false
  try { resolveInside('/work', '../../etc/passwd') } catch { threw = true }
  line('越界路径抛错', threw)
  rows.push('')

  rows.push('[4] 注册表五步')
  const registry = new ToolRegistry()
  const unregister = registry.register({
    name: 'echo',
    description: '把 text 原样返回，不产生任何副作用。',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: '要回显的文本' } },
      required: ['text'],
    },
    run: ({ text }) => ({ ok: true, content: text }),
  })
  const ctx = { workspace: '/work', maxResultChars: 64 }
  line('未注册的工具名', (await registry.run('nope', '{}', ctx)).ok)
  line('参数不是合法 JSON', (await registry.run('echo', '{"text":', ctx)).ok)
  line('参数缺必填字段', (await registry.run('echo', '{}', ctx)).error)
  line('参数多出未知字段', (await registry.run('echo', '{"text":"a","x":1}', ctx)).error)
  line('参数类型不符', (await registry.run('echo', '{"text":1}', ctx)).error)
  const boom = new ToolRegistry()
  boom.register({ name: 'boom', description: '抛异常。', parameters: { type: 'object', properties: {} }, run: () => { throw new Error('内部缺陷') } })
  const boomResult = await boom.run('boom', '{}', ctx)
  line('实现抛异常', `ok=${boomResult.ok} internal=${boomResult.internal === true}`)
  const big = await registry.run('echo', JSON.stringify({ text: 'y'.repeat(200) }), ctx)
  line('超长结果', `ok=${big.ok} 已截断=${big.content.length > 64}`)
  line('list() 的字段', Object.keys(registry.list()[0]).join(', '))
  unregister()
  line('卸载后工具数', registry.list().length)
  rows.push('')

  rows.push('[5] 能力上界')
  const effects = [['read_file', 'list_dir'], ['write_file']]
  line('可达效果', `${capabilityUpperBound(effects).count} 项（${capabilityUpperBound(effects).reachable.join(', ')}）`)
  line('相对于期望的缺口', capabilityGap(effects, ['read_file', 'list_dir', 'write_file', 'web_search']).join(', ') || '无')

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
