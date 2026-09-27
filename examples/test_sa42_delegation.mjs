// 5.4 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  buildDelegation, inherit, admitDelegation, collect, exhaustion, costAmplification,
  worthDelegating, attachTool, normalizeExternalError, BOUNDARY,
} from './sa42_delegation.mjs'

let pass = 0
let fail = 0
const near = (a, b, tol, label) => {
  if (Math.abs(a - b) <= tol) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${a}，期望 ${b}`)
}
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}`)
}
const ok = (c, label) => {
  if (c) { pass++; return }
  fail++
  console.log(`不通过：${label}`)
}
const throws = (fn, label) => {
  try { fn() } catch { pass++; return }
  fail++
  console.log(`不通过：${label} —— 未抛错`)
}

const PARENT = { id: 's-1', goal: '把第 5 卷写完', depth: 0 }
const SPEC = {
  goal: '为 5.4 写一节',
  context: ['骨架', '篇幅门槛'],
  constraints: ['不得改动其他篇'],
  outputFormat: { kind: 'markdown-section', maxChars: 4000 },
}

// 定义 5.4.2：协议四要素
{
  const built = buildDelegation(PARENT, SPEC)
  eq(built.depth, 1, '父深度为零时子深度为一')
  eq(built.parentSession, 's-1', '记录父会话')
  eq(built.parentTask, '把第 5 卷写完', '记录父任务语境')
  eq(built.budget.maxTokens, 50000, '默认 token 预算')
  eq(built.budget.maxToolCalls, 30, '默认调用次数预算')
  for (const key of ['goal', 'context', 'constraints', 'outputFormat']) {
    throws(() => buildDelegation(PARENT, { ...SPEC, [key]: '' }), `缺 ${key} 时抛错`)
  }
  throws(() => buildDelegation(PARENT, { ...SPEC, context: [] }), '上下文为空数组时抛错')
  eq(buildDelegation({ ...PARENT, depth: 1 }, SPEC).depth, 2, '深度逐层递增')
  eq(buildDelegation(PARENT, { ...SPEC, budget: { maxTokens: 1000, maxToolCalls: 5 } }).budget.maxTokens, 1000, '显式预算被采用')
}

// 命题 5.4.1 / 5.4.2：成本与适用判据
{
  const c = costAmplification(30000, 5, 10000, 60000)
  eq(c.delegated, 160000, '派发总消耗 160K')
  eq(c.direct, 60000, '自做消耗 60K')
  near(c.ratio, 2.667, 0.01, '成本放大约 2.67 倍')
  ok(c.ratio > 2 && c.ratio < 3, '放大倍数落在 2–3 倍区间')
  eq(costAmplification(0, 0, 0, 100).delegated, 0, '没有子任务时派发成本为零')
  eq(worthDelegating(80000, 10000), true, '隔离量远大于开销时划算')
  eq(worthDelegating(3000, 10000), false, '隔离量小于开销时不划算')
  eq(worthDelegating(10000, 10000), false, '相等时不划算（净收益为零）')
}

// 命题 5.4.3：不可提权
{
  const parent = { tools: ['read', 'write'], permissions: ['p1'], sideEffectCeiling: 1 }
  const child = inherit(parent, { tools: ['read'], sideEffectCeiling: 0 })
  eq(child.tools, ['read'], '子 agent 的工具集是它自己声明的子集')
  eq(child.permissions, ['p1'], '授权继承自父会话')
  eq(child.sideEffectCeiling, 1, '副作用上限取父会话的值')
  throws(() => inherit(parent, { tools: ['read', 'shell'], sideEffectCeiling: 1 }), '工具超出父会话时抛错')
  throws(() => inherit(parent, { tools: ['read'], sideEffectCeiling: 3 }), '副作用上限超出时抛错')
  ok(inherit(parent, { tools: [], sideEffectCeiling: 0 }).tools.length === 0, '允许不给子 agent 任何工具')
  ok(inherit(parent, { tools: ['read'], sideEffectCeiling: 0 }).tools.includes('write') === false, '继承不等于把父的工具全给它')
}

// 定义 5.4.4：三层限制
{
  const ctx = { maxDepth: 2, maxChildren: 3, activeChildren: 0, globalConcurrent: () => 0, globalMaxConcurrent: 10 }
  eq(admitDelegation(PARENT, ctx).ok, true, '正常派发准入')
  eq(admitDelegation({ depth: 2 }, ctx).ok, false, '深度超限时拒绝')
  ok(admitDelegation({ depth: 2 }, ctx).reason.includes('深度'), '拒绝原因说明深度')
  eq(admitDelegation(PARENT, { ...ctx, activeChildren: 3 }).reason, '子任务数已满', '子任务数满时拒绝')
  eq(admitDelegation(PARENT, { ...ctx, globalConcurrent: () => 10 }).reason, '全局并发已满', '全局并发满时拒绝')
  eq(admitDelegation({ depth: 1 }, ctx).ok, true, '恰好等于深度上限时准入')
}

