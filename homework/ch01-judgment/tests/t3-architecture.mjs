#!/usr/bin/env node
/**
 * 3.3 读代码与架构 —— 作业自动判分器
 *
 * 对应 CS336 的 `tests/` + `adapters.py`：学生把答案写进 answers.json，
 * 本脚本解析 dsh-mini 的真实源码，算出标准答案并逐项判分。
 *
 * 用法：
 *   node check-answers.mjs --answers answers.json [--repo D:\dsh-mini] [--verbose]
 *
 * 依赖：Node 18+，无第三方包。
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const REPO = argOf('--repo', 'D:\\dsh-mini')
const ANSWERS_PATH = argOf('--answers', 'answers.json')
const VERBOSE = args.includes('--verbose')

// ---------------------------------------------------------------- 基础工具

/** 递归收集 .ts 文件（跳过 node_modules 与 lib）。 */
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

/** 把绝对路径归一成 `kernel/agent.ts` 形式（相对 src/，正斜杠）。 */
function canon(absOrRel) {
  let s = absOrRel.replace(/\\/g, '/')
  const i = s.indexOf('/src/')
  if (i >= 0) s = s.slice(i + 5)
  else if (s.startsWith('src/')) s = s.slice(4)
  return s.replace(/^\.\//, '')
}

/** 归一化模块名用于比较：去掉 src/ 前缀与 .ts 后缀。 */
function modKey(s) {
  return canon(s).replace(/\.ts$/, '')
}

/**
 * 匹配 import/export ... from '...'，捕获 `type` 前缀。
 * 类型导入在编译后擦除：它不参与运行时扇出，但改结构时会波及。
 */
const IMPORT_RE = /\bimport\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g

/**
 * 提取一个文件的项目内依赖。
 * 口径（本作业固定）：只算 `./` 与 `../` 相对导入，Node 内建与裸包名不计。
 * 返回 { value, typeOnly } 两组说明符。
 */
function relImports(source) {
  const value = []
  const typeOnly = []
  for (const m of source.matchAll(IMPORT_RE)) {
    const isType = Boolean(m[1])
    const spec = m[2]
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue
    ;(isType ? typeOnly : value).push(spec)
  }
  return { value, typeOnly }
}

/** 把相对导入说明符解析成 modKey 形式的模块键。 */
function resolveSpec(fromAbs, spec) {
  const norm = fromAbs.replace(/\\/g, '/')
  const dir = norm.slice(0, norm.lastIndexOf('/'))
  const parts = `${dir}/${spec}`.split('/')
  const stack = []
  for (const p of parts) {
    if (p === '.' || p === '') continue
    if (p === '..') stack.pop()
    else stack.push(p)
  }
  return modKey(stack.join('/'))
}

// ---------------------------------------------------------------- 判分框架

const results = []
/** 记录一个评分项。ratio 为 0..1 的完成比例。 */
function item(id, points, ratio, note) {
  const r = Math.max(0, Math.min(1, ratio))
  results.push({ id, points, earned: r * points, ratio: r, note })
}

/** 集合比对：返回 [命中数, 总数, 多余数]。 */
function compareSets(student, expected) {
  const norm = (arr) => new Set((arr ?? []).map((s) => modKey(String(s))))
  const S = norm(student)
  const E = norm(expected)
  let hit = 0
  for (const e of E) if (S.has(e)) hit++
  const extra = [...S].filter((s) => !E.has(s))
  return { hit, total: E.size, extra }
}

/**
 * 集合评分：hit / (总数 + 多余数)，即 Jaccard 式的严格比对。
 * 这样"漏报"与"多报"对称受罚——多报意味着把"提到"当成了"依赖"（正文 5.3 第一条）。
 */
function setRatio(student, expected) {
  // "没填"与"填了空"是两回事：null/undefined 记 0 分，空数组才是有效回答。
  if (student === null || student === undefined) return 0
  const { hit, total, extra } = compareSets(student, expected)
  // 标准答案是空集时，答空才是对的："多报"在这个情形下是纯粹的错误。
  if (total === 0) return extra.length === 0 ? 1 : 0
  return hit / (total + extra.length)
}

/** 数值比对：容差内满分，否则线性衰减到 0。未填（null/undefined/""）记 0 分。 */
function numRatio(student, expected, tolerance) {
  if (student === null || student === undefined || student === '') return 0
  const s = Number(student)
  if (!Number.isFinite(s)) return 0
  const d = Math.abs(s - expected)
  if (d <= tolerance) return 1
  return Math.max(0, 1 - (d - tolerance) / tolerance)
}

// ---------------------------------------------------------------- 主流程

let answers
try {
  const raw = await readFile(ANSWERS_PATH, 'utf8')
  // Windows 上用 PowerShell 的 Out-File / Set-Content -Encoding UTF8 会写入 BOM，
  // 而 JSON.parse 不接受它，所以这里先剥掉。
  answers = JSON.parse(raw.replace(/^\uFEFF/, ''))
} catch (err) {
  console.error(`无法读取答卷 ${ANSWERS_PATH}：${err.message}`)
  console.error('提示：先从 answers.example.json 复制一份，再填你的答案。')
  process.exit(2)
}

try {
  await stat(join(REPO, 'src'))
} catch {
  console.error(`找不到仓库源码：${REPO}\\src`)
  console.error('用 --repo <path> 指定 dsh-mini 的根目录。')
  process.exit(2)
}

const files = await walk(join(REPO, 'src'))
const sourceOf = new Map()
for (const f of files) sourceOf.set(canon(f), await readFile(f, 'utf8'))

// ---- 全局事实：每个模块的扇出与扇入 ----
// 扇出只算值依赖（运行时真实存在）；扇入分"值"与"仅类型"两组。
const fanOutMap = new Map() // modKey -> 值依赖的 modKey 列表
const fanInValueMap = new Map() // modKey -> 用值的依赖者（canon 形式）
const fanInTypeMap = new Map() // modKey -> 只用类型的依赖者
const pushTo = (map, k, v) => {
  if (!map.has(k)) map.set(k, [])
  map.get(k).push(v)
}
for (const [rel, src] of sourceOf) {
  const fromAbs = join(REPO, 'src', rel)
  const { value: valueSpecs, typeOnly: typeSpecs } = relImports(src)
  const outs = [...new Set(valueSpecs.map((s) => resolveSpec(fromAbs, s)))]
  fanOutMap.set(modKey(rel), outs)
  for (const o of outs) pushTo(fanInValueMap, o, canon(rel))
  for (const t of new Set(typeSpecs.map((s) => resolveSpec(fromAbs, s)))) {
    if (!outs.includes(t)) pushTo(fanInTypeMap, t, canon(rel))
  }
}
/** 全部依赖者 = 值 ∪ 仅类型。 */
const fanInAllOf = (k) =>
  [...new Set([...(fanInValueMap.get(k) ?? []), ...(fanInTypeMap.get(k) ?? [])])].sort()

// ============================================================ 任务 1（30 分）

const T1 = answers.task1 ?? {}
const targetModule = T1.module ?? 'kernel/session.ts'
const tKey = modKey(targetModule)

const trueFanOut = fanOutMap.get(tKey) ?? []
const trueFanInAll = fanInAllOf(tKey)
const trueFanInValue = [...new Set(fanInValueMap.get(tKey) ?? [])].sort()
const trueFanInType = [...new Set(fanInTypeMap.get(tKey) ?? [])].sort()
const Ce = trueFanOut.length
const Ca = trueFanInAll.length
const trueI = Ca + Ce === 0 ? 0 : Ce / (Ca + Ce)

// 前置校验：模块名未填、或该模块不在此仓库里时，T1 一律按未作答记 0 分。
// 否则查不到模块会让"标准答案"变成空集，而 setRatio 对空集返回 1，
// 于是空作答反而拿到满分。
const moduleResolvable =
  typeof T1.module === 'string' && T1.module.trim() !== '' && sourceOf.has(canon(targetModule))
const tts = moduleResolvable ? (T1.target ?? {}) : {}

item(
  'T1.1 扇出清单（只算值依赖）',
  6,
  setRatio(tts.fanOut, trueFanOut),
  `标准答案 ${trueFanOut.length} 项：${trueFanOut.join(', ')}`,
)

item(
  'T1.2 扇入清单（值 ∪ 类型，合计）',
  8,
  setRatio(tts.fanIn, trueFanInAll),
  `标准答案 ${trueFanInAll.length} 项 = 值 ${trueFanInValue.length} + 仅类型 ${trueFanInType.length}${VERBOSE ? '：' + trueFanInAll.join(', ') : '（加 --verbose 全列）'}`,
)

item(
  'T1.3 扇入的「值依赖」子集',
  8,
  setRatio(tts.fanInValue, trueFanInValue),
  `标准答案 ${trueFanInValue.length} 项：${trueFanInValue.join(', ') || '（无）'}。考的是你能否分清"改行为会波及谁"与"改结构会波及谁"`,
)

item(
  'T1.4 不稳定性 I = Ce/(Ca+Ce)',
  6,
  numRatio(tts.instability, trueI, 0.02),
  `标准答案 Ce=${Ce} Ca=${Ca}（合计口径）→ I=${trueI.toFixed(4)}（容差 ±0.02）`,
)

// 关键导出：从源码里抓 export 的函数/常量/类名
const srcText = sourceOf.get(canon(targetModule)) ?? ''
const exportNames = new Set()
for (const m of srcText.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/gm)) {
  exportNames.add(m[1])
}
const keyExports = [...exportNames]
item(
  'T1.5 关键导出名（不含类型）',
  6,
  setRatio(tts.keyExports, keyExports),
  `标准答案 ${keyExports.length} 项：${keyExports.join(', ')}`,
)

