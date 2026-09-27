// 按标题重新生成讲义目录表里的锚点。
//
// 背景：讲义目录表的锚点最初是手写的，规则不统一（`3.1 每篇的固定结构`
// 被写成 `31每篇的固定结构`，而 `3.1 触发：用线不用上限` 被写成
// `31-触发用线不用上限`）。只有一处规则能生效，另一处必然点不动。
//
// 做法：用与 .vitepress/config.mts 里相同的 slugify 从标题算出 id，
// 再按「目录表条目文字 == 标题文字」把锚点替换掉。
//
// 用法：node scripts/fix-anchors.mjs <路径...>

import { readFileSync, writeFileSync } from 'node:fs'

/** 与 .vitepress/config.mts 的 anchor.slugify 保持一致。 */
const slugify = (str) =>
  str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, '')
    .toLowerCase()

/** 用于把「目录条目文字」与「标题文字」对上：去掉一切标点与空白。 */
const normalize = (str) => str.replace(/[\s、：，。！？（）【】《》；：“”‘’\-_.·]/g, '')

/** 处理一个文件，返回改掉的锚点数。 */
function processFile(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)

  const headings = []
  for (const line of lines) {
    const match = line.match(/^#{2,3}\s+(.*)$/)
    if (match) {
      const text = match[1].replace(/\s*#+\s*$/, '').trim()
      headings.push({ key: normalize(text), id: slugify(text) })
    }
  }
  if (headings.length === 0) return 0

  // 目录条目的文字常常只是标题的一部分（「3.1 十站清单」对
  // 「3.1 十站清单：每一站的产出」），所以先精确匹配，再按前缀匹配。
  const lookup = (label) => {
    const key = normalize(label)
    const exact = headings.find((h) => h.key === key)
    if (exact) return exact.id
    const byPrefix = headings.find((h) => h.key.startsWith(key))
    return byPrefix ? byPrefix.id : null
  }

  let changed = 0
  const output = lines.map((line) => {
    if (line.startsWith('```')) return line
    return line.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (whole, label, anchor) => {
      const id = lookup(label)
      if (!id || id === anchor) return whole
      changed += 1
      return `[${label}](#${id})`
    })
  })
  writeFileSync(path, output.join('\n'))
  return changed
}

let total = 0
for (const path of process.argv.slice(2)) {
  const changed = processFile(path)
  total += changed
  if (changed > 0) console.log(`${path} → 修正 ${changed} 个锚点`)
}
console.log(`共修正 ${total} 个锚点`)