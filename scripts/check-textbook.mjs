// 教科书化检查（v2）：逐行状态机解析 + 聚焦"讲义与作业说明"。
//
// 用法：node scripts/check-textbook.mjs [路径...]（省略参数则检查全集）
//
// 十条判据见文件末尾的 RULES 说明。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

/** 逐行状态机：把文档切成 段/列表/表格/代码/标题/引用 六类单元。 */
function parse(text) {
  const lines = text.split(/\r?\n/)
  const units = []
  let cur = null
  let inCode = false
  let inMath = false
  let containerDepth = 0
  const flush = () => { if (cur && cur.lines.length) { cur.depth = containerDepth; units.push(cur) } cur = null }
  for (const line of lines) {
    // 围栏代码块：整个块（含两端的围栏）是一个单元，块内内容不参与散文统计
    if (/^```/.test(line)) {
      if (inCode) { cur.lines.push(line); flush(); inCode = false } else { flush(); cur = { kind: 'code', lines: [line] }; inCode = true }
      continue
    }
    if (inCode) { cur.lines.push(line); continue }

    // VitePress 容器（::: keypoint / theorem / data）：把容器边界当作独立单元，
    // 否则容器内的散文会与上下文连成一条超长的"连续散文"，而它们在视觉上是分开的块。
    // 同时记录容器深度：容器本身就是结构，T10 只针对容器外的正文。
    if (/^:::\s*\S/.test(line)) { flush(); containerDepth++; units.push({ kind: 'container', lines: [line], depth: containerDepth }); continue }
    if (/^:::\s*$/.test(line)) { flush(); units.push({ kind: 'container', lines: [line], depth: containerDepth }); containerDepth = Math.max(0, containerDepth - 1); continue }

    // 公式块：区分单行（$$ ... $$ 写在同一行）与多行围栏，单行不进入 inMath 状态。
    if (/^\s*\$\$/.test(line)) {
      if (/^\s*\$\$.+?\$\$\s*$/.test(line)) {
        flush()
        cur = { kind: 'math', lines: [line] }
        cur.depth = containerDepth
        units.push(cur)
        cur = null
        continue
      }
      if (inMath) { cur.lines.push(line); flush(); inMath = false } else { flush(); cur = { kind: 'math', lines: [line] }; inMath = true }
      continue
    }
    if (inMath) { if (!cur) cur = { kind: 'math', lines: [] }; cur.lines.push(line); continue }

    let kind = 'prose'
    if (/^\s*$/.test(line)) { if (inMath && cur) { cur.lines.push(line); continue } flush(); continue }
    else if (/^#{1,6}\s/.test(line)) kind = 'heading'
    // 独占一行的加粗是小标题（如 **本节要点**、**记忆锚点**），不按散文计加粗占比
    else if (/^\*\*[^*]+\*\*$/.test(line)) kind = 'heading'
    else if (/^\s*\|/.test(line)) kind = 'table'
    else if (/^\s*>/.test(line)) kind = 'quote'
    else if (/^\s*([-*]|\d+\.)\s/.test(line)) kind = 'list'
    if (cur && cur.kind === kind) cur.lines.push(line)
    else { flush(); cur = { kind, lines: [line] } }
  }
  flush()
  return units
}

const BANNED = ['轻松', '仅仅', '说白了', '很显然', '众所周知', '很容易', '显而易见']
const SUMMARY_HINT = /(小结|要点|只记一句话|关键结论|本节回顾|一句话记住)/

/** 只检查"讲义与作业说明"，不检查参考材料与存档。 */
const INCLUDE = [
  /^00-导论\/[01]\.\d+-.*\.md$/,
  /^0[1-6]-[^/]+\/\d+\.\d+-.*\.md$/,
  /^0[1-6]-[^/]+\/index\.md$/,
  /^homework\/ch\d\d-[^/]+\/(作业引导|README|index)\.md$/,
  /^homework\/ch\d\d-[^/]+\/kit\/CONTRACT.*\.md$/,
  /^index\.md$/,
]

function check(path) {
  const rel = path.slice(ROOT.length + 1).replace(/\\/g, '/')
  const s = readFileSync(path, 'utf8')
  const units = parse(s)
  const issues = []

  const prose = units.filter((u) => u.kind === 'prose')
  const listUnits = units.filter((u) => u.kind === 'list')
  const heads = units.filter((u) => u.kind === 'heading' && /^#{2,4}\s/.test(u.lines[0]))
  const listItems = listUnits.reduce((n, u) => n + u.lines.filter((l) => /^\s*([-*]|\d+\.)\s/.test(l)).length, 0)

  const proseTexts = prose.map((u) => u.lines.join(''))
  const longest = proseTexts.length ? Math.max(...proseTexts.map((t) => t.length)) : 0
  const over300 = proseTexts.filter((t) => t.length > 300).length
  const over200 = proseTexts.filter((t) => t.length > 200).length

  // T1 单段长度（教科书要求可一口气读完）
  if (over200 > Math.max(2, Math.floor(prose.length * 0.05))) issues.push(`T1 超 200 字段落 ${over200} 处（共 ${prose.length} 段，最长 ${longest}）`)
  // T2 长段占比
  if (prose.length && over300 / prose.length > 0.05) issues.push(`T2 超 300 字段落占 ${((over300 / prose.length) * 100).toFixed(0)}%`)
  // T3 分号（TF 指南：避免分号）。要排除两类假阳性：
  //   ① LaTeX 的空格命令 \;
  //   ② 行内与块公式里的分号（如 Eval(R; J) 里的分隔符，那是数学记号）
  const stripMath = (t) => t.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^$\n]*\$/g, '')
  const semi = proseTexts.filter((t) => /(?<!\\)[；;]/.test(stripMath(t))).length
  if (semi > 0) issues.push(`T3 散文含分号 ${semi} 段`)
  // T4 禁用词
  const banned = BANNED.filter((w) => s.includes(w))
  if (banned.length) issues.push(`T4 禁用词 ${banned.join('/')}`)
  // T5 小标题密度（每 1800 字符至少一个）
  const headNeed = Math.floor(s.length / 1800)
  if (heads.length < headNeed) issues.push(`T5 小标题 ${heads.length}（需 ≥${headNeed}）`)
  // T6 列表化（每 2500 字符至少 6 个列表项）
  const listNeed = Math.floor(s.length / 2500) * 6
  if (listItems < listNeed) issues.push(`T6 列表项 ${listItems}（需 ≥${listNeed}）`)
  // T7 代码块要有引入（前一个单元不是标题/代码/表格）
  let noIntro = 0
  for (let i = 1; i < units.length; i++) {
    if (units[i].kind !== 'code') continue
    const prev = units[i - 1]
    if (prev.kind === 'heading' || prev.kind === 'code' || prev.kind === 'table') noIntro++
  }
  if (noIntro > 0) issues.push(`T7 代码块缺引入 ${noIntro} 处`)
  // T8 要点小结
  if (!SUMMARY_HINT.test(s)) issues.push('T8 无要点小结区块')
  // T9 问句标题
  const qHead = units.filter((u) => u.kind === 'heading' && /？\s*$/.test(u.lines[0])).length
  if (qHead > 0) issues.push(`T9 问句标题 ${qHead}`)
  // T10 连续散文段（只看容器外的正文；容器本身就是结构，容器内由 0.6 的理论层六层约束）
  let run = 0
  let maxRun = 0
  for (const u of units) {
    if (u.depth !== 0) continue
    if (u.kind === 'prose') { run++; maxRun = Math.max(maxRun, run) } else run = 0
  }
  if (maxRun > 5) issues.push(`T10 连续散文 ${maxRun} 段`)

  return {
    文档: rel,
    字符: s.length,
    散文段: prose.length,
    最长段: longest,
    列表项: listItems,
    小标题: heads.length,
    违规: issues.length,
    问题: issues.join('；'),
  }
}

function collectAll(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (/^(node_modules|\.vitepress|\.git|docs)$/.test(name)) continue
      collectAll(full, acc)
    } else if (name.endsWith('.md')) acc.push(full)
  }
  return acc
}

const args = process.argv.slice(2)
const targets = args.length
  ? args.map((a) => join(ROOT, a))
  : collectAll(ROOT).filter((p) => INCLUDE.some((re) => re.test(p.slice(ROOT.length + 1).replace(/\\/g, '/'))))

const rows = targets.map(check).sort((a, b) => b.违规 - a.违规)
console.table(rows.slice(0, 30))
console.log(`共检查 ${rows.length} 个文档：有违规 ${rows.filter((r) => r.违规 > 0).length}`)
const byRule = {}
for (const r of rows) for (const m of r.问题.split('；')) if (m) { const k = (m.match(/^T[0-9]+/) ?? ['?'])[0]; byRule[k] = (byRule[k] ?? 0) + 1 }
console.log('按判据统计：', byRule)
