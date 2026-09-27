// 3.2 配备算例：守卫判定、顺序不变性、完全中介、令牌范围、最小权限、审批预算。
//
// 每个函数对应讲义 3.2 的一条命题，数值与讲义「八、判据与数字回归」的表一致。
// 只用标准库，可单独运行：node examples/sa07_guard.mjs
import { pathToFileURL } from 'node:url'

/** 可复现的伪随机数发生器（mulberry32）。@param seed 种子 @returns 返回 [0,1) 的函数 */
export function rngFrom(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates 洗牌（不改原数组）。@param arr 输入数组 @param rng 随机数函数 @returns 新数组 */
export function shuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 命题 3.2.1 / 定义 3.2.3：先拒后允求值。
 * @param rules 规则数组，每项形如 `{ match(call), decision }`
 * @param call 调用对象
 * @returns 'Deny' | 'Ask' | 'Allow'
 */
export function evaluate(rules, call) {
  let ask = null
  let allow = null
  for (const r of rules) {
    if (!r.match(call)) continue
    if (r.decision === 'Deny') return 'Deny' // 上界一旦命中立即返回
    if (r.decision === 'Ask' && ask === null) ask = 'Ask'
    if (r.decision === 'Allow' && allow === null) allow = 'Allow'
  }
  return ask ?? allow ?? 'Deny' // 默认拒绝
}

/**
 * 命题 3.2.1：顺序不变性检验——打乱规则表后判定结果必须一致。
 * @param rules 规则数组 @param calls 测试调用数组
 * @param m 每个调用的打乱次数 @param seed 随机种子
 * @returns {{ok: boolean, call: object|null}}
 */
export function orderInvariance(rules, calls, m = 200, seed = 1) {
  const rng = rngFrom(seed)
  for (const call of calls) {
    const base = evaluate(rules, call)
    for (let i = 0; i < m; i++) {
      if (evaluate(shuffle(rules, rng), call) !== base) return { ok: false, call }
    }
  }
  return { ok: true, call: null }
}

/**
 * 命题 3.2.3：完全中介检验——删除守卫后仍能到达的副作用节点即失去保护。
 * @param graph `{ entry, effects: Set, edges: Map<string, string[]> }`
 * @param guards 守卫节点名数组
 * @returns 失去保护的副作用节点数组
 */
export function bypassPaths(graph, guards) {
  const blocked = new Set(guards)
  const seen = new Set()
  const stack = [graph.entry]
  const found = []
  while (stack.length) {
    const v = stack.pop()
    if (seen.has(v)) continue
    seen.add(v)
    if (graph.effects.has(v)) { found.push(v); continue }
    for (const w of graph.edges.get(v) ?? []) if (!blocked.has(w)) stack.push(w)
  }
  return found
}

/**
 * 定义 3.2.4 / 命题 3.2.2：令牌范围校验。三项缺一即无效。
 * @param token `{ capability, scope: string[], expiry: number }`
 * @param call `{ capability, args: { path?: string } }`
 * @param now 当前时刻（毫秒）
 * @returns 令牌对该调用是否有效
 */
export function tokenValid(token, call, now) {
  if (!token || !call) return false
  if (token.capability !== call.capability) return false
  if (now >= token.expiry) return false
  if (!Array.isArray(token.scope) || token.scope.length === 0) return false
  return token.scope.some((prefix) => (call.args?.path ?? '').startsWith(prefix))
}

/**
 * 工具箱 5.1：最小权限集的贪心近似。
 * @param required 必需能力名数组 @param grants `Map<string, Set<string>>` 授予项到它覆盖的能力
 * @returns 选中的授予项名数组，或 null（需求无法被覆盖）
 */
export function greedyPermissions(required, grants) {
  const need = new Set(required)
  const chosen = []
  while (need.size > 0) {
    let best = null
    let bestCover = -1
    for (const [name, covers] of grants) {
      const hit = [...covers].filter((c) => need.has(c)).length
      if (hit > bestCover) { bestCover = hit; best = name }
    }
    if (bestCover <= 0) return null
    chosen.push(best)
    for (const c of grants.get(best)) need.delete(c)
  }
  return chosen
}

/**
 * 命题 3.2.5 / 工具箱 5.4：注意力衰减模型下的平均审阅率。
 * @param rho 每次审批后的注意力保留率（0 < rho <= 1）
 * @param n 审批次数
 * @returns 平均审阅率 Q(n)，取 q_0 = 1
 */
export function reviewRate(rho, n) {
  if (rho === 1) return 1
  return (1 - Math.pow(rho, n)) / (n * (1 - rho))
}

/** 工具箱 5.1：第 n 个调和数 H_n（贪心近似比的上界）。@param n 项数 @returns H_n */
export function harmonic(n) {
  let s = 0
  for (let i = 1; i <= n; i++) s += 1 / i
  return s
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(38)} ${v}`)

  // 判定与顺序
  const rules = [
    { match: (c) => c.action === 'delete', decision: 'Allow' },
    { match: (c) => c.path?.startsWith('/etc'), decision: 'Deny' },
  ]
  line('evaluate(删 /etc/passwd)', evaluate(rules, { action: 'delete', path: '/etc/passwd' }))
  line('evaluate(删 /tmp/a)', evaluate(rules, { action: 'delete', path: '/tmp/a' }))
  line('evaluate(未知动作)', evaluate(rules, { action: 'unknown' }))
  line('orderInvariance', JSON.stringify(orderInvariance(rules, [
    { action: 'delete', path: '/etc/passwd' },
    { action: 'delete', path: '/tmp/a' },
    { action: 'unknown' },
  ]).ok))

  // 完全中介
  const graph = {
    entry: 'model',
    effects: new Set(['write-fs']),
    edges: new Map([
      ['model', ['guard', 'direct-path']],
      ['guard', ['write-fs']],
      ['direct-path', ['write-fs']],
    ]),
  }
  line('bypassPaths（守卫只挡一条路）', JSON.stringify(bypassPaths(graph, ['guard'])))
  line('bypassPaths（两条路都挡）', JSON.stringify(bypassPaths(graph, ['guard', 'direct-path'])))

  // 令牌
  const tok = { capability: 'delete', scope: ['/tmp/'], expiry: 1000 }
  line('tokenValid(范围内, 未过期)', tokenValid(tok, { capability: 'delete', args: { path: '/tmp/a' } }, 500))
  line('tokenValid(范围外)', tokenValid(tok, { capability: 'delete', args: { path: '/etc/passwd' } }, 500))
  line('tokenValid(已过期)', tokenValid(tok, { capability: 'delete', args: { path: '/tmp/a' } }, 2000))

  // 最小权限
  const grants = new Map([
    ['grant-read', new Set(['fs:read'])],
    ['grant-write', new Set(['fs:write'])],
    ['grant-narrow', new Set(['fs:read', 'fs:write'])],
  ])
  line('greedyPermissions(读+写)', JSON.stringify(greedyPermissions(['fs:read', 'fs:write'], grants)))
  line('greedyPermissions(需求无法覆盖)', JSON.stringify(greedyPermissions(['net:connect'], grants)))

  // 审批预算
  line('reviewRate(ρ=0.5, n=1)', reviewRate(0.5, 1).toFixed(3))
  line('reviewRate(ρ=0.5, n=5)', reviewRate(0.5, 5).toFixed(3))
  line('reviewRate(ρ=0.5, n=10)', reviewRate(0.5, 10).toFixed(3))
  line('reviewRate(ρ=1, n=10)', reviewRate(1, 10).toFixed(3))
  line('reviewRate(ρ=0.8, n=5)', reviewRate(0.8, 5).toFixed(3))
  line('harmonic(8)', harmonic(8).toFixed(4))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
