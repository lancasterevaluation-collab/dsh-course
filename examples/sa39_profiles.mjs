// 5.1 模式与预设的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/**
 * 定义 5.1.3：判断是否是普通对象（数组与 null 都不算）。
 * @param x 待判断的值
 * @returns 是否是普通对象
 */
export function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

/**
 * 定义 5.1.3：四层覆盖、对象深合并、数组整体替换、记录来源。
 * @param layers 从低到高的层数组（`{ name, values }`）
 * @returns `{ values, origin }`
 */
export function compose(layers) {
  const values = {}
  const origin = {}
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer.values)) {
      const prev = values[k]
      values[k] = isPlainObject(prev) && isPlainObject(v) ? { ...prev, ...v } : v
      origin[k] = layer.name
    }
  }
  return { values, origin }
}

/**
 * 定义 5.1.4：必填项检查——缺失即启动失败。
 * @param keys 必填键
 * @param composed 组合结果
 * @returns 无
 * @throws 缺任一必填项时
 */
export function requirePresent(keys, composed) {
  const missing = keys.filter((k) => !(k in composed.values))
  if (missing.length) throw new Error(`缺少必填配置：${missing.join('、')}`)
}

/**
 * 定义 5.1.5：广度优先展开间接依赖。
 * @param profile 形如 `{ plugins }` 的模式
 * @param registry 形如 `{ provides, dependencies }` 的注册表
 * @returns 能力集合
 */
export function expandCapabilities(profile, registry) {
  const out = new Set()
  const queue = [...profile.plugins]
  const seen = new Set()
  while (queue.length) {
    const name = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    for (const cap of registry.provides(name) ?? []) out.add(cap)
    for (const dep of registry.dependencies(name) ?? []) queue.push(dep)
  }
  return out
}

/**
 * 定义 5.1.5：校验的前两层。
 * @param profile 模式
 * @param registry 形如 `{ has, provides, dependencies, providerOf }`
 * @param maxCapabilities 能力集上限
 * @returns `{ ok, issues, capabilities }`
 */
export function validate(profile, registry, maxCapabilities = Infinity) {
  const issues = []
  for (const p of profile.plugins) {
    if (!registry.has(p)) issues.push({ level: 'error', what: `插件不存在：${p}` })
  }
  const capabilities = expandCapabilities(profile, registry)
  for (const need of profile.requires ?? []) {
    if (!capabilities.has(need)) {
      const owner = registry.providerOf(need)
      issues.push({ level: 'error', what: `缺少必需能力：${need}`, hint: owner ? `可能由插件 ${owner} 提供` : null })
    }
  }
  if (capabilities.size > maxCapabilities) issues.push({ level: 'error', what: `能力集超过上限：${capabilities.size}` })
  return { ok: issues.every((i) => i.level !== 'error'), issues, capabilities }
}

/**
 * 定义 5.1.6：残留核对——期望存活之外的都算残留。
 * @param old 旧作用域
 * @param ctx 形如 `{ listRegistrations }`
 * @returns 残留描述数组
 */
export function detectResidual(old, ctx) {
  return ctx.listRegistrations()
    .filter((r) => r.scope === old.id && !r.expectedAfterDispose)
    .map((r) => `${r.what}（来自 ${r.plugin}）`)
}

/**
 * 定义 5.1.6：切换的三步——先校验、整体构造、核对残留。
 * @param next 新模式
 * @param ctx 运行环境
 * @returns `{ profile, capabilities, residual }`
 * @throws 校验失败时
 */
export async function switchProfile(next, ctx) {
  const validation = validate(next, ctx.registry, ctx.maxCapabilities)
  if (!validation.ok) throw new Error(`模式校验失败：${validation.issues.map((i) => i.what).join('、')}`)
  const old = ctx.current
  const fresh = await ctx.compose(next)
  await ctx.activate(fresh)
  const residual = detectResidual(old, ctx)
  await ctx.dispose(old)
  return { profile: next.name, capabilities: validation.capabilities.size, residual }
}

