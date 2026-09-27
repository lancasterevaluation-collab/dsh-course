// 加粗规范化工具（可复用）。用法：
//   node scripts/normalize-bold.mjs 05-规模化与交互/5.1-模式与预设.md
//   node scripts/normalize-bold.mjs --all
//
// 规则（与 0.3 规范的加粗口径一致）：
//   散文段落：<250 字符的整段去粗；长段保留至多 2 处
//   列表项：保留至多 2 处（术语首现需要）
//   引用行：保留至多 1 处（面试框与升级练习各一行一句）
//   表格、标题、代码块：不动
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOLD = /\*\*(.+?)\*\*/g
const count = (s) => [...s.matchAll(BOLD)].length

function normalize(text) {
  let changed = 0
  const blocks = text.split(/\n\s*\n/).map((block) => {
    if (/^[|#]/.test(block) || block.startsWith('```')) return block

    if (/^>\s/.test(block)) {
      return block.split('\n').map((line) => {
        if (count(line) <= 1) return line
        changed++
        let i = 0
        return line.replace(BOLD, (m, inner) => (++i <= 1 ? m : inner))
      }).join('\n')
    }

    const isList = /^([-*]|\d+\.)\s/.test(block)
    if (isList) {
      return block.split('\n').map((line) => {
        if (count(line) <= 2) return line
        changed++
        let i = 0
        return line.replace(BOLD, (m, inner) => (++i <= 2 ? m : inner))
      }).join('\n')
    }

    const n = count(block)
    if (n === 0) return block
    if (block.length < 250) {
      changed++
      return block.replace(BOLD, (m, inner) => inner)
    }
    if (n <= 2) return block
    changed++
    let i = 0
    return block.replace(BOLD, (m, inner) => (++i <= 2 ? m : inner))
  }).join('\n\n')
  return { text: blocks, changed }
}

function collect(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (/^(docs|appendix|homework|scripts|node_modules)$/.test(name)) continue
      collect(full, acc)
    } else if (name.endsWith('.md') && /^\d+\.\d+-/.test(name)) {
      const rel = full.slice(ROOT.length + 1).replace(/\\/g, '/')
      if (!rel.startsWith('00-导论/')) acc.push([full, rel])
    }
  }
  return acc
}

const args = process.argv.slice(2)
const targets = args.includes('--all') || args.length === 0 ? collect(ROOT) : args.map((a) => [join(ROOT, a), a])

for (const [full, rel] of targets) {
  const before = readFileSync(full, 'utf8')
  const { text, changed } = normalize(before)
  if (changed === 0) { console.log(`${rel}：无改动`); continue }
  writeFileSync(full, text)
  const b = (x) => [...x.matchAll(BOLD)].reduce((n, m) => n + m[1].length, 0)
  const paras = text.split(/\n\s*\n/).filter((x) => !/^[|#>]/.test(x) && !x.startsWith('```') && !/^([-*]|\d+\.)\s/.test(x))
  const prose = paras.join('\n\n')
  console.log(`${rel}：收敛 ${changed} 处　全文加粗 ${((b(text) / text.length) * 100).toFixed(2)}%　散文加粗 ${((b(prose) / prose.length) * 100).toFixed(2)}%`)
}
