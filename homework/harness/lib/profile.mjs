// Part C 的参考实现。

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** 四层覆盖 + 来源追踪。 */
export function compose(layers) {
  const values = {}
  const origin = {}
  for (const layer of layers ?? []) {
    for (const [k, v] of Object.entries(layer.values ?? {})) {
      values[k] = isPlain(values[k]) && isPlain(v) ? { ...values[k], ...v } : v // 对象深合并，其余整体替换
      origin[k] = layer.name
    }
  }
  return { values, origin }
}

/** 能力集展开（广度优先，含间接依赖）。 */
export function expandCapabilities(profile, registry) {
  const caps = new Set()
  const seen = new Set()
  const queue = (profile.plugins ?? []).map((p) => p.name)
  while (queue.length) {
    const name = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    for (const c of registry.provides(name) ?? []) caps.add(c)
    for (const d of registry.dependencies(name) ?? []) queue.push(d)
  }
  const list = [...caps].sort()
  return { caps: list, size: list.length }
}

/** 启动校验：声明层 + 能力集层。 */
export function validate(profile, registry, ctx) {
  const issues = []
  for (const p of profile.plugins ?? []) {
    if (!registry.has(p.name)) issues.push({ level: 'error', what: `插件不存在：${p.name}` })
  }
  const { caps, size } = expandCapabilities(profile, registry)
  const have = new Set(caps)
  for (const need of profile.requires ?? []) {
    if (!have.has(need)) {
      issues.push({ level: 'error', what: `缺少必需能力：${need}`, hint: `它可能由提供该能力的插件给出：${need}` })
    }
  }
  if (typeof ctx?.maxCapabilities === 'number' && size > ctx.maxCapabilities) {
    issues.push({ level: 'error', what: `能力集超过上限：${size} > ${ctx.maxCapabilities}` })
  }
  return { ok: issues.every((i) => i.level !== 'error'), issues, capabilities: size }
}

/** 切换计划：整体切换 + 残留预期。 */
export function planSwitch(from, to, ctx) {
  const registrations = from.registrations ?? []
  const expectResidual = registrations.filter((r) => !r.surviving).map((r) => r.what)
  return {
    mode: 'whole',
    steps: [
      `校验目标模式 ${to.name}`,
      '构造新的作用域与容器',
      '把入口指向新作用域（激活）',
      '核对残留并释放旧作用域',
    ],
    expectResidual,
    stateToMigrate: ['会话级预设', '已加载的技能与记忆作用域'],
  }
}
