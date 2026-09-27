// 为紧跟在表格、标题或另一个代码块之后的围栏代码块补一句引入。
//
// 检查器（check-lecture.mjs）要求每个围栏代码块前有一个散文单元；紧跟在
// 表格或标题之后的代码块会违反这一条。这里按行定位这类代码块，在围栏前
// 插入一句中性的过渡句，并打印位置供人工润色。
//
// 用法：node scripts/fix-code-intro.mjs <路径...>

import { readFileSync, writeFileSync } from "node:fs"

const INTRO = '实现如下。'

/** 该行是否把代码块引到一个非散文的上下文。 */
function blocksIntro(line) {
  return /^\s*\|/.test(line) || /^#{1,6}\s/.test(line) || /^```/.test(line) || /^\*\*[^*]+\*\*\s*$/.test(line)
}

/** 处理一个文件，返回插入处数及位置。 */
function processFile(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const output = []
  const inserted = []
  let inCode = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^```/.test(line)) {
      if (!inCode) {
        let j = i - 1
        while (j >= 0 && /^\s*$/.test(lines[j])) j -= 1
        if (j >= 0 && blocksIntro(lines[j])) {
          output.push(INTRO, '')
          inserted.push(i + 1)
        }
      }
      inCode = !inCode
    }
    output.push(line)
  }
  writeFileSync(path, output.join('\n'))
  return inserted
}

let total = 0
for (const path of process.argv.slice(2)) {
  const at = processFile(path)
  total += at.length
  console.log(`${path} → 补引入 ${at.length} 处（原行 ${at.join(', ') || '无'}）`)
}
console.log(`共补 ${total} 处`)