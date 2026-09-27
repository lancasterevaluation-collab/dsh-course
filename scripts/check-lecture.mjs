// 讲义验证脚本（可复用）。用法：
//   node scripts/check-lecture.mjs 04-学习进化/4.5-演化.md
//   node scripts/check-lecture.mjs --all           # 检查全部讲义
//
// 检查项：17 节骨架锚点的齐全与顺序、字符数、全文与纯散文加粗率、段落内加粗超标数、
// 导论占比（≤20%）、L1+L3 占比（判断力型 ≥42%、实现型 ≥35%）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// 两套骨架并存：legacy 是重写前的 17 节，v2 是重写后的 16 节（五层范式）。
const ANCHORS_LEGACY = [
  '## 本篇新词', '## 第 0 节', '## 第 0.5 节', '## L0 要解决的问题', '## L1 设计与原理',
  '## L2 决策表', '@L3', '## L4 运行与验证', '## L5 语法速查',
  '## L6 关文档重写判据', '## L7 挑战题', '## L8 自检清单', '## L9 仍未解决',
  '## L10 提问训练', '## L11 系统影响回溯', '## 记忆锚点与复述练习', '## 全篇知识结构',
]
const ANCHORS_V2 = [
  '## 这一课怎么读', '## 本篇新词', '## 一、【设计原因】', '## 二、【直觉】',
  '## 三、【严格】', '## 四、【回到直觉】', '## 五、【工具箱】', '## 六、锚点表',
  '## 七、施工图与算例', '## 八、判据与数字回归', '## 九、决策表与失败模式',
  '## 十、仍未解决', '## 十一、提问训练', '## 十二、系统影响回溯',
  '## 十三、只记一句话 + 记忆锚点', '## 全篇知识结构',
]
const ANCHORS = ANCHORS_V2

// 判断力型（第 1 卷）门槛更高：其 L1 是原理主体。
const JUDGMENT_VOLUMES = ['01-判断力地基', '00-导论']

const boldLen = (x) => [...x.matchAll(/\*\*(.+?)\*\*/g)].reduce((n, m) => n + m[1].length, 0)

