// 5.4 多智能体与外部工具的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/**
 * 定义 5.4.2：协议四要素缺一即拒。
 * @param parent 父会话（`{ id, goal, depth }`）
 * @param spec 派发协议
 * @returns 已构造的派发
 * @throws 缺任一要素时
 */
export function buildDelegation(parent, spec) {
  const required = ['goal', 'context', 'constraints', 'outputFormat']
  const missing = required.filter((k) => !spec[k] || (Array.isArray(spec[k]) && spec[k].length === 0))
  if (missing.length) throw new Error(`派发缺少：${missing.join('、')}`)
  return {
    id: spec.id ?? `d-${parent.id}-${spec.goal.length}`,
    parentSession: parent.id,
    parentTask: parent.goal,
    depth: (parent.depth ?? 0) + 1,
    budget: { maxTokens: spec.budget?.maxTokens ?? 50000, maxToolCalls: spec.budget?.maxToolCalls ?? 30 },
    goal: spec.goal,
    context: spec.context,
    constraints: spec.constraints,
    outputFormat: spec.outputFormat,
  }
}

/**
 * 命题 5.4.3：子 agent 的授权与工具集不得超过父会话。
 * @param parent 父会话（`{ tools, permissions, sideEffectCeiling }`）
 * @param childSpec 子会话要求
 * @returns `{ tools, permissions, sideEffectCeiling }`
 * @throws 工具或权限超出父会话时
 */
export function inherit(parent, childSpec) {
  const extraTools = childSpec.tools.filter((t) => !parent.tools.includes(t))
  if (extraTools.length) throw new Error(`子 agent 的工具超出父会话：${extraTools.join('、')}`)
  if (childSpec.sideEffectCeiling > parent.sideEffectCeiling) {
    throw new Error(`子 agent 的副作用上限超出父会话：${childSpec.sideEffectCeiling} > ${parent.sideEffectCeiling}`)
  }
  return {
    tools: [...childSpec.tools],
    permissions: [...parent.permissions],
    sideEffectCeiling: parent.sideEffectCeiling,
  }
}

/**
 * 定义 5.4.4：三层限制的准入判断。
 * @param parent 父会话
 * @param ctx 形如 `{ maxDepth, maxChildren, activeChildren, globalConcurrent, globalMaxConcurrent }`
 * @returns `{ ok, reason? }`
 */
export function admitDelegation(parent, ctx) {
  const depth = (parent.depth ?? 0) + 1
  if (depth > ctx.maxDepth) return { ok: false, reason: `深度超限：${depth} > ${ctx.maxDepth}` }
  if (ctx.activeChildren >= ctx.maxChildren) return { ok: false, reason: '子任务数已满' }
  if (ctx.globalConcurrent() >= ctx.globalMaxConcurrent) return { ok: false, reason: '全局并发已满' }
  return { ok: true }
}

/**
 * 定义 5.4.3：回收——格式不符返回可重试失败，超长裁剪并报告。
 * @param raw 子 agent 的产出
 * @param outputFormat 形如 `{ kind, maxChars }`
 * @param meta 追溯元数据
 * @returns `{ ok, value?, truncated?, retryable?, reason?, meta? }`
 */
export function collect(raw, outputFormat, meta) {
  const isObj = raw !== null && typeof raw === 'object'
  if (outputFormat?.kind && isObj && raw.kind !== outputFormat.kind) {
    return { ok: false, retryable: true, reason: `产出格式不符：期望 ${outputFormat.kind}，得到 ${raw.kind ?? '未知'}` }
  }
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
  const max = outputFormat?.maxChars ?? Infinity
  if (text.length > max) return { ok: true, value: text.slice(0, max), truncated: text.length - max, meta }
  return { ok: true, value: text, truncated: 0, meta }
}

/**
 * 命题 5.4.5：预算用尽时返回部分结果并标记。
 * @param used 形如 `{ tokens, toolCalls }`
 * @param budget 形如 `{ maxTokens, maxToolCalls }`
 * @returns `{ stop, reason, partial }`
 */