// ============================================================ 任务 2（40 分）

const T2 = answers.task2 ?? {}

const rcFiles = [...sourceOf.entries()]
  .filter(([, src]) => src.includes('run_command'))
  .map(([rel]) => canon(rel))
const rcInModes = rcFiles.filter((f) => f.startsWith('modes/') || f.endsWith('.json') || f.includes('prompt'))

item(
  'T2.1 run_command 的工具定义文件',
  8,
  setRatio(T2.definedIn, ['kernel/command-tool.ts']),
  '标准答案：kernel/command-tool.ts',
)

item(
  'T2.2 工具池（池名与目录）所在文件',
  5,
  setRatio(T2.toolPoolIn, ['plugins/tools.ts']),
  '标准答案：plugins/tools.ts（TOOL_POOL_NAMES 在第 59 行附近）',
)

// 静默失效项：配置/提示词层提到 run_command 的地方
const silentTargets = ['modes/minimal.json', 'modes/creator.json', 'prompts/minimal.md']
item(
  'T2.3 「会静默失效」的项：配置与提示词层',
  10,
  setRatio(T2.silentTargets, silentTargets),
  `标准答案 ${silentTargets.length} 项：${silentTargets.join(', ')}（它们不被类型检查，改了工具名不会报错）`,
)

const spawnSrc = sourceOf.get('kernel/command-tool.ts') ?? ''
const spawnOk = spawnSrc.includes("from 'node:child_process'") && /spawn\s*\(/.test(spawnSrc)
item(
  'T2.4 子进程启动方式',
  5,
  spawnOk && /child_process/.test(String(T2.spawnApi ?? '')) && /spawn/.test(String(T2.spawnApi ?? '')) ? 1 : 0,
  "标准答案：node:child_process 的 spawn（源码里有 import { spawn } from 'node:child_process'）",
)

// 波及面：定义文件 + 工具池 + 配置层 + 消费者
const blastExpected = new Set([
  'kernel/command-tool.ts',
  'plugins/tools.ts',
  'modes/minimal.json',
  'modes/creator.json',
  'prompts/minimal.md',
])
item(
  'T2.5 波及面（受影响的文件集合）',
  8,
  setRatio(T2.blast, [...blastExpected]),
  `标准答案 ${blastExpected.size} 项：${[...blastExpected].join(', ')}`,
)

// ============================================================ 任务 4（20 分）

const T4 = answers.task4 ?? {}

const hookFiles = [...sourceOf.entries()]
  .filter(([, src]) => src.includes('ctx.on('))
  .map(([rel]) => canon(rel))
  .sort()

item(
  'T4.1 使用 ctx.on( 注册监听的文件集合',
  10,
  setRatio(T4.hookFiles, hookFiles),
  `标准答案 ${hookFiles.length} 项：${hookFiles.join(', ')}`,
)

const emitCount = [...sourceOf.values()].reduce(
  (n, src) => n + (src.match(/ctx\.emit\(/g) ?? []).length,
  0,
)
item(
  'T4.2 ctx.emit( 的总调用次数',
  10,
  numRatio(T4.emitCount, emitCount, 1),
  `标准答案：${emitCount} 次（容差 ±1）`,
)

// ============================================================ 任务 3 与 5（10 分）

const T3 = answers.task3 ?? {}
item(
  'T3 规则命令化：脚本已提交且自测通过',
  5,
  T3.scriptPath && T3.selfTestOutput && /PASS|通过/i.test(String(T3.selfTestOutput)) ? 1 : 0,
  '需要在 answers.json 里填 scriptPath 与 selfTestOutput（含 PASS）',
)

const T5 = answers.task5 ?? {}
const recall = Array.isArray(T5.remembered) ? T5.remembered.length : 0
const crucial = ['q4', 'q5', 'q8'].filter((q) => (T5.remembered ?? []).includes(q)).length
item(
  'T5 闭卷回忆：记住的题数（核心题 q4/q5/q8 必须在内）',
  5,
  recall >= 12 ? 1 : recall >= 9 && crucial === 3 ? 0.8 : recall / 12,
  `你填了 ${recall} 题，核心题命中 ${crucial}/3`,
)

// ============================================================ 成绩单

const total = results.reduce((s, r) => s + r.points, 0)
const earned = results.reduce((s, r) => s + r.earned, 0)

const bar = (ratio) => {
  const n = Math.round(ratio * 20)
  return '█'.repeat(n) + '░'.repeat(20 - n)
}

console.log('')
console.log('══ 3.3 读代码与架构 · 作业判分 ══')
console.log(`仓库：${REPO}`)
console.log(`答卷：${ANSWERS_PATH}`)
console.log('')
for (const r of results) {
  const mark = r.ratio >= 0.999 ? '✅' : r.ratio > 0 ? '🟡' : '❌'
  console.log(`${mark} ${r.id}`)
  console.log(`   ${bar(r.ratio)}  ${r.earned.toFixed(1)}/${r.points}`)
  console.log(`   ${r.note}`)
}
console.log('')
console.log(`总分：${earned.toFixed(1)} / ${total}  （${((earned / total) * 100).toFixed(1)}%）`)

const verdict =
  earned / total >= 0.9
    ? '优秀：你对结构的理解可以支撑独立推演。'
    : earned / total >= 0.7
      ? '良好：方法用对了，个别项需要回读对应小节。'
      : earned / total >= 0.5
        ? '合格：先重做错得最多的那一类项。'
        : '不合格：建议先读正文 1.2 与 1.5，再重做任务 1。'
console.log(`评级：${verdict}`)
console.log('')

process.exit(earned / total >= 0.5 ? 0 : 1)
