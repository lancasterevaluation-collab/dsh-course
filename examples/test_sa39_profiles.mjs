// 5.1 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  isPlainObject, compose, requirePresent, expandCapabilities, validate,
  detectResidual, switchProfile, REGISTRY,
} from './sa39_profiles.mjs'

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

// 定义 5.1.3：四层覆盖与合并
{
  const layers = [
    { name: '内建默认', values: { concurrency: 4, timeoutMs: 30000, retry: { max: 3, backoffMs: 500 } } },
    { name: '用户级', values: { concurrency: 8 } },
    { name: '项目级', values: { timeoutMs: 60000, retry: { max: 5 } } },
    { name: '运行参数', values: {} },
  ]
  const { values, origin } = compose(layers)
  eq(values.concurrency, 8, '并发来自用户级 8')
  eq(origin.concurrency, '用户级', '并发的来源是用户级')
  eq(values.timeoutMs, 60000, '超时来自项目级 60000')
  eq(origin.timeoutMs, '项目级', '超时的来源是项目级')
  eq(Object.keys(values.retry).length, 2, '对象深合并保留两个键')
  eq(values.retry.max, 5, '上层的同键被覆盖')
  eq(values.retry.backoffMs, 500, '未提及的键被保留')
  eq(origin.retry, '项目级', '来源记为最后一次写它的层')
  ok(Object.keys(values).every((k) => k in origin), '来源覆盖全部键')
  eq(Object.keys(origin).length, Object.keys(values).length, '来源表的键数等于有效配置的键数')
  eq(compose([]).values, {}, '没有层时有效配置为空')
}
{
  eq(isPlainObject({}), true, '空对象算普通对象')
  eq(isPlainObject([]), false, '数组不算普通对象')
  eq(isPlainObject(null), false, 'null 不算普通对象')
  eq(isPlainObject(1), false, '数字不算普通对象')
}
{
  const obj = compose([{ name: 'A', values: { o: { x: 1 } } }, { name: 'B', values: { o: { y: 2 } } }])
  eq(Object.keys(obj.values.o).length, 2, '对象深合并保留两边的键')
  const arr = compose([{ name: 'A', values: { list: ['x', 'y'] } }, { name: 'B', values: { list: ['x'] } }])
  eq(arr.values.list, ['x'], '数组整体替换')
  eq(arr.values.list.includes('y'), false, '下层删除的元素不再出现')
  eq(arr.origin.list, 'B', '数组的来源是最后写它的层')
  const mixed = compose([{ name: 'A', values: { a: 1 } }, { name: 'B', values: { a: { b: 2 } } }])
  eq(mixed.values.a, { b: 2 }, '类型不同时由上层整体替换')
}

// 定义 5.1.4：必填项
{
  const composed = { values: { concurrency: 8, timeoutMs: 60000 } }
  ok(requirePresent(['concurrency'], composed) === undefined, '必填项齐备时不抛错')
  throws(() => requirePresent(['concurrency', 'modelId'], composed), '缺必填项时抛错')
  let msg = ''
  try { requirePresent(['a', 'b'], composed) } catch (e) { msg = e.message }
  ok(msg.includes('a') && msg.includes('b'), '错误信息列出全部缺失键')
}