export function exhaustion(used, budget) {
  if (used.tokens >= budget.maxTokens) return { stop: true, reason: 'token 预算用尽', partial: true }
  if (used.toolCalls >= budget.maxToolCalls) return { stop: true, reason: '调用次数用尽', partial: true }
  return { stop: false, reason: null, partial: false }
}

/**
 * 命题 5.4.1：派发的成本放大。
 * @param childTokens 每个子 agent 的完整消耗
 * @param children 子任务数
 * @param overhead 父会话的派发与回收开销
 * @param directCost 自做的成本
 * @returns `{ delegated, direct, ratio }`
 */
export function costAmplification(childTokens, children, overhead, directCost) {
  const delegated = childTokens * children + overhead
  return { delegated, direct: directCost, ratio: delegated / directCost }
}

/**
 * 命题 5.4.2：派发是否划算。
 * @param isolatedTokens 被隔离的中间过程量
 * @param overheadTokens 派发与回收的开销
 * @returns 是否划算
 */
export function worthDelegating(isolatedTokens, overheadTokens) {
  return isolatedTokens > overheadTokens
}

/**
 * 定义 5.4.5：外部工具的外观——命名加前缀、等级来自边界。
 * @param serverName 服务器名
 * @param capability 形如 `{ name, description }`
 * @param boundary 信任边界
 * @returns 工具定义
 */
export function attachTool(serverName, capability, boundary) {
  return {
    name: `mcp__${serverName.replace(/[^a-z0-9]/gi, '_')}__${capability.name}`,
    description: `[外部] ${capability.description}`,
    sideEffect: boundary.sideEffectCeiling,
    allowedPaths: boundary.fs.read,
  }
}

/**
 * 定义 5.4.6：把外部错误归一化成内部三类。
 * @param error 形如 `{ kind }` 的外部错误
 * @returns `{ kind, action }`
 */
export function normalizeExternalError(error) {
  if (error.kind === 'timeout' || error.kind === 'connection') {
    return { kind: 'retryable', action: '按重试策略处理' }
  }
  if (error.kind === 'protocol' || error.kind === 'invalid-args') {
    return { kind: 'fatal', action: '报告并停用该工具' }
  }
  return { kind: 'fatal', action: '不重试，交给人' }
}

