#!/usr/bin/env node
/**
 * depgraph.mjs —— 依赖图与结构诊断器（作业预置工具）
 *
 * 它替你做掉机械计数，把判断留给你：生成依赖图、标出跨层依赖、
 * 循环依赖、高扇入/高扇出的模块，以及依赖链最长的模块。
 *
 * 用法：
 *   node tools/depgraph.mjs --repo D:\dsh-mini                  # 全仓诊断
 *   node tools/depgraph.mjs --repo D:\dsh-mini --module kernel/agent.ts
 *   node tools/depgraph.mjs --repo D:\dsh-mini --levels         # 只打印分层图
 *   node tools/depgraph.mjs --repo D:\dsh-mini --json           # 机器可读输出
 *
 * 依赖：Node 18+，无第三方包。
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const REPO = argOf('--repo', 'D:\\dsh-mini')
const ONLY = argOf('--module', null)
const AS_JSON = args.includes('--json')
const LEVELS_ONLY = args.includes('--levels')

/**
 * 分层表。数值越小层级越高；依赖只允许从高层指向低层（level 小 → level 大）。
 * 这张表是本作业的判定口径，改它等于改判据。
 */
const LAYERS = [
  { dir: 'apps', level: 1, name: '界面层' },
  { dir: 'demos', level: 1, name: '演示层' },
  { dir: 'plugins', level: 2, name: '能力层' },
  { dir: 'evolution', level: 2, name: '进化层' },
  { dir: 'framework', level: 3, name: '框架层' },
  { dir: 'kernel', level: 4, name: '纯能力层' },
]

const layerOf = (rel) => {
  const top = rel.split('/')[0]
  return LAYERS.find((l) => l.dir === top) ?? { dir: top, level: 99, name: '（未登记）' }
}

async function walk(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'lib') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

