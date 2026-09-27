// 2.6 装配与配置组合的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/** 定义 2.6.2：四层配置来源，优先级从高到低。 */
export const SOURCES = ['cli', 'env', 'manifest', 'default']

/**
 * 定义 2.6.3：唯一的合并实现——对象深合并，数组与标量由上层覆盖，且不修改入参。
 * @param base 下层配置
 * @param over 上层配置
 * @returns 合并结果（新对象）
 */
export function merge(base, over) {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return over
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return over
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = merge(out[k], v)
  return out
}

/**
 * 反例：就地修改下层对象。
 * @param base 下层配置（会被修改）
 * @param over 上层配置
 * @returns 被修改后的 base
 */
export function mergeMutating(base, over) {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return over
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return over
  for (const [k, v] of Object.entries(over)) base[k] = mergeMutating(base[k], v)
  return base
}

/**
 * 定义 2.6.2：按优先级解析一个键。
 *
 * 各层之间也做深合并（从低到高叠加），来源记录为**提供该键的最高优先级层**。
 * 「提供了 undefined」视为未提供。
 * @param key 配置键
 * @param inputs 四层输入
 * @returns `{ value, source }`，都没有时为 `{ value: undefined, source: null }`
 */
export function resolve(key, inputs) {
  let value
  let source = null
  for (const s of [...SOURCES].reverse()) {
    const v = (inputs[s] ?? {})[key]
    if (v !== undefined) {
      value = merge(value, v)
      source = s
    }
  }
  return { value, source }
}

/**
 * 定义 2.6.1 / 2.6.5：装配是纯函数，时间与随机种子由 inputs 显式传入。
 * @param manifest 清单
 * @param inputs `{ profile, now, seed, cli, env }`
 * @returns `{ plugins, resolved, stamp, seed }`
 */
export function compose(manifest, inputs) {
  const profile = manifest.profiles[inputs.profile]
  if (!profile) throw new Error(`未知 profile：${inputs.profile}`)
  const plugins = [...new Set(profile.bundles.flatMap((b) => manifest.bundles[b] ?? []))]
  const merged = merge(manifest.defaults ?? {}, profile.config ?? {})
  const resolved = Object.fromEntries(
    Object.keys(merged).map((k) => [k, resolve(k, { ...inputs, manifest: merged })]),
  )
  return { plugins, resolved, stamp: inputs.now, seed: inputs.seed }
}

/**
 * 命题 2.6.6：结构错误成批报告。
 * @param manifest 清单
 * @param registry 已注册的部件名
 * @returns 问题清单
 */
export function validate(manifest, registry) {
  const problems = []
  for (const [name, profile] of Object.entries(manifest.profiles)) {
    for (const bundle of profile.bundles) {
      if (!(bundle in manifest.bundles)) problems.push(`profile ${name} 引用了不存在的 bundle ${bundle}`)
    }
    for (const plugin of new Set(profile.bundles.flatMap((b) => manifest.bundles[b] ?? []))) {
      if (!registry.includes(plugin)) problems.push(`profile ${name} 的部件 ${plugin} 未注册`)
    }
    for (const key of profile.required ?? []) {
      if (!(key in (profile.config ?? {}))) problems.push(`profile ${name} 缺少必需配置 ${key}`)
    }
  }
  return problems
}

/**
 * 命题 2.6.5：条件键取值域大小给定时，可能的组成数。
 * @param ranges 每个条件键的取值个数
 * @returns 组成数
 */
export function compositionCount(ranges) {
  return ranges.reduce((acc, n) => acc * n, 1)
}

