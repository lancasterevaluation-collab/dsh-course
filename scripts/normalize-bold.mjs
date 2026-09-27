// 收敛讲义中"同一段落/条目内加粗超过一处"的问题。
//
// 检查器（check-lecture.mjs）限制单个段落或条目内最多一处加粗，用于防止
// 全篇加粗导致重点失效。手工逐段调整成本高且容易遗漏，这里按空行切段，
// 对超过一处加粗的段只保留第一处，其余只去掉标记（保留文字）。
//
// 跳过表格、标题与围栏代码块：表格的加粗通常用于表头强调，代码块内的
// `**` 可能是运算符（例如 Python 的幂）。
//
// 用法：node scripts/normalize-bold.mjs <路径...>

import { readFileSync, writeFileSync } from "node:fs"

/** 是否跳过该段（表格与标题有自己的强调惯例）。 */
function skippable(firstLine) {
  return /^\s*\|/.test(firstLine) || /^#{1,6}\s/.test(firstLine) || /^\*\*[^*]+\*\*\s*$/.test(firstLine)
}

/** 保留段内第一处加粗，去掉其余加粗标记。 */
function normalizeSegment(lines) {
  const segment = lines.join("\n")
  const boldCount = (segment.match(/\*\*[^*]+\*\*/g) || []).length
  if (boldCount <= 1) return lines
  let seen = 0
  const normalized = segment.replace(/\*\*([^*]+)\*\*/g, (match, inner) => {
    seen += 1
    return seen === 1 ? match : inner
  })
  return normalized.split("\n")
}

/** 处理一个文件，返回改动的段数。 */
function processFile(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/)
  const output = []
  let buffer = []
  let inCode = false
  let changed = 0
  const flush = () => {
    if (!buffer.length) return
    if (skippable(buffer[0])) {
      output.push(...buffer)
    } else {
      const next = normalizeSegment(buffer)
      if (next.join("\n") !== buffer.join("\n")) changed += 1
      output.push(...next)
    }
    buffer = []
  }
  for (const line of lines) {
    if (/^```/.test(line)) {
      flush()
      inCode = !inCode
      output.push(line)
      continue
    }
    if (inCode) {
      output.push(line)
      continue
    }
    if (/^\s*$/.test(line)) {
      flush()
      output.push(line)
      continue
    }
    buffer.push(line)
  }
  flush()
  writeFileSync(path, output.join("\n"))
  return changed
}

let total = 0
for (const path of process.argv.slice(2)) {
  const changed = processFile(path)
  total += changed
  console.log(`${path} → 收敛 ${changed} 个段落`)
}
console.log(`共收敛 ${total} 个段落`)