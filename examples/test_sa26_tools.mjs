// 2.2 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  SCHEMA_CAPABILITIES, SIDE_EFFECTS, sideEffectLevel, truncatePlan, truncate,
  validateArgs, validateProp, naivePrefixCheck, guardedPrefixCheck, resolveInside,
  capabilityUpperBound, capabilityGap, ToolRegistry,
} from './sa26_tools.mjs'

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

// 定义 2.2.1 / 2.2.3：契约与缺省
eq(SCHEMA_CAPABILITIES, ['type', 'required', 'properties', 'enum', 'items'], 'schema 能力白名单五项')
eq(SCHEMA_CAPABILITIES.length, 5, 'schema 能力数量为 5')
eq(SIDE_EFFECTS, ['readonly', 'reversible', 'irreversible', 'external'], '副作用四级')
eq(SIDE_EFFECTS.length, 4, '副作用等级数量为 4')
eq(sideEffectLevel('x', undefined), 3, '未声明等级时取最危险一级')
eq(sideEffectLevel('x', 'harmless'), 3, '非法等级名回落到最危险一级')
eq(sideEffectLevel('x', 'readonly'), 0, '只读为 0 级')
eq(sideEffectLevel('x', 'reversible'), 1, '可逆写为 1 级')
eq(sideEffectLevel('x', 'irreversible'), 2, '不可逆写为 2 级')
eq(sideEffectLevel('x', 'external'), 3, '外部副作用为 3 级')

// 定义 2.2.5：截断
eq(truncatePlan(1000), { head: 800, tail: 200 }, '上限 1000 的头尾保留量')
eq(truncatePlan(15), { head: 12, tail: 3 }, '上限 15 的头尾保留量')
eq(truncate('abc', 1000), 'abc', '未超限时原样返回')
eq(truncate('abc', 3), 'abc', '恰好等于上限时原样返回')
const long = 'x'.repeat(2500)
const cut = truncate(long, 1000)
ok(cut.includes('省略 1500 个字符'), '说明含丢失量 1500')
ok(cut.includes('共 2500 个'), '说明含原文总量 2500')
ok(cut.startsWith('x'.repeat(800)), '保留头部 800 个字符')
ok(cut.endsWith('x'.repeat(200)), '保留尾部 200 个字符')
eq(cut.slice(800, cut.length - 200).length, 29, '截断说明的长度为 29')
eq(cut.length, 1029, '截断后的总长度为 1029')
ok(cut.length > 1000, '截断后的文本含说明，因此长于上限')
eq(long.length - 1000, 1500, '丢失量为原文减上限')
eq(truncate(long, 0).includes('共 2500 个'), true, '上限为 0 时仍报告总量')

// 定义 2.2.1：递归校验与报错定位
const schema = {
  type: 'object',
  properties: {
    path: { type: 'string', description: '路径' },
    mode: { type: 'string', description: '模式', enum: ['r', 'w'] },
    tags: { type: 'array', description: '标签', items: { type: 'string', description: '单个标签' } },
    limit: { type: 'number', description: '上限' },
  },
  required: ['path'],
}
eq(validateArgs(schema, { path: 'a.md' }), '', '合法参数通过')
eq(validateArgs(schema, {}), '缺少必填参数 path', '缺必填字段报出字段名')
eq(validateArgs(schema, []), '参数 应当是一个对象', '数组被拒')
eq(validateArgs(schema, null), '参数 应当是一个对象', 'null 被拒')
eq(validateArgs(schema, 'x'), '参数 应当是一个对象', '字符串被拒')
eq(validateArgs(schema, { path: 1 }), 'path 应当是字符串', '类型不符报出字段')
eq(validateArgs(schema, { path: 'a', mode: 'x' }), 'mode 只能是 r / w 之一，收到 x', '枚举不符报出取值')
eq(validateArgs(schema, { path: 'a', tags: 'x' }), 'tags 应当是数组', '数组类型不符')
eq(validateArgs(schema, { path: 'a', tags: ['a', 2] }), 'tags[1] 应当是字符串', '数组元素报错带下标')
eq(validateArgs(schema, { path: 'a', limit: 'x' }), 'limit 应当是数字', '数字类型不符')
eq(validateArgs(schema, { path: 'a', extra: 1 }), '不认识的参数 extra', '未知字段被拒')
eq(validateArgs(schema, { path: 'a', extra: 1, more: 2 }), '不认识的参数 extra / more', '多个未知字段全部列出')
eq(validateArgs({ type: 'object', properties: {} }, {}), '', '空 schema 接受空对象')
eq(validateProp({ type: 'boolean', description: 'b' }, 'x', 'flag'), 'flag 应当是布尔值', '布尔类型不符')