/** 算例用的清单。 */
export const MANIFEST = {
  bundles: { core: ['llm', 'tools'], web: ['http'] },
  profiles: {
    dev: {
      bundles: ['core'],
      config: { llm: { name: 'dev-model', timeoutMs: 10000 }, tools: { maxResultChars: 2000 } },
      required: ['llm'],
    },
    prod: {
      bundles: ['core', 'web'],
      config: { llm: { name: 'prod-model' } },
      required: ['llm'],
    },
  },
  defaults: {
    llm: { name: 'default-model', timeoutMs: 30000, retry: { max: 3 } },
    tools: { maxResultChars: 1000 },
  },
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('2.6 装配与配置组合 · 算例（SA-30）')
  rows.push('')

  rows.push('[1] 覆盖语义')
  const base = { name: 'a', timeoutMs: 30000, retry: { max: 3 } }
  const over = { timeoutMs: 60000 }
  const merged = merge(base, over)
  line('深合并后的字段数', Object.keys(merged).length)
  line('替换后的字段数', Object.keys(over).length)
  line('深合并保留了下层字段', merged.name === 'a' && merged.retry.max === 3)
  line('深合并成的时间覆盖下层', merged.timeoutMs === 60000)

  const arrBase = { tools: ['read', 'write'], nested: { a: 1 } }
  const arrOver = { tools: ['read'] }
  const arrMerged = merge(arrBase, arrOver)
  line('数组被整体替换', JSON.stringify(arrMerged.tools))
  line('数组替换后的长度', arrMerged.tools.length)

  const before = JSON.stringify(base)
  merge(base, over)
  line('合并是否修改入参', before !== JSON.stringify(base))

  const mutBase = { nested: { a: 1 } }
  mergeMutating(mutBase, { nested: { a: 2 } })
  line('反例：就地修改后的入参', JSON.stringify(mutBase))
  rows.push('')

  rows.push('[2] 结合律与交换律')
  const a = { x: 1, y: { p: 1, q: 1 } }
  const b = { y: { q: 2 }, z: 3 }
  const c = { y: { p: 9 } }
  line('(a⊕b)⊕c 与 a⊕(b⊕c) 相同', JSON.stringify(merge(merge(a, b), c)) === JSON.stringify(merge(a, merge(b, c))))
  line('a⊕b 与 b⊕a 相同', JSON.stringify(merge(a, b)) === JSON.stringify(merge(b, a)))
  line('a⊕b 的结果', JSON.stringify(merge(a, b)))
  line('b⊕a 的结果', JSON.stringify(merge(b, a)))
  line('以空对象为单位元', JSON.stringify(merge(a, {})) === JSON.stringify(a))
  rows.push('')

  rows.push('[3] 来源优先级')
  const all = {
    cli: { timeoutMs: 1000 },
    env: { timeoutMs: 2000, name: 'env-model' },
    manifest: { timeoutMs: 3000, name: 'manifest-model' },
    default: { timeoutMs: 4000, name: 'default-model' },
  }
  line('未撤层时的来源', resolve('timeoutMs', all).source)
  const noCli = { ...all, cli: {} }
  line('撤掉 cli 后的来源', resolve('timeoutMs', noCli).source)
  const noCliEnv = { ...noCli, env: {} }
  line('撤掉 cli 与环境后的来源', resolve('timeoutMs', noCliEnv).source)
  const onlyDefault = { ...noCliEnv, manifest: {} }
  line('四层只剩默认值时的来源', resolve('timeoutMs', onlyDefault).source)
  line('四层都没有时的来源', resolve('nope', onlyDefault).source)
  const withUndefined = { ...all, cli: { timeoutMs: undefined } }
  line('显式 undefined 时的来源', resolve('timeoutMs', withUndefined).source)
  rows.push('')

  rows.push('[4] 校验与可复现')
  const bad = {
    bundles: { core: ['llm'] },
    profiles: { broken: { bundles: ['core', 'missing'], config: {}, required: ['apiKey'] } },
  }
  line('结构错误数', validate(bad, ['llm']).length)
  line('结构错误内容', validate(bad, ['llm']).join(' / '))
  line('合法清单的错误数', validate(MANIFEST, ['llm', 'tools', 'http']).length)

  const inputs = { profile: 'dev', now: 1000, seed: 42, cli: {}, env: {} }
  const first = compose(MANIFEST, inputs)
  const second = compose(MANIFEST, inputs)
  line('两次装配的产物是否逐字符相同', JSON.stringify(first) === JSON.stringify(second))
  line('dev profile 装载的部件数', first.plugins.length)
  line('prod profile 装载的部件数', compose(MANIFEST, { ...inputs, profile: 'prod' }).plugins.length)
  line('启动印记来自显式输入', first.stamp)
  rows.push('')

  rows.push('[5] 条件装配与组成数')
  line('两个布尔条件键的组成数', compositionCount([2, 2]))
  line('三个三值条件键的组成数', compositionCount([3, 3, 3]))
  line('没有条件键时的组成数', compositionCount([]))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