function check(absPath, relPath) {
  const s = readFileSync(absPath, 'utf8')
  const issues = []

  const skeleton = s.includes('## 三、【严格】') ? 'v2' : 'legacy'
  const list = skeleton === 'v2' ? ANCHORS_V2 : ANCHORS_LEGACY
  let last = -1
  for (const a of list) {
    // L3 有两种形态：判断力型是「案例逐段解析」，实现型是「施工图」
    const i = a === '@L3' ? Math.max(s.indexOf('## L3 实现（案例逐段解析）'), s.indexOf('## L3 实现（施工图）')) : s.indexOf(a)
    if (i < 0) { issues.push(`缺少锚点：${a}`); continue }
    if (i < last) issues.push(`锚点顺序错误：${a}`)
    last = i
  }

  // 拆成"单元"：散文段落、单个列表项、单行引用；表格/标题/代码块不参与。
  // 容器（:::）承载结构，其内部不参与散文统计（见 0.6 规范第 5.5 节）。
  // 代码块内容同样不是散文——它由围栏界定，内部的行可以是任意文本（含超长行）。
  const sNoFence = s
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^:::\s*\S[\s\S]*?^:::\s*$/gm, '')
    .replace(/^:::.*$/gm, '')
  const units = []
  for (const block of sNoFence.split(/\n\s*\n/)) {
    if (/^[|#]/.test(block) || block.startsWith('```')) continue
    if (/^>\s/.test(block)) { units.push(...block.split('\n').filter((l) => /^>\s/.test(l) && !/^>\s*\|/.test(l))); continue }
    if (/^([-*]|\d+\.)\s/.test(block)) { units.push(...block.split('\n').filter((l) => /^([-*]|\d+\.)\s/.test(l))); continue }
    units.push(block)
  }
  // 格式标记不是强调：证明起始、推导依据行、定义与命题的编号行、要点小结标题。
  const FORMAT_MARK = /^(\*\*(证明\.|定义 \d|命题 \d|本节要点|记忆锚点)\*\*|↓)/
  const proseUnits = units.filter((u) => !/^([-*]|\d+\.|>)\s/.test(u) && !FORMAT_MARK.test(u.trim()))
  // 加粗密度上限：理论密集篇（严格层含 ≥5 个定义或命题块）为 7.5 处/千字符，
  // 其余为 5 处/千字符。理由是定义与命题的标识加粗属于结构而非强调，
  // 与"表格、术语表不受限"是同一条逻辑（见 0.6 规范第 5.5 节）。
  const theoremBlocks = (s.match(/^:::\s*theorem/gm) ?? []).length
  const boldLimit = theoremBlocks >= 5 ? 7.5 : 5
  // 加粗判据用「密度」（处/千字符），不用「占比」。
  // 理由：占比与段落长度耦合——短段落各带一处强调时占比必然很高，而"每段一个重点"
  // 恰恰是本判据鼓励的写法；用占比会把它判为超标，用密度则不会。
  // 分母取容器外的正文（容器承载结构，其内部的强调属于容器语义）。
  const sForBold = s.replace(/```[\s\S]*?```/g, '').replace(/^:::\s*\S[\s\S]*?^:::\s*$/gm, '')
  const boldDensity = [...sForBold.matchAll(/\*\*(.+?)\*\*/g)].length / (sForBold.length / 1000)
  if (boldDensity > boldLimit) issues.push(`加粗密度 ${boldDensity.toFixed(1)} 处/千字符 > ${boldLimit}`)

  const bcount = (u) => [...u.matchAll(/\*\*(.+?)\*\*/g)].length
  const over = units.filter((u) => bcount(u) > 2)
  if (over.length > 0) issues.push(`单个段落/条目内加粗超标 ${over.length} 处：${over[0].slice(0, 30).replace(/\n/g, ' ')}…`)

  const emoji = [...s.matchAll(/[\u274C\u2705\uD83D\uDD34\u26A0\uD83D\uDC4D\uD83D\uDCA1]/gu)].length
  if (emoji > 0) issues.push(`含表情符号 ${emoji} 个`)

  // 篇幅按"去掉空白后的字符数"计算：空行与缩进不是内容，
  // 否则一次机械分段（只在句号处插入空行）就会让比例漂移。
  const len = (x) => x.replace(/\s/g, '').length
  const seg = (from, to) => len(s.slice(from, to))

  let intro
  let l1
  let l3
  if (skeleton === 'v2') {
    // 导论：怎么读 + 新词 + 设计原因 + 直觉
    // 主体：严格 + 回到直觉 + 工具箱（对应旧骨架的 L1）；施工图 + 判据（对应 L3）
    const i = {
      read: s.indexOf('## 这一课怎么读'), cause: s.indexOf('## 一、【设计原因】'),
      strict: s.indexOf('## 三、【严格】'), anchor: s.indexOf('## 六、锚点表'),
      build: s.indexOf('## 七、施工图与算例'), fail: s.indexOf('## 九、决策表与失败模式'),
    }
    intro = seg(i.read, i.strict)
    l1 = seg(i.strict, i.anchor)
    l3 = seg(i.build, i.fail)
  } else {
    const idx = {
      w: s.indexOf('## 本篇新词'), l0: s.indexOf('## L0'), l2: s.indexOf('## L2'),
      l4: s.indexOf('## L4'), l3: s.indexOf('## L3 实现'),
    }
    intro = seg(idx.w, idx.l0)
    l1 = seg(idx.l0, idx.l2)
    l3 = seg(idx.l3, idx.l4)
  }
  const total = len(s)
  const introPct = (intro / total) * 100
  const corePct = ((l1 + l3) / total) * 100
  const floor = JUDGMENT_VOLUMES.some((v) => relPath.startsWith(v)) ? 42 : 35

  if (introPct > 21) issues.push(`导论 ${introPct.toFixed(1)}% > 21%（目标 20%）`)
  if (corePct < floor) issues.push(`L1+L3 ${corePct.toFixed(1)}% < ${floor}%`)

  return {
    篇: relPath.replace(/\\/g, '/'),
    骨架: skeleton,
    字符: s.length,
    导论: `${introPct.toFixed(1)}%`,
    'L1+L3': `${corePct.toFixed(1)}%`,
    加粗密度: `${boldDensity.toFixed(1)} 处/千字符`,
    结构: issues.length === 0 ? '通过' : `${issues.length} 项待修`,
    问题: issues.join('；'),
  }
}

function collect(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (/^docs$|^appendix$|^homework$|^scripts$|^node_modules$/.test(name)) continue
      collect(full, acc)
    } else if (name.endsWith('.md') && !/^(README|AGENTS)/.test(name)) {
      const rel = full.slice(ROOT.length + 1)
      if (/^\d\d-[^\\/]+[\\/]\d+\.\d+-/.test(rel) && !rel.replace(/\\/g, '/').startsWith('00-导论/')) acc.push([full, rel])
    }
  }
  return acc
}

const args = process.argv.slice(2)
const targets = args.includes('--all') || args.length === 0 ? collect(ROOT) : args.map((a) => [join(ROOT, a), a])

const rows = targets.map(([full, rel]) => check(full, rel))
console.table(rows)

const failed = rows.filter((r) => r.结构 !== '通过')
console.log(`共 ${rows.length} 篇：通过 ${rows.length - failed.length}，待修 ${failed.length}`)
if (failed.length) for (const f of failed) console.log(`  ${f.篇} → ${f.问题}`)
