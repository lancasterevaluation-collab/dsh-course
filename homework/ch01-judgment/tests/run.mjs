/**
 * 第 1 卷 · 判断力地基 · 判分总入口
 *
 * 沿用 CS336 的做法：判分器就是一组可以被反复运行的测试。
 * 这个文件只做三件事——调度单项判分、检查非自动判分的作答是否填齐、折算总分。
 *
 * 用法：
 *   node tests/run.mjs               跑全部
 *   node tests/run.mjs --only t4     只跑某一项（前缀匹配）
 *   node tests/run.mjs --verbose     把单项判分的完整输出打出来
 *   node tests/run.mjs --help        看这份说明
 *
 * 退出码：总分 >= 60 时为 0，否则为 1（便于接进 CI）。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CH = join(HERE, '..')

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

if (has('--help') || has('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 18).join('\n'))
  process.exit(0)
}

const VERBOSE = has('--verbose')
const ONLY = argOf('--only', '')

/**
 * 换算权重。每项先归一到百分制，再按这里的权重加权，合计 100。
 *
 * 为什么 t4 的权重最高：它同时考概念（承诺分类）与判断（破坏性改动），
 * 而这两样是后面所有章节的地基——读不出契约的人无法评审任何接口改动。
 */
const WEIGHTS = { t3: 25, t4: 35, t5: 30, notes: 10 }

/** 跑一个判分脚本，把它输出里的总分抽出来。 */
function runGrader(file, args = [], env = {}) {
  const out = execFileSync(process.execPath, [join(HERE, file), ...args], {
    cwd: CH,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return out
}

/** 从判分器的输出里抽总分。各判分器的格式略有差异，所以用一组模式依次尝试。 */
function parseScore(out) {
  const patterns = [
    /总分：\s*([\d.]+)\s*\/\s*([\d.]+)/,
    /客观题：\s*([\d.]+)\s*\/\s*([\d.]+)/,
    /得分：\s*([\d.]+)\s*\/\s*([\d.]+)/,
  ]
  for (const re of patterns) {
    const m = re.exec(out)
    if (m) return { earned: Number(m[1]), total: Number(m[2]) }
  }
  return null
}

/** 检查一份作答文件是否填齐（非空、且不含模板占位符）。 */
function checkNotes() {
  const required = [
    ['answers/a1-lifecycle.md', '1.1 一个功能的一生'],
    ['answers/a2-debt.md', '1.2 复杂度与技术债'],
  ]
  const filled = []
  const missing = []
  for (const [rel, label] of required) {
    const p = join(CH, 'kit', rel)
    if (!existsSync(p)) {
      missing.push(`${label}（${rel} 不存在）`)
      continue
    }
    const text = readFileSync(p, 'utf8')
    // 模板里的占位符是「← 在这里写」。还有它，就说明没动过。
    const untouched = text.includes('← 在这里写') || text.trim().length < 400
    if (untouched) missing.push(`${label}（${rel} 还是模板）`)
    else filled.push(label)
  }
  return { filled, missing, ratio: filled.length / required.length }
}

const tasks = [
  {
    key: 't3',
    label: 't3-architecture  读代码与架构',
    run: () => runGrader('t3-architecture.mjs', ['--answers', 'kit/answers/a3-architecture.json', '--repo', argOf('--repo', 'D:\\dsh-mini')]),
  },
  {
    key: 't4',
    label: 't4-contract      接口与契约（分析）',
    run: () => runGrader('t4-contract.mjs', ['--answers', 'kit/answers/a4-contract.json']),
  },
  {
    key: 't5',
    label: 't5-build         接口与契约（构建）',
    run: () => runGrader('t5-build.mjs', [], { IMPL: process.env.IMPL ?? '../kit/src/memory.mjs' }),
  },
]

const selected = tasks.filter((t) => !ONLY || t.key.startsWith(ONLY))

console.log('')
console.log('  第 1 卷 · 判断力地基 · 判分')
console.log('  ' + '─'.repeat(58))
console.log('')

const results = []
for (const task of selected) {
  let out = ''
  let score = null
  try {
    out = task.run()
    score = parseScore(out)
  } catch (err) {
    // 判分器有两种失败：抛异常（脚本崩了）与退出码非零（分数不及格）。
    // 后者是正常结果，所以要把 stdout 留下并继续解析。
    out = (err.stdout ?? '') + (err.stderr ?? '')
    score = parseScore(out)
    if (!score) {
      console.log(`  ${task.label}\n    ✗ 判分器执行失败：${String(err.message).split('\n')[0]}\n`)
      results.push({ ...task, score: null })
      continue
    }
  }
  const pct = score ? score.earned / score.total : 0
  const bar = '█'.repeat(Math.round(pct * 20)).padEnd(20, '░')
  console.log(`  ${task.label}`)
  console.log(`    ${bar}  ${score ? score.earned.toFixed(1) : '—'}/${score ? score.total : '—'}`)

  if (score) {
    const rating = pct >= 0.9 ? '优秀' : pct >= 0.75 ? '良好' : pct >= 0.6 ? '及格' : '需要重做'
    console.log(`    ${rating}`)
  }
  console.log('')
  results.push({ ...task, score, pct })
  if (VERBOSE) console.log(out)
}

const notes = checkNotes()
console.log('  t0-notes         作答完整性（a1 / a2）')
console.log(`    ${'█'.repeat(Math.round(notes.ratio * 20)).padEnd(20, '░')}  ${notes.filled.length}/2`)
if (notes.missing.length) console.log(`    还差：${notes.missing.join('；')}`)
console.log('')

// 折算总分
const headline = Object.keys(WEIGHTS).map((key) => {
  if (key === 'notes') return { key, pct: notes.ratio }
  const r = results.find((x) => x.key === key)
  return { key, pct: r?.pct ?? 0 }
})

const total = headline.reduce((sum, h) => sum + h.pct * WEIGHTS[h.key], 0)
const maxTotal = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)

console.log('  ' + '─'.repeat(58))
console.log(`  折算总分：${total.toFixed(1)} / ${maxTotal}`)
console.log('')
console.log('  折算规则：')
for (const key of Object.keys(WEIGHTS)) {
  const h = headline.find((x) => x.key === key)
  console.log(`    ${key.padEnd(6)} ${String(WEIGHTS[key]).padStart(3)}%  ×  ${(h.pct * 100).toFixed(0).padStart(3)}%  =  ${(h.pct * WEIGHTS[key]).toFixed(1).padStart(4)}`)
}
console.log('')
console.log('  单项详情：node tests/<名称>.mjs --verbose')
console.log('')

process.exit(total >= 60 ? 0 : 1)
