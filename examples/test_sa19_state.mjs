// 1.5 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  STATE_KINDS, LEVELS, COST_BY_LEVEL, classifyState, checkSourceOfTruth,
  reversibilityLevel, tolerableDefectRate, coverageWindow, boundedPolicy,
  atomicSwitch, recoverFrom, copyBehavior,
} from './sa19_state.mjs'

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

// 定义 1.5.1：状态三分类
eq(STATE_KINDS.length, 3, '状态有三类')
eq(classifyState(false), 'authoritative', '不可重建的是权威状态')
eq(classifyState(true), 'derived', '可重建的是派生状态')
eq(classifyState(true, true), 'ephemeral', '一次操作内的生命周期的临时状态')
eq(classifyState(false, true), 'ephemeral', '临时优先于权威判定')

// 定义 1.5.2：真相源唯一性
ok(checkSourceOfTruth({ a: ['x'], b: ['y'] }).ok, '各状态单一所有者时通过')
eq(checkSourceOfTruth({ a: ['x'], b: ['x'] }).duplicated.length, 1, '一个状态两个所有者被检出')
eq(checkSourceOfTruth({ a: ['x'], b: ['x'] }).duplicated[0][0], 'x', '重复的状态名被列出')
ok(!checkSourceOfTruth({ a: ['x'], b: ['x'] }).ok, '双写时不通过')
ok(checkSourceOfTruth({}).ok, '空映射通过')
ok(checkSourceOfTruth({ a: [] }).ok, '无人拥有的状态不算重复')

// 定义 1.5.3：可逆性四级
eq(LEVELS.length, 4, '可逆性有四级')
eq(reversibilityLevel({}), 'L0', '只动内存是 L0')
eq(reversibilityLevel({ writesLocalData: true }), 'L1', '写本地数据是 L1')
eq(reversibilityLevel({ crossesMachines: true }), 'L2', '跨机器是 L2')
eq(reversibilityLevel({ spansMultipleStores: true }), 'L2', '跨多个存储是 L2')
eq(reversibilityLevel({ touchesExternalWorld: true }), 'L3', '触及外部世界是 L3')
eq(reversibilityLevel({ writesLocalData: true, touchesExternalWorld: true }), 'L3', '外部优先于本地')

// 命题 1.5.3：可容忍缺陷率随等级递减
near(tolerableDefectRate('L0'), 10, 1e-9, 'L0 可容忍缺陷率 10')
near(tolerableDefectRate('L1'), 1, 1e-9, 'L1 可容忍缺陷率 1')
near(tolerableDefectRate('L2'), 0.1, 1e-9, 'L2 可容忍缺陷率 0.1')
near(tolerableDefectRate('L3'), 0.01, 1e-9, 'L3 可容忍缺陷率 0.01')
near(tolerableDefectRate('L0') / tolerableDefectRate('L3'), 1000, 1e-9, 'L0 与 L3 相差 1000 倍')
ok(tolerableDefectRate('L0') > tolerableDefectRate('L3'), '等级越高可容忍缺陷率越低')
eq(COST_BY_LEVEL.L3, 100, 'L3 的回滚代价为 100')
let threw = false
try { tolerableDefectRate('L9') } catch { threw = true }
ok(threw, '未知等级抛错')

// 命题 1.5.4：覆盖窗口
near(coverageWindow(1000, 5), 200, 1e-9, 'C=1000、r=5 时覆盖窗口 200 秒')
near(coverageWindow(1000, 50), 20, 1e-9, '速率上升十倍窗口缩到二十分之一')
near(coverageWindow(3000, 5), 600, 1e-9, '3000 条容量对应 600 秒')
eq(coverageWindow(1000, 0), Number.POSITIVE_INFINITY, '速率为 0 时窗口无限')
ok(coverageWindow(1000, 5) > coverageWindow(1000, 50), '速率越高窗口越短')

// 命题 1.5.5：有界策略
ok(boundedPolicy('fail').observable, 'fail 策略有信号')
ok(boundedPolicy('dropOldest', 12).observable, 'dropOldest 策略有信号')
ok(boundedPolicy('spill').observable, 'spill 策略有信号')
ok(!boundedPolicy('whatever').observable, '未知策略无可观测信号（缺陷）')
eq(boundedPolicy('dropOldest', 12).signal.includes('12'), true, '淘汰计数出现在信号里')

// 工具箱 5.3：原子切换
const steps = atomicSwitch('/tmp/new', '/data/state')
eq(steps.length, 3, '原子切换是三步')
eq(steps[1].action, 'fsync', '第二步落盘')
eq(steps[2].action, 'rename', '第三步重命名')
eq(steps[2].to, '/data/state', '重命名到目标位置')

// 命题 1.5.6：日志恢复
const log = [
  { op: { set: 1 }, applied: true },
  { op: { set: 2 }, applied: false },
]
eq(recoverFrom(log, (s, op) => op.set, 0), 2, '恢复时跳过已应用条目并重做其余')
eq(recoverFrom([], (s) => s, 42), 42, '空日志不改变状态')
eq(recoverFrom([{ op: { set: 7 }, applied: true }], (s) => 0, 5), 5, '全部已应用时状态不变')

// 命题 1.5.2：浅复制与深复制
eq(copyBehavior({ tags: ['a'] }, true).changed, 'followed', '浅复制的副本随原件变化')
eq(copyBehavior({ tags: ['a'] }, false).changed, 'isolated', '深复制的副本不受原件影响')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
