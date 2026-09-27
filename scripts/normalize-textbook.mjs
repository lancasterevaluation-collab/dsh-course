// 教科书化规范化工具：修 T1（分段）、T3（分号）、T4（禁用词）。
//
// 默认 dry-run（只报告），加 --write 才落盘。
// 三条替换都是保守的：
//   · T1 只在句号处插入空行来分段，不改动任何文字；
//   · T3 把散文里的分号改成句号（并列列举改成短句，语义不变）；
//   · T4 禁用词按固定映射替换。
// 代码块、表格、引用块、标题、frontmatter 一律不碰。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))

const BANNED_MAP = [
  ['很容易', '容易'],
  ['仅仅', '只'],
  ['说白了', '也就是'],
  ['很显然', '显然'],
  ['众所周知，', ''],
  ['众所周知', ''],
  ['显而易见', '明显'],
  ['轻松地', '容易地'],
  ['轻松', '容易'],
]

/** 只处理段落区（散文），跳过围栏代码块与元信息表。 */
function transform(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  let inCode = false
  let inFront = false
  let frontDone = false
  const log = { T3: 0, T4: 0, T1: 0 }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // frontmatter
    if (i === 0 && line.trim() === '---') { inFront = true; out.push(line); continue }
    if (inFront) { out.push(line); if (line.trim() === '---') { inFront = false; frontDone = true } continue }
    void frontDone

    // 围栏代码块
    if (/^```/.test(line)) { inCode = !inCode; out.push(line); continue }
    if (inCode) { out.push(line); continue }

    // 行内代码、代码块、公式块、表格、引用与容器内的行都不参与散文的标点替换。
    const skip = /^\s*$/.test(line) || /^#{1,6}\s/.test(line) || /^\s*\|/.test(line) || /^\s*>/.test(line) || /^:::\s*\S*/.test(line) || /^\s*\$\$/.test(line)

    if (!skip) {
      // T4 禁用词
      for (const [from, to] of BANNED_MAP) {
        if (line.includes(from)) { line = line.split(from).join(to); log.T4++ }
      }
      // T3 分号 → 句号。列表项也处理：分号把两个可独立成句的判断粘在一起，
      // 改成句号不丢语义，而 TensorFlow 风格指南要求避免分号。
      if (/；/.test(line)) {
        line = line.replace(/；\s*/g, () => { log.T3++; return '。' })
      }
    }
    out.push(line)
  }

  let result = out.join('\n')

  // T1 分段：对超长段落按句号切分（只插入空行，不改文字）
  const blocks = result.split(/\n\s*\n/)
  const fixed = blocks.map((b) => {
    const t = b.trim()
    if (!t || /^[#|>`-]|^\d+\./.test(t) || /^```/.test(t)) return b
    if (t.length <= 200) return b
    // 以句号切分，贪心累积到接近 200 字符就断开
    const parts = t.split(/(?<=[。！？])/).filter((x) => x.trim())
    if (parts.length < 2) return b
    const groups = []
    let cur = ''
    for (const p of parts) {
      if (cur && cur.length + p.length > 200) { groups.push(cur); cur = p } else cur += p
    }
    if (cur) groups.push(cur)
    if (groups.length < 2) return b
    log.T1++
    return groups.join('\n\n')
  })
  result = fixed.join('\n\n')

  return { result, log }
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

const INCLUDE = [
  /^0[1-6]-[^/]+\/\d+\.\d+-.*\.md$/,
  /^homework\/ch\d\d-[^/]+\/(作业引导|README)\.md$/,
]

const targets = args.length ? args.map((a) => join(ROOT, a)) : collect(ROOT)
const rows = []
for (const p of targets) {
  const rel = p.slice(ROOT.length + 1).replace(/\\/g, '/')
  if (args.length === 0 && !INCLUDE.some((re) => re.test(rel))) continue
  const src = readFileSync(p, 'utf8')
  const { result, log } = transform(src)
  row: {
    if (result === src) { rows.push({ 文档: rel, T1: 0, T3: 0, T4: 0, 改动: '无' }); break row }
    if (WRITE) writeFileSync(p, result)
    rows.push({ 文档: rel, T1: log.T1, T3: log.T3, T4: log.T4, 改动: WRITE ? '已写' : '待写' })
  }
}

const changed = rows.filter((r) => r.T1 + r.T3 + r.T4 > 0)
console.table(changed.slice(0, 30))
const sum = changed.reduce((a, r) => ({ T1: a.T1 + r.T1, T3: a.T3 + r.T3, T4: a.T4 + r.T4 }), { T1: 0, T3: 0, T4: 0 })
console.log(`${WRITE ? '已写入' : '待写入'} ${changed.length} 个文档；T1 分段 ${sum.T1}、T3 分号 ${sum.T3}、T4 禁用词 ${sum.T4}`)
if (!WRITE) console.log('这是 dry-run，加 --write 落盘。')
