// 3.2 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  evaluate, orderInvariance, bypassPaths, tokenValid,
  greedyPermissions, reviewRate, harmonic, rngFrom, shuffle,
} from './sa07_guard.mjs'

let pass = 0
let fail = 0
const near = (a, b, tol, label) => {
  if (Math.abs(a - b) <= tol) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${a}，期望 ${b}`)
}
const eq = (a, b, label) => {
  // 用 JSON 比较而非 ===：数组与对象在 === 下是引用比较，会把相等的值判为不等
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}`)
}
const ok = (c, label) => {
  if (c) { pass++; return }
  fail++
  console.log(`不通过：${label}`)
}

// 命题 3.2.1：先拒后允，与规则顺序无关
const rules = [
  { match: (c) => c.action === 'delete', decision: 'Allow' },
  { match: (c) => c.path?.startsWith('/etc'), decision: 'Deny' },
]
eq(evaluate(rules, { action: 'delete', path: '/etc/passwd' }), 'Deny', 'Allow 在前仍判 Deny（上界优先）')
eq(evaluate(rules, { action: 'delete', path: '/tmp/a' }), 'Allow', '范围外路径被允许')
eq(evaluate(rules, { action: 'unknown' }), 'Deny', '无规则匹配时默认拒绝')
eq(evaluate([{ match: () => true, decision: 'Ask' }], { action: 'x' }), 'Ask', 'Ask 分支')
eq(evaluate([{ match: () => true, decision: 'Ask' }, { match: () => true, decision: 'Allow' }], { action: 'x' }), 'Ask', 'Ask 优先于 Allow')

// 命题 3.2.1：随机规则集与随机调用上的打乱一致性
for (let t = 0; t < 30; t++) {
  const rng = rngFrom(1000 + t)
  const rs = []
  for (let i = 0; i < 6; i++) {
    const target = Math.floor(rng() * 3)
    const dec = ['Allow', 'Deny', 'Ask'][Math.floor(rng() * 3)]
    rs.push({ match: (c) => c.action === target, decision: dec })
  }
  const calls = [0, 1, 2, 9].map((a) => ({ action: a }))
  ok(orderInvariance(rs, calls, 100, 7 + t).ok, `第 ${t} 组随机规则集满足顺序不变性`)
}

// 命题 3.2.3：完全中介
const graph = {
  entry: 'model',
  effects: new Set(['write-fs']),
  edges: new Map([
    ['model', ['guard', 'direct-path']],
    ['guard', ['write-fs']],
    ['direct-path', ['write-fs']],
  ]),
}
eq(bypassPaths(graph, ['guard']).length, 1, '漏一条路径就有绕过（返回 1 个节点）')
eq(bypassPaths(graph, ['guard', 'direct-path']).length, 0, '覆盖全部路径即无绕过')
eq(bypassPaths(graph, []).length, 1, '完全不设守卫时存在绕过')

// 命题 3.2.2：令牌范围与审批外溢
const narrow = { capability: 'delete', scope: ['/tmp/'], expiry: 1000 }
ok(tokenValid(narrow, { capability: 'delete', args: { path: '/tmp/a' } }, 500), '范围内未过期令牌有效')
ok(!tokenValid(narrow, { capability: 'delete', args: { path: '/etc/passwd' } }, 500), '范围外令牌无效')
ok(!tokenValid(narrow, { capability: 'delete', args: { path: '/tmp/a' } }, 2000), '过期令牌无效')
ok(!tokenValid({ capability: 'delete', scope: [], expiry: 1000 }, { capability: 'delete', args: { path: '/tmp/a' } }, 500), '空范围令牌无效')
ok(!tokenValid(narrow, { capability: 'read', args: { path: '/tmp/a' } }, 500), '能力类不匹配时无效')
// 反例：无范围令牌会放行范围外调用，这就是审批外溢
const unscoped = { capability: 'delete', scope: ['/'], expiry: 1000 }
ok(tokenValid(unscoped, { capability: 'delete', args: { path: '/etc/passwd' } }, 500), '反例：无范围令牌放行了范围外调用')

// 工具箱 5.1：最小权限贪心
const grants = new Map([
  ['grant-read', new Set(['fs:read'])],
  ['grant-write', new Set(['fs:write'])],
  ['grant-narrow', new Set(['fs:read', 'fs:write'])],
])
eq(greedyPermissions(['fs:read', 'fs:write'], grants), ['grant-narrow'], '贪心选覆盖最多的一项')
eq(greedyPermissions(['net:connect'], grants), null, '需求无法覆盖时返回 null')
eq(greedyPermissions([], grants), [], '无需求时返回空集')
near(harmonic(8), 2.7179, 1e-4, 'H_8（贪心近似比上界）')
near(harmonic(1), 1, 1e-12, 'H_1')

// 命题 3.2.5 / 工具箱 5.4：审批预算
near(reviewRate(0.5, 1), 1.0, 1e-9, 'ρ=0.5, n=1 审阅率')
near(reviewRate(0.5, 5), 0.388, 1e-3, 'ρ=0.5, n=5 审阅率')
near(reviewRate(0.5, 10), 0.200, 1e-3, 'ρ=0.5, n=10 审阅率')
near(reviewRate(1, 10), 1.0, 1e-9, 'ρ=1 无衰减时审阅率恒为 1')
near(reviewRate(0.8, 5), 0.672, 1e-3, 'ρ=0.8, n=5 审阅率')
ok(reviewRate(0.5, 10) < reviewRate(0.5, 5), '审阅率随审批次数下降')

// 辅助函数的确定性
const a = shuffle([1, 2, 3, 4, 5], rngFrom(42))
const b = shuffle([1, 2, 3, 4, 5], rngFrom(42))
eq(JSON.stringify(a), JSON.stringify(b), '同一 seed 的洗牌结果可复现')
eq(a.length, 5, '洗牌不改变长度')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