const canon = (p) => {
  const s = p.replace(/\\/g, '/')
  const i = s.indexOf('/src/')
  return i >= 0 ? s.slice(i + 5) : s.replace(/^.*\/src\//, '')
}

/**
 * 匹配 import/export ... from '...'，并捕获是否存在 `type` 前缀。
 *
 * `import type { X } from './y.ts'` 在编译后被擦除，运行时不产生依赖，
 * 因此它不算跨层违规，也不算循环依赖——但它仍然是一种结构耦合，
 * 所以工具会单独列出来，由你判断要不要在意。
 */
const IMPORT_RE = /\bimport\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g

/** 返回 { value, typeOnly } 两组相对导入说明符。 */
function relImports(src) {
  const value = []
  const typeOnly = []
  for (const m of src.matchAll(IMPORT_RE)) {
    const isType = Boolean(m[1])
    const spec = m[2]
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue
    ;(isType ? typeOnly : value).push(spec)
  }
  return { value, typeOnly }
}

function resolveSpec(fromRel, spec) {
  const parts = `${fromRel.slice(0, fromRel.lastIndexOf('/'))}/${spec}`.split('/')
  const stack = []
  for (const p of parts) {
    if (p === '.' || p === '') continue
    if (p === '..') stack.pop()
    else stack.push(p)
  }
  return stack.join('/').replace(/\.ts$/, '')
}

// ------------------------------------------------------------------ 构图

const files = (await walk(join(REPO, 'src'))).map(canon)
const out = new Map() // modKey -> Set(depKey)          值依赖（运行时真实存在）
const typeOut = new Map() // modKey -> Set(depKey)      仅类型依赖（编译后擦除）
const innValue = new Map() // modKey -> Set(dependerKey) 用值的依赖者
const innType = new Map() // modKey -> Set(dependerKey) 只用类型的依赖者

const push = (map, k, v) => {
  if (!map.has(k)) map.set(k, new Set())
  map.get(k).add(v)
}

for (const rel of files) {
  const src = await readFile(join(REPO, 'src', rel), 'utf8')
  const key = rel.replace(/\.ts$/, '')
  const { value: valueSpecs, typeOnly: typeSpecs } = relImports(src)
  const deps = new Set(valueSpecs.map((s) => resolveSpec(rel, s)))
  const tdeps = new Set(typeSpecs.map((s) => resolveSpec(rel, s)))
  out.set(key, deps)
  typeOut.set(key, tdeps)
  for (const d of deps) push(innValue, d, key)
  for (const d of tdeps) if (!deps.has(d)) push(innType, d, key)
}
for (const k of out.keys()) {
  if (!innValue.has(k)) innValue.set(k, new Set())
  if (!innType.has(k)) innType.set(k, new Set())
}

/** 全部依赖者（值 ∪ 类型）。 */
const innAll = (k) => new Set([...(innValue.get(k) ?? []), ...(innType.get(k) ?? [])])

// ------------------------------------------------------------------ 分析

const crossLayer = []
for (const [from, deps] of out) {
  for (const to of deps) {
    if (!out.has(to)) continue
    const lf = layerOf(from)
    const lt = layerOf(to)
    if (lf.level > lt.level) crossLayer.push({ from, to, fromLayer: lf.name, toLayer: lt.name })
  }
}

// 循环依赖：只在两模块的小环里找，长的环噪声太大
const cycles = []
for (const [a, deps] of out) {
  for (const b of deps) {
    if (!out.has(b)) continue
    if (out.get(b)?.has(a) && a < b) cycles.push([a, b])
  }
}

// 类型层面的环：一边是值依赖、另一边只是 import type。运行时不存在，但仍是耦合。
const typeCycles = []
for (const [a, deps] of out) {
  for (const b of deps) if (typeOut.get(b)?.has(a) && a < b) typeCycles.push([a, b, 'a 用值、b 用类型'])
}
for (const [a, deps] of typeOut) {
  for (const b of deps) if (out.get(b)?.has(a) && a < b) typeCycles.push([a, b, 'a 用类型、b 用值'])
}

// 依赖深度：从每个模块出发的最长路径（用记忆化 DFS，遇到环就截断）
const depth = new Map()
const visiting = new Set()
function depthOf(k) {
  if (depth.has(k)) return depth.get(k)
  if (visiting.has(k)) return 0
  visiting.add(k)
  let best = 1
  for (const d of out.get(k) ?? []) {
    if (!out.has(d)) continue
    best = Math.max(best, 1 + depthOf(d))
  }
  visiting.delete(k)
  depth.set(k, best)
  return best
}
for (const k of out.keys()) depthOf(k)

const rank = (m) =>
  [...m.entries()]
    .map(([k, v]) => ({ module: k, count: v.size }))
    .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module))

const innAllMap = new Map()
for (const k of out.keys()) innAllMap.set(k, innAll(k))
const fanOutRank = rank(out)
const fanInRank = rank(innAllMap)

/**
 * 不稳定性 I = Ce/(Ca+Ce)。
 * 这里 Ca 用"值 ∪ 类型"的合计口径，因为改动一个模块的**结构**会波及
 * 所有引用它类型的地方。想区分"改行为"与"改结构"的差别，看 CaValue。
 */
const instability = (k) => {
  const ce = (out.get(k) ?? new Set()).size
  const ca = innAll(k).size
  return ca + ce === 0 ? 0 : ce / (ca + ce)
}

// ------------------------------------------------------------------ 输出

if (AS_JSON) {
  const payload = {
    moduleCount: out.size,
    crossLayer,
    cycles,
    fanOut: fanOutRank.slice(0, 20),
    fanIn: fanInRank.slice(0, 20),
    depth: [...depth.entries()].map(([module, d]) => ({ module, depth: d })).sort((a, b) => b.depth - a.depth).slice(0, 20),
    instability: [...out.keys()]
      .map((k) => ({
        module: k,
        I: +instability(k).toFixed(4),
        Ce: out.get(k).size,
        Ca: innAll(k).size,
        CaValue: (innValue.get(k) ?? new Set()).size,
        CaType: (innType.get(k) ?? new Set()).size,
      }))
      .sort((a, b) => a.I - b.I),
  }
  console.log(JSON.stringify(payload, null, 2))
  process.exit(0)
}

const H = (t) => {
  console.log('')
  console.log(`── ${t} ${'─'.repeat(Math.max(0, 66 - t.length))}`)
}

