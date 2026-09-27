/**
 * 第 2 卷 · 最小闭环 · 判分总入口
 *
 * 沿用 CS336 的做法：判分器就是一组能被反复运行的检查。
 * 这个文件调度各篇的判分器，并折算本卷总分。
 *
 * 用法：
 *   node tests/run.mjs                     跑全部已实现的判分项
 *   node tests/run.mjs --only t3           只跑某一项（前缀匹配）
 *   node tests/run.mjs --verbose           打印单项判分的完整输出
 *   node tests/run.mjs --answers-a2 <路径> 指定 2.2 的答卷（默认 kit/answers/a2-tools.json）
 *   node tests/run.mjs --help              看这份说明
 *
 * 退出码：总分 >= 60 时为 0。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
 * 本卷的判分项。权重合计 100。
 *
 * 2.1（模型层）占 30：客观题 24 + 构建题 6。
 * 2.2（工具系统）占 30：客观题 24 + 构建题 6。
 * 其余各项随讲义推进陆续加入——它们对应 2.3–2.7 五篇，每篇同样按"客观 + 构建"两项记。
 */
const WEIGHTS = { t1: 24, t2: 6, t3: 24, t4: 6 }

/** 跑一个判分脚本，返回它的输出。 */
function runGrader(file, args = [], env = {}) {
  try {
    return execFileSync(process.execPath, [join(HERE, file), ...args], {
      cwd: CH,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
  } catch (err) {
    // 判分器可能以非零退出码结束（分数不及格），那是正常结果。
    return (err.stdout ?? '') + (err.stderr ?? '')
  }
}

/** 从判分器输出里抽分数。各判分器格式略有差异，依次尝试。 */
function parseScore(out) {
  const patterns = [/客观题：\s*([\d.]+)\s*\/\s*([\d.]+)/, /总分：\s*([\d.]+)\s*\/\s*([\d.]+)/, /([\d.]+)\s*\/\s*([\d.]+)/]
  for (const re of patterns) {
    const m = re.exec(out)
    if (m) return { earned: Number(m[1]), total: Number(m[2]) }
  }
  return null
}

const tasks = [
  {
    key: 't1',
    label: 't1-llm     2.1 模型层 · 客观题',
    run: () => runGrader('t1-llm.mjs', ['--answers', argOf('--answers', 'kit/answers/a1-llm.json')]),
  },
  {
    key: 't2',
    label: 't2-build   2.1 模型层 · 构建题',
    run: () => runGrader('t2-build.mjs', [], { IMPL: process.env.IMPL ?? '../kit/src/llm.mjs' }),
  },
  {
    key: 't3',
    label: 't3-tools    2.2 工具系统 · 客观题',
    run: () => runGrader('t3-tools.mjs', ['--answers', argOf('--answers-a2', 'kit/answers/a2-tools.json')]),
  },
  {
    key: 't4',
    label: 't4-build    2.2 工具系统 · 构建题',
    // ★ 与 t2 分开的变量名：两者都要 IMPL，但指向不同的文件。
    run: () => runGrader('t4-build.mjs', [], { IMPL: process.env.IMPL_TOOLS ?? '../kit/src/tools.mjs' }),
  },
]

const selected = tasks.filter((t) => !ONLY || t.key.startsWith(ONLY))

console.log('')
console.log('  第 2 卷 · 最小闭环 · 判分')
console.log('  ' + '─'.repeat(56))
console.log('')

const results = []
for (const task of selected) {
  const out = task.run()
  const score = parseScore(out)
  if (!score) {
    console.log(`  ${task.label}\n    ✗ 判分器没有给出分数\n`)
    results.push({ ...task, pct: 0 })
    continue
  }
  const pct = score.earned / score.total
  const bar = '█'.repeat(Math.round(pct * 20)).padEnd(20, '░')
  const rating = pct >= 0.9 ? '优秀' : pct >= 0.75 ? '良好' : pct >= 0.6 ? '及格' : '需要重做'
  console.log(`  ${task.label}`)
  console.log(`    ${bar}  ${score.earned.toFixed(1)}/${score.total}    ${rating}`)
  console.log('')
  results.push({ ...task, pct })
  if (VERBOSE) console.log(out)
}

// 未实现的判分项要如实列出——它们不是"通过"，而是"还没有"
const pending = [
  ['t5', '2.3 容器与依赖注入', '讲义与作业尚未写作'],
  ['t6', '2.4 事件与扩展点', '讲义与作业尚未写作'],
  ['t7', '2.5 作用域与隔离', '讲义与作业尚未写作'],
  ['t8', '2.6 装配与配置组合', '讲义与作业尚未写作'],
  ['t9', '2.7 会话日志与循环', '讲义与作业尚未写作'],
]

console.log('  ' + '─'.repeat(56))
console.log('  尚未实现的判分项：')
for (const [key, label, why] of pending) {
  console.log(`    ${key.padEnd(4)} ${label.padEnd(38)} ${why}`)
}
console.log('')

const headline = Object.keys(WEIGHTS).map((key) => {
  const r = results.find((x) => x.key === key)
  return { key, pct: r?.pct ?? 0 }
})
const total = headline.reduce((sum, h) => sum + h.pct * WEIGHTS[h.key], 0)
const maxTotal = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)

console.log(`  本卷当前满分：${maxTotal}（全部判分项实现后为 100）`)
console.log(`  折算总分：${total.toFixed(1)} / ${maxTotal}`)
console.log('')
console.log(`  讲义：../../02-最小闭环/`)
console.log(`  单项详情：node tests/<名称>.mjs --verbose`)
console.log('')

const missingAnswers = [
  ['kit/answers/a1-llm.json', 'kit/problems/a1-llm.template.json', '2.1'],
  ['kit/answers/a2-tools.json', 'kit/problems/a2-tools.template.json', '2.2'],
].filter(([answers]) => !existsSync(join(CH, answers)))

if (missingAnswers.length) {
  console.log('  ⚠️ 还没有作答文件：')
  for (const [answers, template, chapter] of missingAnswers) {
    console.log(`     ${chapter}：从 ${template} 复制一份到 ${answers}`)
  }
  console.log('')
}

process.exit(total >= maxTotal * 0.6 ? 0 : 1)
