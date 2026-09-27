// 1.3 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  MODULE_CARD_FIELDS, instability, dependencyViolations, hotspot, byComplexity,
  hiddenness, impact, verifiedShare, checkGoal,
} from './sa17_readcode.mjs'

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

// 定义 1.3.4：不稳定性
const nodes = ['core', 'api', 'ui', 'util', 'dead']
const edges = [['ui', 'api'], ['api', 'core'], ['core', 'util']]
const I = instability(nodes, edges)
near(I.get('ui'), 1, 1e-9, '只依赖别人的模块 I = 1')
near(I.get('util'), 0, 1e-9, '只被依赖的模块 I = 0')
near(I.get('core'), 0.5, 1e-9, '一进一出时 I = 0.5')
near(I.get('dead'), 0, 1e-9, '无依赖的模块 I = 0')
near(instability(['a', 'b'], [['a', 'b']]).get('a'), 1, 1e-9, '单条依赖的源端 I = 1')
near(instability(['a', 'b'], [['a', 'b']]).get('b'), 0, 1e-9, '单条依赖的宿端 I = 0')

// 命题 1.3.2：稳定依赖检查
const vs = dependencyViolations(nodes, edges)
eq(vs.length, 0, '依赖指向更稳定方向时无逆流')
// 真正的逆流：稳定模块依赖不稳定模块（I(from) < I(to)）
const vNodes = ['s1', 's2', 'stable', 'unstable', 'u1', 'u2']
const vEdges = [['s1', 'stable'], ['s2', 'stable'], ['unstable', 'u1'], ['unstable', 'u2'], ['stable', 'unstable']]
const vI = instability(vNodes, vEdges)
near(vI.get('stable'), 1 / 3, 1e-9, 'stable 的 I = 1/3（入 2 出 1）')
near(vI.get('unstable'), 2 / 3, 1e-9, 'unstable 的 I = 2/3（入 1 出 2）')
eq(dependencyViolations(vNodes, vEdges).length, 1, '稳定模块依赖不稳定模块时检出逆流')
eq(dependencyViolations(vNodes, vEdges)[0].from, 'stable', '逆流的源端是更稳定的那个')
eq(dependencyViolations(nodes, []).length, 0, '无边时无逆流')

// 命题 1.3.3：热点
const modules = [
  { id: 'compressor', changesPerMonth: 4, complexity: 25 },
  { id: 'codec', changesPerMonth: 0.2, complexity: 45 },
  { id: 'router', changesPerMonth: 2, complexity: 12 },
]
const hot = hotspot(modules)
eq(hot[0].id, 'compressor', '热点最高的是 compressor')
near(hot[0].H, 100, 1e-9, '热点值 4×25 = 100')
near(hot.find((m) => m.id === 'codec').H, 9, 1e-9, '对照组热点值 0.2×45 = 9')
near(hot[0].H / hot.find((m) => m.id === 'codec').H, 11.111, 1e-3, '两者相差约 11.1 倍')
eq(byComplexity(modules)[0].id, 'codec', '按复杂度排序时 codec 第一')
ok(byComplexity(modules)[0].id !== hot[0].id, '热点排序与复杂度排序不同（命题 1.3.3）')
eq(hotspot([]).length, 0, '空输入不报错')

// 定义 1.3.6：隐藏度
near(hiddenness(12, 6), -1, 1e-9, '暴露 12、职责 6 时隐藏度为 -1')
near(hiddenness(3, 6), 0.5, 1e-9, '暴露 3、职责 6 时隐藏度为 0.5')
near(hiddenness(6, 6), 0, 1e-9, '暴露等于职责时隐藏度为 0')
ok(hiddenness(12, 6) < 0, '隐藏度为负表示暴露多于职责')

// 工具箱 5.4：波及面
const graph = new Map([['core', ['api']], ['api', ['ui']], ['ui', []]])
eq(impact('core', graph).sort(), ['api', 'core', 'ui'], '改 core 波及 api 与 ui')
eq(impact('ui', graph), ['ui'], '改末端模块只波及自己')
near(verifiedShare(['core', 'api', 'ui'], new Set(['core', 'api'])), 2 / 3, 1e-9, '带测试比例 2/3')
near(verifiedShare([], new Set()), 1, 1e-9, '空集合的比例定义为 1')
near(verifiedShare(['a'], new Set()), 0, 1e-9, '无测试时比例为 0')

// 命题 1.3.1：目的句校验
ok(checkGoal('这个改动会不会影响缓存？').ok, '问句形式的目的通过')
ok(!checkGoal('读代码').ok, '动作描述不通过')
ok(!checkGoal('').ok, '空目的不通过')
ok(!checkGoal('熟悉一下这个模块').ok, '模糊表述不通过')
ok(checkGoal('异常路径是否会跳过日志写入？').ok, '具体问句通过')

// 工具箱 5.5：模块卡片
eq(MODULE_CARD_FIELDS.length, 6, '模块卡片有六项字段')
ok(MODULE_CARD_FIELDS.includes('约束清单'), '卡片含约束清单')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