/** 算例用的信任边界。 */
export const BOUNDARY = {
  server: 'files',
  fs: { read: ['/repo'], write: [] },
  net: { allow: [] },
  env: [],
  sideEffectCeiling: 0,
  budget: { cpuMs: 1000, memoryMb: 256, callsPerMinute: 60 },
  contextSharing: { parentHistory: false, memory: 'filtered' },
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('5.4 多智能体与外部工具 · 算例（SA-42）')
  rows.push('')

  rows.push('[1] 派发协议与成本')
  const parent = { id: 's-1', goal: '把第 5 卷写完', depth: 0 }
  const spec = {
    goal: '为 5.4 写一节关于外部工具的内容',
    context: ['5.4 的骨架', '0.3 规范的篇幅门槛'],
    constraints: ['不得改动其他篇'],
    outputFormat: { kind: 'markdown-section', maxChars: 4000 },
  }
  let threw = 0
  for (const key of ['goal', 'context', 'constraints', 'outputFormat']) {
    try { buildDelegation(parent, { ...spec, [key]: '' }) } catch { threw++ }
  }
  line('四要素各缺一次是否都抛错', threw === 4)
  line('缺目标时是否抛错', (() => { try { buildDelegation(parent, { ...spec, goal: '' }); return false } catch { return true } })())
  line('四要素齐全时是否通过', buildDelegation(parent, spec).goal === spec.goal)
  line('深度', buildDelegation(parent, spec).depth)
  line('父任务语境被记录', buildDelegation(parent, spec).parentTask === parent.goal)
  line('默认预算的 token 上限', buildDelegation(parent, spec).budget.maxTokens)

  const cost = costAmplification(30000, 5, 10000, 60000)
  line('成本放大：总消耗 / 自做', `${cost.delegated / 1000}K / ${cost.direct / 1000}K`)
  line('成本放大倍数', cost.ratio.toFixed(2))
  line('隔离量大于开销时是否划算', worthDelegating(80000, 10000))
  line('隔离量小于开销时是否划算', worthDelegating(3000, 10000))
  rows.push('')

  rows.push('[2] 继承与限制')
  const parentCaps = { tools: ['read', 'write'], permissions: ['p1'], sideEffectCeiling: 1 }
  line('工具超出父会话时是否抛错', (() => { try { inherit(parentCaps, { tools: ['read', 'shell'], sideEffectCeiling: 1 }); return false } catch { return true } })())
  line('副作用上限超出时是否抛错', (() => { try { inherit(parentCaps, { tools: ['read'], sideEffectCeiling: 3 }); return false } catch { return true } })())
  line('授权是否继承自父会话', inherit(parentCaps, { tools: ['read'], sideEffectCeiling: 0 }).permissions.join(',') === 'p1')
  line('工具集被继承', inherit(parentCaps, { tools: ['read'], sideEffectCeiling: 0 }).tools.includes('write'))
  const limCtx = { maxDepth: 2, maxChildren: 3, activeChildren: 0, globalConcurrent: () => 0, globalMaxConcurrent: 10 }
  line('正常派发是否准入', admitDelegation(parent, limCtx).ok)
  line('深度超限时是否拒绝', admitDelegation({ depth: 2 }, limCtx).reason)
  line('子任务数已满时是否拒绝', admitDelegation(parent, { ...limCtx, activeChildren: 3 }).reason)
  line('全局并发已满时是否拒绝', admitDelegation(parent, { ...limCtx, globalConcurrent: () => 10 }).reason)
  rows.push('')

  rows.push('[3] 回收')
  const meta = { tokens: 12000, turns: 4 }
  const badFormat = collect({ kind: 'plain-text', text: 'x' }, spec.outputFormat, meta)
  line('格式不符时是否可重试', badFormat.retryable)
  line('格式不符的原因', badFormat.reason.includes('期望 markdown-section'))
  const long = collect('a'.repeat(500), { kind: 'markdown-section', maxChars: 400 }, meta)
  line('超长产出是否被裁剪', long.truncated > 0)
  line('被裁剪的字符数', long.truncated)
  line('裁剪后的长度等于上限', long.value.length === 400)
  line('回收是否带追溯元数据', long.meta.tokens === 12000)
  const ok = collect('a'.repeat(100), { kind: 'markdown-section', maxChars: 400 }, meta)
  line('未超长时不裁剪', ok.truncated)
  rows.push('')

  rows.push('[4] 预算与外部')
  line('token 预算用尽时是否部分返回', exhaustion({ tokens: 50001, toolCalls: 0 }, { maxTokens: 50000, maxToolCalls: 30 }).partial)
  line('token 预算用尽的原因', exhaustion({ tokens: 50001, toolCalls: 0 }, { maxTokens: 50000, maxToolCalls: 30 }).reason)
  line('调用次数用尽时是否部分返回', exhaustion({ tokens: 0, toolCalls: 30 }, { maxTokens: 50000, maxToolCalls: 30 }).partial)
  line('预算未用尽时是否继续', exhaustion({ tokens: 100, toolCalls: 1 }, { maxTokens: 50000, maxToolCalls: 30 }).stop)

  const tool = attachTool('files', { name: 'read', description: '读取文件' }, BOUNDARY)
  line('外部工具名的前缀', tool.name)
  line('副作用等级来自边界', tool.sideEffect)
  line('允许的路径来自边界', tool.allowedPaths.join(', '))
  line('信任边界的字段数', Object.keys(BOUNDARY).length)
  line('超时错误的归一化结果', normalizeExternalError({ kind: 'timeout' }).kind)
  line('连接错误的归一化结果', normalizeExternalError({ kind: 'connection' }).kind)
  line('协议错误的归一化结果', normalizeExternalError({ kind: 'protocol' }).kind)
  line('未识别错误的归一化结果', normalizeExternalError({ kind: 'weird-unknown' }).kind)
  line('未识别错误的处置', normalizeExternalError({ kind: 'weird-unknown' }).action)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
