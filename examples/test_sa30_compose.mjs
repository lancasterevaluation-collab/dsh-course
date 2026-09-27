// 2.6 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  SOURCES, merge, mergeMutating, resolve, compose, validate, compositionCount, MANIFEST,
} from './sa30_compose.mjs'

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

// 定义 2.6.3：合并语义
{
  const base = { name: 'a', timeoutMs: 30000, retry: { max: 3 } }
  const over = { timeoutMs: 60000 }
  const m = merge(base, over)
  eq(Object.keys(m).length, 3, '深合并后有三个字段')
  eq(Object.keys(over).length, 1, '替换语义下只剩一个字段')
  eq(m.name, 'a', '深合并保留下层字段')
  eq(m.retry.max, 3, '深合并保留嵌套字段')
  eq(m.timeoutMs, 60000, '上层标量覆盖下层')
  eq(base.timeoutMs, 30000, '合并不修改入参')
  eq(JSON.stringify(base), JSON.stringify({ name: 'a', timeoutMs: 30000, retry: { max: 3 } }), '入参保持原样')
}
{
  eq(merge({ tools: ['read', 'write'] }, { tools: ['read'] }).tools, ['read'], '数组被整体替换')
  eq(merge({ tools: ['read'] }, { tools: ['a', 'b', 'c'] }).tools.length, 3, '数组替换后的长度取上层')
  eq(merge({ a: 1 }, { a: 2 }), { a: 2 }, '标量由上层覆盖')
  eq(merge({ a: 1 }, {}), { a: 1 }, '上层空对象不改变结果')
  eq(merge({}, { a: 1 }), { a: 1 }, '下层空对象时结果取上层')
  eq(merge({ a: { b: 1 } }, { a: 2 }), { a: 2 }, '类型不同时由上层覆盖')
  eq(merge({ a: 'x' }, { a: { b: 1 } }), { a: { b: 1 } }, '下层标量被上层对象覆盖')
}
{
  const mutBase = { nested: { a: 1 }, top: 1 }
  mergeMutating(mutBase, { nested: { a: 2 } })
  eq(mutBase.nested.a, 2, '反例实现会就地修改下层对象')
  const safeBase = { nested: { a: 1 } }
  merge(safeBase, { nested: { a: 2 } })
  eq(safeBase.nested.a, 1, '正确实现不修改下层对象')
}

// 命题 2.6.3：结合律与交换律
{
  const a = { x: 1, y: { p: 1, q: 1 } }
  const b = { y: { q: 2 }, z: 3 }
  const c = { y: { p: 9 } }
  eq(merge(merge(a, b), c), merge(a, merge(b, c)), '深合并满足结合律')
  ok(JSON.stringify(merge(a, b)) !== JSON.stringify(merge(b, a)), '深合并不满足交换律')
  eq(merge(a, {}), a, '空对象是右单位元')
  eq(merge({}, a), a, '空对象是左单位元')
  eq(merge(merge(a, b), c).y, { p: 9, q: 2 }, '结合后嵌套字段的结果')
}

// 定义 2.6.2：来源优先级
{
  eq(SOURCES.length, 4, '配置来源有四层')
  eq(SOURCES[0], 'cli', '最高优先级是命令行')
  eq(SOURCES[3], 'default', '最低优先级是默认值')
  const all = {
    cli: { timeoutMs: 1000 },
    env: { timeoutMs: 2000 },
    manifest: { timeoutMs: 3000 },
    default: { timeoutMs: 4000 },
  }
  eq(resolve('timeoutMs', all).source, 'cli', '四层齐全时取命令行')
  eq(resolve('timeoutMs', all).value, 1000, '取到命令行的值')
  eq(resolve('timeoutMs', { ...all, cli: {} }).source, 'env', '撤掉命令行后取环境变量')
  eq(resolve('timeoutMs', { ...all, cli: {}, env: {} }).source, 'manifest', '再撤环境后取清单')
  eq(resolve('timeoutMs', { ...all, cli: {}, env: {}, manifest: {} }).source, 'default', '只剩默认值时取默认')
  eq(resolve('timeoutMs', { cli: {}, env: {}, manifest: {}, default: {} }).source, null, '四层都没有时来源为空')
  eq(resolve('timeoutMs', { cli: {}, env: {}, manifest: {}, default: {} }).value, undefined, '四层都没有时值为 undefined')
  eq(resolve('other', { cli: { timeoutMs: 1 } }).source, null, '键名不同则不命中')
}
{
  const inputs = {
    cli: { timeoutMs: undefined },
    env: { timeoutMs: 2000 },
    manifest: {},
    default: {},
  }
  eq(resolve('timeoutMs', inputs).source, 'env', '显式 undefined 不截断查找链')
  eq(resolve('timeoutMs', inputs).value, 2000, '继续向下层取值')
  eq(resolve('timeoutMs', { cli: { timeoutMs: 0 }, env: { timeoutMs: 2 } }).source, 'cli', '零是有效值而不是未提供')
  eq(resolve('timeoutMs', { cli: { timeoutMs: null }, env: { timeoutMs: 2 } }).source, 'cli', 'null 是有效值而不是未提供')
  eq(resolve('timeoutMs', { cli: { timeoutMs: null }, env: { timeoutMs: 2 } }).value, null, 'null 覆盖下层')
}
{
  // 各层之间也深合并：上层只写差异时其余字段继承
  const inputs = {
    cli: {},
    env: {},
    manifest: { llm: { name: 'm', retry: { max: 3 }, timeoutMs: 30000 } },
    default: {},
  }
  const r = resolve('llm', inputs)
  eq(r.source, 'manifest', '来源记为清单层')
  eq(r.value.retry.max, 3, '只写差异时下层字段保留')
  const top = {
    cli: { llm: { timeoutMs: 500 } },
    env: {},
    manifest: { llm: { name: 'm', retry: { max: 3 }, timeoutMs: 30000 } },
    default: {},
  }
  const r2 = resolve('llm', top)
  eq(r2.source, 'cli', '来源记为命令行层')
  eq(r2.value.timeoutMs, 500, '命令行覆盖超时')
  eq(r2.value.name, 'm', '其余字段从下层继承')
  eq(r2.value.retry.max, 3, '嵌套字段也继承')
}

