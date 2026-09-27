// 1.4 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  OBSERVABLE_KINDS, validateContract, implicitSurface, findBreakingCall,
  preconditionStrengthened, postconditionWeakened, substitutionCompatible,
  deprecationWindow, bumpVersion,
} from './sa18_contract.mjs'

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

// 定义 1.4.1：契约校验
const full = { precondition: () => true, postcondition: () => true, invariants: ['非负'] }
ok(validateContract(full).ok, '三类齐备时通过')
eq(validateContract({ ...full, precondition: undefined }).missing, ['前置条件'], '缺前置被指出')
eq(validateContract({ ...full, postcondition: undefined }).missing, ['后置条件'], '缺后置被指出')
eq(validateContract({ ...full, invariants: [] }).missing, ['不变量'], '缺不变量被指出')
eq(validateContract({}).missing.length, 3, '全缺时列出三项')

// 定义 1.4.4：隐式依赖面
eq(OBSERVABLE_KINDS.length, 5, '可观察面有五类')
eq(implicitSurface(['返回值', '错误'], OBSERVABLE_KINDS), ['副作用', '时序', '资源'], '隐式面是剩余三类')
eq(implicitSurface(OBSERVABLE_KINDS, OBSERVABLE_KINDS).length, 0, '契约写全时无隐式面')
eq(implicitSurface([], OBSERVABLE_KINDS).length, 5, '契约未写时隐式面为全部')

// 定义 1.4.3 / 命题 1.4.1：破坏性判定
const calls = [{ n: 0 }, { n: 1 }, { n: -1 }, { n: null }]
const oldIface = { precondition: () => true, observe: (c) => JSON.stringify(c) }
const newRequired = { precondition: (c) => c.n !== null && c.n !== undefined, observe: (c) => JSON.stringify(c) }
const b1 = findBreakingCall(oldIface, newRequired, calls)
ok(b1.breaking, '加必填参数是破坏性的')
eq(b1.reason, '前置被加强', '原因是前置加强')
eq(b1.call, { n: null }, '反例是原本合法、改动后非法的那个调用')
const newBehavior = { precondition: () => true, observe: (c) => JSON.stringify({ ...c, extra: 1 }) }
eq(findBreakingCall(oldIface, newBehavior, calls).reason, '可观察行为改变', '签名不变而行为改变也被检出')
ok(!findBreakingCall(oldIface, oldIface, calls).breaking, '无改动时不破坏')
ok(!findBreakingCall(oldIface, oldIface, []).breaking, '无候选调用时找不到反例')

// 命题 1.4.2 / 1.4.3
ok(preconditionStrengthened(() => true, (c) => c.n !== null, calls), '前置加强被检出')
ok(!preconditionStrengthened(() => true, () => true, calls), '前置未变时不报')
ok(postconditionWeakened(['sorted'], []), '后置削弱被检出（不再承诺排序）')
ok(!postconditionWeakened(['sorted'], ['sorted']), '后置未变时不报')
ok(!postconditionWeakened(['sorted'], ['sorted', 'bounded']), '后置加强时不报')
ok(postconditionWeakened(['sorted', 'bounded'], ['sorted']), '丢掉其中一项承诺即削弱')

// 命题 1.4.5：替换兼容
const sup = { preconditionLevel: 2, postconditionLevel: 2, invariants: ['非负', '幂等'] }
ok(substitutionCompatible(sup, { preconditionLevel: 1, postconditionLevel: 3, invariants: ['非负', '幂等', '有界'] }).ok, '三条都满足时兼容')
ok(!substitutionCompatible(sup, { preconditionLevel: 3, postconditionLevel: 3, invariants: ['非负', '幂等'] }).ok, '前置加强时不兼容')
ok(!substitutionCompatible(sup, { preconditionLevel: 1, postconditionLevel: 1, invariants: ['非负', '幂等'] }).ok, '后置减弱时不兼容')
ok(!substitutionCompatible(sup, { preconditionLevel: 1, postconditionLevel: 3, invariants: ['非负'] }).ok, '丢失不变量时不兼容')
eq(substitutionCompatible(sup, { preconditionLevel: 3, postconditionLevel: 1, invariants: [] }).checks.postconditionStronger, false, '逐条给出判定')

// 命题 1.4.6：弃用窗口
const w = deprecationWindow([2, 6, 20])
near(w.min, 20, 1e-9, '窗口取最大值 20 周')
near(w.mean, 9.333, 1e-3, '平均值约 9.3 周')
near(w.min / w.mean, 2.142, 1e-3, '窗口与平均值之比约 2.14')
eq(w.min, w.max, 'min 与 max 都表示窗口')
eq(deprecationWindow([]).min, 0, '无调用方时窗口为 0')
near(deprecationWindow([4]).min, 4, 1e-9, '单个调用方时窗口等于它的迁移时间')

// 版本推导
eq(bumpVersion('1.4.2', 'breaking'), '2.0.0', '破坏性改动升主版本')
eq(bumpVersion('1.4.2', 'feature'), '1.5.0', '兼容新增升次版本')
eq(bumpVersion('1.4.2', 'fix'), '1.4.3', '修改升补丁')
eq(bumpVersion('2.0.0', 'breaking'), '3.0.0', '主版本归零后继续递增')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
