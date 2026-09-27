// 散文加粗收敛：把容器外散文段里的加粗减到每段不超过 N 处。
//
// 依据 0.6 规范第 5.5 节：散文加粗上限 5%（理论密集篇 7.5%）。
// 容器（::: theorem / keypoint / data）、表格、术语表不受限，因此本工具只处理容器外的散文。
// 代码块、标题、列表项、引用、公式也不动：列表项本身不计入散文加粗。
//
// 用法：node scripts/reduce-bold.mjs [路径...] [--keep N] [--write]
// 默认 keep=1、dry-run。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')
const keepIdx = process.argv.indexOf('--keep')
const KEEP = keepIdx >= 0 ? Number(process.argv[keepIdx + 1]) : 1
const args = process.argv.slice(2).filter((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--keep')

/** 格式标记不是强调：证明起始、推导依据行、定义与命题编号、要点小结标题。 */
const FORMAT_MARK = /^(\*\*(证明\.|定义 \d|命题 \d|本节要点|记忆锚点)\*\*|↓)/
// 列表项也参与减粗：列表本身已经提供了结构，项内再加粗属于冗余。
// 每项仍保留最前面一处强调（术语名或小标题），只去掉多余的。
const SKIP_LINE = /^[#>|`]|^:::|^\s*\$\$/

/** 对一份文本做加粗收敛。@param s 文本 @param keep 每段保留的加粗数 @returns `{text, removed}` */
export function reduceBold(s, keep = 1) {
  const lines = s.split('\n')
  let depth = 0
  let inCode = false
  let inMath = false
  let removed = 0
  const out = lines.map((line) => {
    if (/^```/.test(line)) { inCode = !inCode; return line }
    if (inCode) return line
    if (/^:::\s*\S/.test(line)) { depth++; return line }
    if (/^:::\s*$/.test(line)) { depth = Math.max(0, depth - 1); return line }
    if (depth > 0) return line // 容器内不动
    if (/^\s*\$\$/.test(line)) { inMath = !inMath; return line }
    if (inMath) return line
    if (SKIP_LINE.test(line)) return line
    if (FORMAT_MARK.test(line.trim())) return line
    const marks = [...line.matchAll(/\*\*(.+?)\*\*/g)]
    if (marks.length <= keep) return line
    let kept = 0
    return line.replace(/\*\*(.+?)\*\*/g, (m, inner) => {
      if (/^(证明\.|↓)/.test(inner.trim())) return m
      kept++
      if (kept <= keep) return m
      removed++
      return inner
    })
  })
  return { text: out.join('\n'), removed }
}

function collect(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (/^(node_modules|\.vitepress|\.git|docs)$/.test(name)) continue
      collect(full, acc)
    } else if (name.endsWith('.md')) acc.push(full)
  }
  return acc
}

const INCLUDE = [/^0[1-6]-[^/]+\/\d+\.\d+-.*\.md$/, /^homework\/ch\d\d-[^/]+\/(作业引导|README)\.md$/]
const targets = args.length ? args.map((a) => join(ROOT, a)) : collect(ROOT).filter((p) => INCLUDE.some((re) => re.test(p.slice(ROOT.length + 1).replace(/\\/g, '/'))))

const rows = []
for (const p of targets) {
  const rel = p.slice(ROOT.length + 1).replace(/\\/g, '/')
  const src = readFileSync(p, 'utf8')
  const { text, removed } = reduceBold(src, KEEP)
  if (removed === 0) continue
  if (WRITE) writeFileSync(p, text)
  rows.push({ 文档: rel, 减粗: removed })
}
rows.sort((a, b) => b.减粗 - a.减粗)
console.table(rows.slice(0, 25))
console.log(`${WRITE ? '已写入' : '待写入'} ${rows.length} 篇，共减 ${rows.reduce((n, r) => n + r.减粗, 0)} 处（每段保留 ${KEEP} 处）`)
if (!WRITE) console.log('这是 dry-run，加 --write 落盘。')