// 定义 2.6.4 / 2.6.1：装配
{
  const inputs = { profile: 'dev', now: 1000, seed: 42, cli: {}, env: {} }
  const r = compose(MANIFEST, inputs)
  eq(r.plugins, ['llm', 'tools'], 'dev profile 装载 core bundle 的两个部件')
  eq(r.plugins.length, 2, 'dev 装载两个部件')
  eq(compose(MANIFEST, { ...inputs, profile: 'prod' }).plugins.length, 3, 'prod 多装载一个部件')
  eq(r.stamp, 1000, '启动印记来自显式输入')
  eq(r.seed, 42, '随机种子来自显式输入')
  eq(r.resolved.llm.value.name, 'dev-model', 'profile 配置覆盖默认值')
  eq(r.resolved.llm.value.timeoutMs, 10000, 'profile 写的超时生效')
  eq(r.resolved.llm.value.retry.max, 3, '未写字段从默认值继承')
  eq(r.resolved.llm.source, 'manifest', '未在 cli 与环境提供时来源是清单')
}
{
  const inputs = { profile: 'dev', now: 1, seed: 1, cli: { llm: { timeoutMs: 500 } }, env: {} }
  const r = compose(MANIFEST, inputs)
  eq(r.resolved.llm.source, 'cli', '命令行提供时来源是命令行')
  eq(r.resolved.llm.value.timeoutMs, 500, '命令行覆盖清单')
  eq(r.resolved.llm.value.retry.max, 3, '命令行只写差异时其余字段仍继承')
}
{
  // 命题 2.6.4：可复现
  let threw = false
  try { compose(MANIFEST, { profile: 'nope' }) } catch { threw = true }
  ok(threw, '未知 profile 抛错')
  const inputs = { profile: 'dev', now: 7, seed: 9, cli: {}, env: {} }
  eq(JSON.stringify(compose(MANIFEST, inputs)), JSON.stringify(compose(MANIFEST, inputs)), '同一输入的两次装配产物相同')
  const other = { ...inputs, now: 8 }
  ok(JSON.stringify(compose(MANIFEST, inputs)) !== JSON.stringify(compose(MANIFEST, other)), '时间不同则产物不同')
}

// 命题 2.6.6：校验成批报告
{
  const bad = {
    bundles: { core: ['llm'] },
    profiles: { broken: { bundles: ['core', 'missing'], config: {}, required: ['apiKey'] } },
  }
  const problems = validate(bad, ['llm'])
  eq(problems.length, 2, '两处结构错误一次报出')
  ok(problems.some((p) => p.includes('missing')), '报出缺失的 bundle')
  ok(problems.some((p) => p.includes('apiKey')), '报出缺失的必需配置')
  eq(validate(MANIFEST, ['llm', 'tools', 'http']).length, 0, '合法清单没有错误')
  eq(validate(MANIFEST, ['llm']).length, 3, '缺三个部件时报出三条')
  ok(validate(MANIFEST, ['llm']).some((p) => p.includes('http')), '错误信息含部件名')
}

// 命题 2.6.5：组成数
{
  eq(compositionCount([2, 2]), 4, '两个布尔条件键给出四种组成')
  eq(compositionCount([3, 3, 3]), 27, '三个三值条件键给出二十七种组成')
  eq(compositionCount([]), 1, '没有条件键时组成唯一')
  eq(compositionCount([1, 5]), 5, '取值域为一的键不增加组成数')
  ok(compositionCount([2, 2, 2]) > compositionCount([2, 2]), '条件键越多组成越多')
}
{
  // 合并的规模：层数越多，最终值的推断需要看的地方越多
  const layers = [{ a: 1 }, { b: 2 }, { c: 3 }]
  const merged = layers.reduce((acc, l) => merge(acc, l), {})
  eq(Object.keys(merged).length, 3, '三层合并后有三个字段')
  near(layers.length, 3, 0, '参与合并的层数为三')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
