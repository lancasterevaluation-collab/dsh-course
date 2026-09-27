// T7 半自动修复：给缺少引入句的代码块补一句说明。
//
// 依据 0.6 规范的结构层要求："说明与代码交替——代码块前面必须有一句说明它要做什么"。
// 引入句按代码块的语言与首行从固定句式库里选，不凭空生成内容。
//
// 用法：node scripts/add-code-intro.mjs [路径...] [--write]
// 默认 dry-run。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')
const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== '--write')

/** 按语言与首行选引入句。@returns 引入句（不含换行） */
export function introFor(lang, firstLine) {
  const l = (lang || '').toLowerCase()
  if (/^(sh|bash|zsh|powershell|ps1|shell|console)$/.test(l)) return '执行下面的命令：'
  if (/^(json|jsonc)$/.test(l)) return '数据格式如下：'
  if (/^(ya?ml)$/.test(l)) return '配置如下：'
  if (/^(diff|patch)$/.test(l)) return '改动如下：'
  if (/^(text|txt|log)$/.test(l)) return '输出如下：'
  if (/^(js|javascript|mjs|cjs|ts|typescript)$/.test(l)) {
    if (/^\s*(import|const\s+\w+\s*=\s*require)/.test(firstLine)) return '引入所需的模块：'
    if (/^\s*(export\s+)?(async\s+)?function/.test(firstLine)) return '实现如下：'
    if (/^\s*(export\s+)?(default\s+)?(const|let|class|interface|type)\s/.test(firstLine)) return '定义如下：'
    if (/^\s*(await|return|\/\/)/.test(firstLine)) return '代码如下：'
    return '代码如下：'
  }
  if (/^(python|py)$/.test(l)) return '代码如下：'
  if (/^(rust|go|java|c|cpp)$/.test(l)) return '代码如下：'
  if (l === '') return '示例如下：'
  return '代码如下：'
}

/** 找出行首为围栏的行号与语言。@returns {{line: number, lang: string}[]} */
function fences(lines) {
  const out = []
  let inCode = false
  for (let i = 0; i < lines.length; i++) {
    const m = /^```(\S*)/.exec(lines[i])
    if (!m) continue
    if (!inCode) { out.push({ line: i, lang: m[1] }); inCode = true } else { inCode = false }
  }
  return out
}

function processFile(path, rel) {
  const lines = readFileSync(path, 'utf8').split('\n')
  const opening = fences(lines)
  const inserts = []
  for (const f of opening) {
    // 向上找最近的非空行
    let j = f.line - 1
    while (j >= 0 && lines[j].trim() === '') j--
    if (j < 0) continue
    const prev = lines[j]
    const prevIsHeading = /^#{1,6}\s/.test(prev)
    const prevIsFence = /^```/.test(prev)
    const prevIsTable = /^\s*\|/.test(prev)
    if (!prevIsHeading && !prevIsFence && !prevIsTable) continue
    // 表格行不算引入时也要补（表格后面接代码块，说明缺失）
    const first = lines[f.line + 1] ?? ''
    inserts.push({ at: f.line, text: introFor(f.lang, first), afterHeading: prevIsHeading })
  }
  if (inserts.length === 0) return null
  if (WRITE) {
    for (const ins of inserts.reverse()) lines.splice(ins.at, 0, ins.text, '')
    writeFileSync(path, lines.join('\n'))
  }
  return { 文档: rel, 补引入: inserts.length, 示例: inserts[0].text }
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
  /^homework\/ch\d\d-[^/]+\/kit\/CONTRACT.*\.md$/,
]

const targets = args.length ? args.map((a) => join(ROOT, a)) : collect(ROOT).filter((p) => INCLUDE.some((re) => re.test(p.slice(ROOT.length + 1).replace(/\\/g, '/'))))
const rows = []
for (const p of targets) {
  const rel = p.slice(ROOT.length + 1).replace(/\\/g, '/')
  const r = processFile(p, rel)
  if (r) rows.push(r)
}
rows.sort((a, b) => b.补引入 - a.补引入)
console.table(rows.slice(0, 25))
console.log(`${WRITE ? '已写入' : '待写入'} ${rows.length} 篇，共补 ${rows.reduce((n, r) => n + r.补引入, 0)} 处引入句`)
if (!WRITE) console.log('这是 dry-run，加 --write 落盘。')