/** 算例用的注册表。 */
export const REGISTRY = {
  has: (p) => ['a-plugin', 'b-plugin', 'c-plugin'].includes(p),
  provides: (p) => ({ 'a-plugin': ['tool/read'], 'b-plugin': ['tool/write'], 'c-plugin': ['llm/chat'] }[p] ?? []),
  dependencies: (p) => ({ 'a-plugin': ['b-plugin'], 'b-plugin': ['c-plugin'], 'c-plugin': [] }[p] ?? []),
  providerOf: (cap) => ({ 'llm/chat': 'c-plugin', 'vector/search': 'v-plugin' }[cap] ?? null),
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export async function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('5.1 模式与预设 · 算例（SA-39）')
  rows.push('')

  rows.push('[1] 四层覆盖')
  const layers = [
    { name: '内建默认', values: { concurrency: 4, timeoutMs: 30000, retry: { max: 3, backoffMs: 500 } } },
    { name: '用户级', values: { concurrency: 8 } },
    { name: '项目级', values: { timeoutMs: 60000, retry: { max: 5 } } },
    { name: '运行参数', values: {} },
  ]
  const { values, origin } = compose(layers)
  line('有效配置的并发数', values.concurrency)
  line('并发的来源层', origin.concurrency)
  line('有效配置的超时', values.timeoutMs)
  line('超时的来源层', origin.timeoutMs)
  line('对象深合并后保留的键数', Object.keys(values.retry).length)
  line('深层键的来源层', origin.retry)
  line('来源追踪是否覆盖全部键', Object.keys(values).every((k) => k in origin))
  line('来源表的键数', Object.keys(origin).length)
  rows.push('')

  rows.push('[2] 合并规则')
  const objMerge = compose([{ name: 'A', values: { o: { x: 1 } } }, { name: 'B', values: { o: { y: 2 } } }])
  line('对象深合并后保留的键数', Object.keys(objMerge.values.o).length)
  const arr = compose([{ name: 'A', values: { list: ['x', 'y'] } }, { name: 'B', values: { list: ['x'] } }])
  line('数组整体替换后的长度', arr.values.list.length)
  line('数组替换后不含下层删除的元素', !arr.values.list.includes('y'))
  line('数组的来源层', arr.origin.list)
  rows.push('')

  rows.push('[3] 必填项与校验')
  let threw = false
  try { requirePresent(['concurrency', 'timeoutMs', 'modelId'], { values }) } catch { threw = true }
  line('缺必填项时是否抛错', threw)
  let msg = ''
  try { requirePresent(['modelId'], { values }) } catch (e) { msg = e.message }
  line('错误信息含缺失的键名', msg.includes('modelId'))

  const profile = { name: 'dev', plugins: ['a-plugin'], requires: ['llm/chat'], presets: [{ name: 'coding' }] }
  const ok = validate(profile, REGISTRY, 10)
  line('能力集大小', ok.capabilities.size)
  line('能力集含间接依赖提供的能力', ok.capabilities.has('llm/chat'))
  line('合法模式是否通过', ok.ok)

  const missing = validate({ ...profile, requires: ['vector/search'] }, REGISTRY, 10)
  line('缺少必需能力时是否报错', !missing.ok)
  line('提示里是否给出可能提供的插件', missing.issues[0].hint.includes('v-plugin'))

  const noPlugin = validate({ ...profile, plugins: ['nope'] }, REGISTRY, 10)
  line('插件不存在时是否报错', !noPlugin.ok)

  const overLimit = validate(profile, REGISTRY, 2)
  line('能力集超上限时是否报错', !overLimit.ok)
  line('超上限的错误信息', overLimit.issues[0].what)
  rows.push('')

  rows.push('[4] 切换')
  const ctx = {
    registry: REGISTRY,
    maxCapabilities: 10,
    current: { id: 'old' },
    composed: null,
    activated: false,
    disposed: false,
    async compose(next) { this.composed = next.name; return { id: 'new', profile: next.name } },
    async activate() { this.activated = true },
    async dispose() { this.disposed = true },
    listRegistrations: () => [
      { scope: 'old', what: 'tool/read', plugin: 'a-plugin', expectedAfterDispose: false },
      { scope: 'old', what: 'logger', plugin: 'log-plugin', expectedAfterDispose: true },
      { scope: 'new', what: 'tool/write', plugin: 'b-plugin', expectedAfterDispose: false },
    ],
  }
  const report = await switchProfile(profile, ctx)
  line('切换报告的残留条数', report.residual.length)
  line('残留的内容', report.residual[0])
  line('期望存活的注册不计入残留', !report.residual.some((r) => r.includes('logger')))
  line('切换报告的能力集大小', report.capabilities)
  line('切换后是否已激活新作用域', ctx.activated)

  const badCtx = { ...ctx, activated: false, composed: null }
  let badThrew = false
  try { await switchProfile({ ...profile, requires: ['vector/search'] }, badCtx) } catch { badThrew = true }
  line('切换前校验失败时是否抛错', badThrew)
  line('校验失败时旧模式是否仍生效', badCtx.activated === false)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