// 定义 5.4.3：回收
{
  const meta = { tokens: 12000, turns: 4 }
  const bad = collect({ kind: 'plain-text', text: 'x' }, SPEC.outputFormat, meta)
  eq(bad.ok, false, '格式不符时失败')
  eq(bad.retryable, true, '格式不符可重试')
  ok(bad.reason.includes('markdown-section'), '说明期望的格式')
  const long = collect('a'.repeat(500), { kind: 'markdown-section', maxChars: 400 }, meta)
  eq(long.ok, true, '超长产出仍然采纳')
  eq(long.truncated, 100, '被裁剪 100 个字符')
  eq(long.value.length, 400, '裁剪后长度等于上限')
  eq(long.meta.tokens, 12000, '回收带追溯元数据')
  const fit = collect('a'.repeat(100), { kind: 'markdown-section', maxChars: 400 }, meta)
  eq(fit.truncated, 0, '未超长时不裁剪')
  eq(collect({ kind: 'markdown-section', body: 'x' }, SPEC.outputFormat, meta).ok, true, '格式相符时采纳')
  eq(collect('x', {}, meta).ok, true, '没有格式要求时直接采纳')
}

// 命题 5.4.5：预算用尽
{
  const budget = { maxTokens: 50000, maxToolCalls: 30 }
  const t = exhaustion({ tokens: 50001, toolCalls: 0 }, budget)
  eq(t.stop, true, 'token 用尽时停止')
  eq(t.partial, true, '停止时标记部分结果')
  eq(t.reason, 'token 预算用尽', '原因说明是 token')
  const c = exhaustion({ tokens: 0, toolCalls: 30 }, budget)
  eq(c.partial, true, '调用次数用尽时也标记部分结果')
  eq(c.reason, '调用次数用尽', '原因说明是调用次数')
  eq(exhaustion({ tokens: 49999, toolCalls: 29 }, budget).stop, false, '未达上限时继续')
  eq(exhaustion({ tokens: 50000, toolCalls: 0 }, budget).stop, true, '恰好等于上限时停止')
}

// 定义 5.4.5 / 5.4.6：外部工具
{
  eq(Object.keys(BOUNDARY).length, 7, '信任边界有七个字段')
  eq(BOUNDARY.sideEffectCeiling, 0, '默认副作用上限是只读')
  eq(BOUNDARY.fs.write, [], '默认可写路径为空')
  eq(BOUNDARY.net.allow, [], '默认可访问域名为空')
  eq(BOUNDARY.env, [], '默认可见环境变量为空')
  eq(BOUNDARY.contextSharing.parentHistory, false, '默认不共享父会话历史')
  const tool = attachTool('files', { name: 'read', description: '读取文件' }, BOUNDARY)
  eq(tool.name, 'mcp__files__read', '工具名带来源前缀')
  ok(tool.description.startsWith('[外部]'), '描述标注外部来源')
  eq(tool.sideEffect, 0, '副作用等级来自边界')
  eq(attachTool('my-server', { name: 'x', description: 'd' }, BOUNDARY).name, 'mcp__my_server__x', '服务器名中的横线被替换')
  eq(attachTool('a', { name: 'x', description: 'd' }, { ...BOUNDARY, sideEffectCeiling: 2 }).sideEffect, 2, '边界可放宽等级')
}
{
  eq(normalizeExternalError({ kind: 'timeout' }).kind, 'retryable', '超时可重试')
  eq(normalizeExternalError({ kind: 'connection' }).kind, 'retryable', '连接失败可重试')
  eq(normalizeExternalError({ kind: 'protocol' }).kind, 'fatal', '协议不匹配是致命')
  eq(normalizeExternalError({ kind: 'invalid-args' }).kind, 'fatal', '参数被拒是致命')
  eq(normalizeExternalError({ kind: 'unknown-xyz' }).kind, 'fatal', '未识别错误是致命')
  ok(normalizeExternalError({ kind: 'unknown-xyz' }).action.includes('交给人'), '未识别错误交给人处理')
  eq(normalizeExternalError({ kind: 'unknown-xyz' }).kind, 'fatal', '未识别错误的类别是致命')
}

// 量级关系
{
  near(costAmplification(30000, 5, 10000, 60000).ratio, 160000 / 60000, 1e-9, '放大倍数与总收入一致')
  ok(costAmplification(30000, 10, 10000, 60000).ratio > costAmplification(30000, 5, 10000, 60000).ratio, '子任务越多放大越明显')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