console.log(`依赖诊断：${REPO}`)
console.log(`模块总数：${out.size}`)

if (LEVELS_ONLY) {
  H('分层（依赖只允许从上层指向下层）')
  for (const l of LAYERS) {
    const mods = [...out.keys()].filter((k) => k.startsWith(l.dir + '/'))
    console.log(`  L${l.level} ${l.name.padEnd(6)} ${l.dir.padEnd(11)} ${mods.length} 个文件`)
  }
  console.log('')
  console.log('  允许的方向：界面 → 能力 → 框架 → 纯能力（反向即违规）')
  process.exit(0)
}

if (ONLY) {
  const k = ONLY.replace(/\.ts$/, '').replace(/^src\//, '')
  if (!out.has(k)) {
    console.error(`未找到模块：${k}`)
    process.exit(2)
  }
  H(`模块：${k}`)
  console.log(`  层级：${layerOf(k).name}（L${layerOf(k).level}）`)
  console.log(`  扇出 Ce = ${out.get(k).size}`)
  for (const d of [...out.get(k)].sort()) console.log(`      → ${d}`)
  const vIn = [...(innValue.get(k) ?? new Set())].sort()
  const tIn = [...(innType.get(k) ?? new Set())].sort()
  console.log(`  扇入 Ca = ${vIn.length + tIn.length}  （值 ${vIn.length} + 仅类型 ${tIn.length}）`)
  console.log('    —— 值依赖者（改行为会波及它们）：')
  for (const d of vIn) console.log(`      ← ${d}`)
  if (tIn.length) {
    console.log('    —— 仅类型依赖者（改结构会波及它们）：')
    for (const d of tIn) console.log(`      ⇢ ${d}`)
  }
  console.log(`  不稳定性 I = ${instability(k).toFixed(4)}`)
  console.log(`  依赖深度 D = ${depth.get(k)}`)
  console.log('')
  console.log('  注意：工具只给数据。哪些依赖是必要的、哪些可疑，要你自己判断。')
  process.exit(0)
}

H('跨层依赖（低层依赖高层 = 违规）')
if (crossLayer.length === 0) console.log('  ✅ 无违规')
else for (const c of crossLayer) console.log(`  ❌ ${c.from} (${c.fromLayer}) → ${c.to} (${c.toLayer})`)

H('循环依赖（两模块互依赖，已排除 import type）')
if (cycles.length === 0) console.log('  ✅ 无')
else for (const [a, b] of cycles) console.log(`  ⚠️  ${a} ⇄ ${b}`)

H('类型层面的环（运行时不存在，但仍是耦合）')
if (typeCycles.length === 0) console.log('  ✅ 无')
else
  for (const [a, b, how] of typeCycles)
    console.log(`  ℹ️  ${a} ⇄ ${b}   （${how}；编译后被擦除）`)

H('扇入最高（改动风险最大的模块）')
for (const r of fanInRank.slice(0, 8)) console.log(`  ${String(r.count).padStart(3)}  ${r.module}`)

H('扇出最高（最难理解的模块）')
for (const r of fanOutRank.slice(0, 8)) console.log(`  ${String(r.count).padStart(3)}  ${r.module}`)

H('依赖链最长')
const dRank = [...depth.entries()].sort((a, b) => b[1] - a[1])
for (const [m, d] of dRank.slice(0, 6)) console.log(`  ${String(d).padStart(3)}  ${m}`)

H('最稳定与最不稳定（I 越小越稳定）')
const iRank = [...out.keys()].map((k) => [k, instability(k)])
iRank.sort((a, b) => a[1] - b[1])
for (const [m, i] of iRank.slice(0, 4)) console.log(`  I=${i.toFixed(3)}  ${m}`)
console.log('  …')
for (const [m, i] of iRank.slice(-4)) console.log(`  I=${i.toFixed(3)}  ${m}`)

console.log('')
console.log('判断留给你：跨层依赖是否真的都该修？高扇入的模块是否值得它现在的位置？')
console.log('提示：用 --module <路径> 看单个模块的完整依赖清单。')