// 定义 5.1.5：能力集与校验
{
  const profile = { name: 'dev', plugins: ['a-plugin'], requires: ['llm/chat'] }
  const caps = expandCapabilities(profile, REGISTRY)
  eq(caps.size, 3, '能力集含三个能力')
  ok(caps.has('llm/chat'), '间接依赖提供的能力在集里')
  ok(caps.has('tool/read'), '直接插件提供的能力在集里')
  ok(caps.has('tool/write'), '中间依赖提供的能力在集里')
  eq(expandCapabilities({ plugins: [] }, REGISTRY).size, 0, '没有插件时能力集为空')
  eq(expandCapabilities({ plugins: ['nope'] }, REGISTRY).size, 0, '未知插件不提供能力')
  const cyclic = { has: () => true, provides: (p) => [p], dependencies: () => ['loop'] }
  ok(expandCapabilities({ plugins: ['loop'] }, cyclic).size >= 1, '循环依赖不会死循环')
}
{
  const profile = { name: 'dev', plugins: ['a-plugin'], requires: ['llm/chat'] }
  const r = validate(profile, REGISTRY, 10)
  eq(r.ok, true, '合法模式通过校验')
  eq(r.capabilities.size, 3, '校验返回能力集大小')
  eq(r.issues.length, 0, '没有问题时清单为空')
  const missing = validate({ ...profile, requires: ['vector/search'] }, REGISTRY, 10)
  eq(missing.ok, false, '缺必需能力时报错')
  ok(missing.issues[0].what.includes('vector/search'), '错误信息含缺失的能力名')
  ok(missing.issues[0].hint.includes('v-plugin'), '提示给出可能提供的插件')
  const unknown = validate({ ...profile, plugins: ['nope'] }, REGISTRY, 10)
  eq(unknown.ok, false, '插件不存在时报错')
  ok(unknown.issues.some((i) => i.what.includes('插件不存在')), '错误类型是插件不存在')
  const over = validate(profile, REGISTRY, 2)
  eq(over.ok, false, '能力集超上限时报错')
  ok(over.issues[0].what.includes('3'), '错误信息含实际规模')
  eq(validate(profile, REGISTRY, 3).ok, true, '恰好等于上限时通过')
}

// 定义 5.1.6：切换与残留
{
  const ctx = {
    listRegistrations: () => [
      { scope: 'old', what: 'tool/read', plugin: 'a', expectedAfterDispose: false },
      { scope: 'old', what: 'logger', plugin: 'l', expectedAfterDispose: true },
      { scope: 'new', what: 'tool/write', plugin: 'b', expectedAfterDispose: false },
    ],
  }
  const residual = detectResidual({ id: 'old' }, ctx)
  eq(residual.length, 1, '残留只算旧作用域里不期望存活的')
  ok(residual[0].includes('tool/read'), '残留描述含注册项')
  ok(residual[0].includes('a'), '残留描述含来源插件')
  eq(detectResidual({ id: 'new' }, ctx).length, 1, '另一个作用域的注册也算它自己的残留')
  eq(detectResidual({ id: 'none' }, ctx).length, 0, '没有对应作用域时没有残留')
}
{
  const profile = { name: 'dev', plugins: ['a-plugin'], requires: ['llm/chat'] }
  const ctx = {
    registry: REGISTRY,
    maxCapabilities: 10,
    current: { id: 'old' },
    activated: false,
    disposed: false,
    async compose(next) { return { id: 'new', profile: next.name } },
    async activate() { this.activated = true },
    async dispose() { this.disposed = true },
    listRegistrations: () => [{ scope: 'old', what: 'tool/read', plugin: 'a', expectedAfterDispose: false }],
  }
  const report = await switchProfile(profile, ctx)
  eq(report.profile, 'dev', '报告含模式名')
  eq(report.capabilities, 3, '报告含能力集大小')
  eq(report.residual.length, 1, '报告含残留')
  eq(ctx.activated, true, '新作用域被激活')
  eq(ctx.disposed, true, '旧作用域被释放')

  const badCtx = {
    ...ctx,
    activated: false,
    disposed: false,
    async activate() { this.activated = true },
    async dispose() { this.disposed = true },
  }
  let threw = false
  try { await switchProfile({ ...profile, requires: ['vector/search'] }, badCtx) } catch { threw = true }
  eq(threw, true, '校验失败时切换抛错')
  eq(badCtx.activated, false, '校验失败时不激活新作用域')
  eq(badCtx.disposed, false, '校验失败时不释放旧作用域')
}

// 量级关系
{
  near(REGISTRY.dependencies('a-plugin').length, 1, 0, '直接依赖一项')
  eq(REGISTRY.providerOf('llm/chat'), 'c-plugin', '能力到提供者的映射')
  eq(REGISTRY.providerOf('nope'), null, '未知能力没有提供者')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
