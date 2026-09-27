// 1.4 配备算例：契约校验、隐式面、破坏性判定、替换兼容、弃用窗口、版本推导。
//
// 每个函数对应讲义 1.4 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa18_contract.mjs
import { pathToFileURL } from 'node:url'

/** 定义 1.4.4：可观察面的五类。 */
export const OBSERVABLE_KINDS = ['返回值', '错误', '副作用', '时序', '资源']

/**
 * 定义 1.4.1：契约校验——前置、后置、不变量三类缺一不可。
 * @param contract `{ precondition, postcondition, invariants }` @returns `{ ok, missing }`
 */
export function validateContract(contract) {
  const missing = []
  if (typeof contract.precondition !== 'function') missing.push('前置条件')
  if (typeof contract.postcondition !== 'function') missing.push('后置条件')
  if (!Array.isArray(contract.invariants) || contract.invariants.length === 0) missing.push('不变量')
  return { ok: missing.length === 0, missing }
}

/**
 * 定义 1.4.4：隐式依赖面 = 可观察面中未被契约写明的部分。
 * @param contractKinds 契约写明的可观察类别 @param observedKinds 实际可观察类别
 * @returns 隐式面类别数组
 */
export function implicitSurface(contractKinds, observedKinds) {
  return observedKinds.filter((k) => !contractKinds.includes(k))
}

/**
 * 定义 1.4.3 / 命题 1.4.1：破坏性判定——找一个原本合法的调用作反例。
 * @param oldIface `{ precondition, observe }` @param newIface 同结构
 * @param candidates 候选调用数组
 * @returns `{ breaking, call, reason }`
 */
export function findBreakingCall(oldIface, newIface, candidates) {
  const legalBefore = candidates.filter((c) => oldIface.precondition(c))
  for (const c of legalBefore) {
    if (!newIface.precondition(c)) return { breaking: true, call: c, reason: '前置被加强' }
    if (oldIface.observe(c) !== newIface.observe(c)) return { breaking: true, call: c, reason: '可观察行为改变' }
  }
  return { breaking: false, call: null, reason: '未找到反例' }
}

/**
 * 命题 1.4.2：前置是否被加强。
 * @param oldPre 旧前置 @param newPre 新前置 @param candidates 候选调用
 * @returns 是否加强
 */
export function preconditionStrengthened(oldPre, newPre, candidates) {
  return candidates.some((c) => oldPre(c) && !newPre(c))
}

/**
 * 命题 1.4.3：后置是否被削弱。后置用「承诺集合」表示，
 * 因为谓词形式无法表达"不再做任何承诺"（`() => true` 是恒成立，不是无承诺）。
 * @param oldPost 旧承诺数组 @param newPost 新承诺数组
 * @returns 是否存在旧承诺未被新承诺覆盖
 */
export function postconditionWeakened(oldPost, newPost) {
  return oldPost.some((p) => !newPost.includes(p))
}

/**
 * 命题 1.4.5：替换兼容三条件。
 * @param sup 父类型 `{ preconditionLevel, postconditionLevel, invariants }`
 * @param sub 子类型 同结构
 * @returns `{ ok, checks }`
 */
export function substitutionCompatible(sup, sub) {
  const checks = {
    preconditionWeaker: sub.preconditionLevel <= sup.preconditionLevel,
    postconditionStronger: sub.postconditionLevel >= sup.postconditionLevel,
    invariantsKept: sup.invariants.every((i) => sub.invariants.includes(i)),
  }
  return { ok: Object.values(checks).every(Boolean), checks }
}

/**
 * 定义 1.4.6 / 命题 1.4.6：弃用窗口 = 最慢的调用方迁移时间。
 * @param migrationWeeks 各调用方的迁移周数 @returns `{ min, mean, max }`
 */
export function deprecationWindow(migrationWeeks) {
  if (migrationWeeks.length === 0) return { min: 0, mean: 0, max: 0 }
  const sum = migrationWeeks.reduce((a, b) => a + b, 0)
  return {
    min: Math.max(...migrationWeeks),
    mean: sum / migrationWeeks.length,
    max: Math.max(...migrationWeeks),
  }
}

/**
 * 版本号推导：破坏性升主版本，兼容新增升次版本，修改升补丁。
 * @param version 形如 `1.4.2` @param kind 'breaking' | 'feature' | 'fix'
 * @returns 新版本号
 */
export function bumpVersion(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number)
  if (kind === 'breaking') return `${major + 1}.0.0`
  if (kind === 'feature') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(46)} ${v}`)

  // 契约
  const full = { precondition: () => true, postcondition: () => true, invariants: ['非负'] }
  line('契约校验（齐备）', JSON.stringify(validateContract(full).ok))
  line('契约校验（缺不变量）', JSON.stringify(validateContract({ ...full, invariants: [] }).missing))
  line('隐式依赖面（契约只写两类）', implicitSurface(['返回值', '错误'], OBSERVABLE_KINDS).join('、'))
  line('隐式面项数', implicitSurface(['返回值', '错误'], OBSERVABLE_KINDS).length)

  // 破坏性判定
  const calls = [{ n: 0 }, { n: 1 }, { n: -1 }, { n: null }]
  const oldIface = { precondition: () => true, observe: (c) => JSON.stringify(c) }
  const newRequired = { precondition: (c) => c.n !== null && c.n !== undefined, observe: (c) => JSON.stringify(c) }
  line('加必填参数（原合法调用含 null）', JSON.stringify(findBreakingCall(oldIface, newRequired, calls)))
  const newBehavior = { precondition: () => true, observe: (c) => JSON.stringify({ ...c, extra: 1 }) }
  line('签名不变而行为改变', JSON.stringify(findBreakingCall(oldIface, newBehavior, calls).reason))
  const compatible = { precondition: () => true, observe: (c) => JSON.stringify(c) }
  line('无改动', JSON.stringify(findBreakingCall(oldIface, compatible, calls)))

  line('前置加强判定', preconditionStrengthened(() => true, (c) => c.n !== null, calls))
  line('后置削弱判定（排序 → 顺序未定义）', postconditionWeakened(['sorted'], []))
  line('后置加强判定（sorted → sorted + bounded）', postconditionWeakened(['sorted'], ['sorted', 'bounded']))

  // 替换兼容
  const sup = { preconditionLevel: 2, postconditionLevel: 2, invariants: ['非负', '幂等'] }
  line('替换兼容（三条都满足）', JSON.stringify(substitutionCompatible(sup, { preconditionLevel: 1, postconditionLevel: 3, invariants: ['非负', '幂等', '有界'] }).ok))
  line('替换兼容（削弱后置）', JSON.stringify(substitutionCompatible(sup, { preconditionLevel: 1, postconditionLevel: 1, invariants: ['非负', '幂等'] }).checks))
  line('替换兼容（丢失不变量）', JSON.stringify(substitutionCompatible(sup, { preconditionLevel: 1, postconditionLevel: 3, invariants: ['非负'] }).ok))

  // 弃用窗口
  const w = deprecationWindow([2, 6, 20])
  line('弃用窗口（2/6/20 周）', w.min + ' 周')
  line('平均值（对照）', w.mean.toFixed(1) + ' 周')
  line('窗口与平均值之比', (w.min / w.mean).toFixed(2))
  line('窗口（无调用方）', deprecationWindow([]).min + ' 周')

  // 版本
  line('破坏性改动 1.4.2 →', bumpVersion('1.4.2', 'breaking'))
  line('兼容新增 1.4.2 →', bumpVersion('1.4.2', 'feature'))
  line('修正 1.4.2 →', bumpVersion('1.4.2', 'fix'))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