// 命题 2.2.4：前缀比较
ok(naivePrefixCheck('/work', '../work-evil/x').passes, '裸前缀比较放过 /work-evil/x（缺陷）')
eq(naivePrefixCheck('/work', '../work-evil/x').resolved, '/work-evil/x', '反例解析结果')
ok(!guardedPrefixCheck('/work', '../work-evil/x').passes, '带分隔符比较拒绝 /work-evil/x')
ok(guardedPrefixCheck('/work', 'src/a.md').passes, '带分隔符比较接受目录内路径')
ok(guardedPrefixCheck('/work', '.').passes, '工作目录自身通过')
ok(!guardedPrefixCheck('/work', '../other').passes, '上级目录被拒')
eq(resolveInside('/work', 'src/a.md'), '/work/src/a.md', '目录内路径被解析成绝对路径')
throws(() => resolveInside('/work', '../../etc/passwd'), '越界路径抛错')
throws(() => resolveInside('/work', '../work-evil/x'), '兄弟目录抛错')

// 命题 2.2.2 / 2.2.6：注册表
const registry = new ToolRegistry()
const unregister = registry.register({
  name: 'echo',
  description: '把 text 原样返回。',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string', description: '要回显的文本' } },
    required: ['text'],
  },
  run: ({ text }) => ({ ok: true, content: text }),
})
const ctx = { workspace: '/work', maxResultChars: 64 }

eq(registry.list().length, 1, '注册后清单含一个工具')
eq(registry.list()[0].name, 'echo', '清单里的名字正确')
eq(Object.keys(registry.list()[0]).sort(), ['description', 'name', 'parameters'], 'list() 不含实现')
eq(JSON.parse(JSON.stringify(registry.list())), registry.list(), 'list() 可 JSON 往返')
throws(() => registry.register({ name: 'echo', description: 'x', parameters: { type: 'object', properties: {} }, run: () => ({ ok: true, content: '' }) }), '重名注册抛错')

const missing = await registry.run('nope', '{}', ctx)
eq(missing.ok, false, '未注册的工具名返回失败')
ok(missing.error.includes('没有名为 nope 的工具'), '未注册提示含工具名')
const badJson = await registry.run('echo', '{"text":', ctx)
eq(badJson.ok, false, '非法 JSON 返回失败')
ok(badJson.error.includes('不是合法 JSON'), '非法 JSON 的错误信息来自 2.1 的解析器')
ok(badJson.error.includes('echo'), '非法 JSON 的错误信息含工具名')
eq((await registry.run('echo', '{}', ctx)).error.includes('缺少必填参数 text'), true, '缺必填返回失败并定位')
eq((await registry.run('echo', '{"text":"a","x":1}', ctx)).error.includes('不认识的参数 x'), true, '未知字段返回失败')
eq((await registry.run('echo', '{"text":1}', ctx)).error.includes('text 应当是字符串'), true, '类型不符返回失败')
eq((await registry.run('echo', '{"text":"hi"}', ctx)).content, 'hi', '正常调用返回内容')

const boom = new ToolRegistry()
boom.register({
  name: 'boom',
  description: '总是抛异常。',
  parameters: { type: 'object', properties: {} },
  run: () => { throw new Error('内部缺陷') },
})
const boomResult = await boom.run('boom', '{}', ctx)
eq(boomResult.ok, false, '实现抛异常时结果仍是失败值')
eq(boomResult.internal, true, '实现抛异常被标注为内部错误')
ok(boomResult.error.includes('内部缺陷'), '内部错误保留原始信息')

const failing = new ToolRegistry()
failing.register({
  name: 'maybe',
  description: '返回可预期失败。',
  parameters: { type: 'object', properties: {} },
  run: () => ({ ok: false, error: '文件不存在' }),
})
const expected = await failing.run('maybe', '{}', ctx)
eq(expected.ok, false, '可预期失败是返回值')
eq(expected.internal, undefined, '可预期失败不带内部标记')

const big = await registry.run('echo', JSON.stringify({ text: 'y'.repeat(200) }), ctx)
eq(big.ok, true, '超长结果仍是成功')
ok(big.content.includes('省略'), '超长成功的输出被截断并报告')
const bigFail = new ToolRegistry()
bigFail.register({
  name: 'noisy',
  description: '失败输出很长。',
  parameters: { type: 'object', properties: {} },
  run: () => ({ ok: false, error: 'e'.repeat(200) }),
})
const noisy = await bigFail.run('noisy', '{}', ctx)
ok(noisy.error.includes('省略'), '失败路径同样过截断')

unregister()
eq(registry.list().length, 0, '卸载后工具从清单消失')

// 命题 2.2.1：能力上界
const effects = [['read_file', 'list_dir'], ['write_file']]
eq(capabilityUpperBound(effects).count, 3, '两个工具提供三种效果')
eq(capabilityUpperBound([]).count, 0, '没有工具则没有可达效果')
eq(capabilityGap(effects, ['read_file', 'write_file']), [], '已有能力无缺口')
eq(capabilityGap(effects, ['read_file', 'web_search']), ['web_search'], '缺少搜索工具时无法搜索')
eq(capabilityGap(effects, ['web_search', 'run_code']).length, 2, '多个缺口全部列出')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
