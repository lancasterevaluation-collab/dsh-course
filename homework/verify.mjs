// 六个作业的三组验证基线。
//
// 每组基线的期望值是固定的，任一项不符即判定这条基线失败：
//   起点基线：不设任何参考实现与答案时，六个作业都必须得 0 分；
//   参考基线：用 grade/ 下的参考实现与参考答案时，六个作业都必须得满分；
//   负向基线：grade/negative-check.mjs 必须抓住全部"看起来对、其实错"的实现。
//
// 参考基线需要多轮才能跑满：tests/run.mjs 的 IMPL 环境变量一次只对一个
// 构建题生效，答案题也分 A_ANSWERS 与 B_ANSWERS。因此这里逐个参考文件
// 各跑一轮，再按 Part 取各轮的最大值合成"参考总分"。
//
// 用法：node homework/verify.mjs [章节名...]

import { spawnSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 六个作业目录，按主线顺序。 */
const CHAPTERS = [
  'ch01-judgment',
  'ch02-loop',
  'ch03-reliability',
  'ch04-evolution',
  'ch05-scale',
  'ch06-research',
]

/** 从测试输出里解析每个 Part 的得分与满分。 */
function parseParts(output) {
  const parts = new Map()
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s{2}(Part \S+)\s*·\s*(.+?)\s+(\d+)\s*\/\s*(\d+)\s/)
    if (m) parts.set(m[1], { title: m[2].trim(), score: Number(m[3]), max: Number(m[4]) })
  }
  if (parts.size) return parts
  // 兼容折算式输出：ch01 / ch02 汇总的是一张加权折算表，只给一个总分。
  const total = output.match(/折算总分：([\d.]+)\s*\/\s*(\d+)/)
  if (total) parts.set('合计', { title: '折算总分', score: Number(total[1]), max: Number(total[2]) })
  return parts
}

/** 按 Part 取各轮最大值，得到参考基线的合成成绩。 */
function mergeBest(best, parts) {
  for (const [key, value] of parts) {
    const previous = best.get(key)
    if (!previous || value.score > previous.score) best.set(key, value)
  }
  return best
}

/** 在某个作业目录里跑一条命令，返回合并后的输出。 */
function runIn(chapter, args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: join(HERE, chapter),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

/** 列出作业 grade 目录下匹配后缀的文件。 */
function gradeFiles(chapter, suffix) {
  const dir = join(HERE, chapter, 'grade')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => name.endsWith(suffix)).sort()
}

/** 汇总一个作业的三组基线，返回结论行。 */
function verifyChapter(chapter) {
  const lines = []
  lines.push(`\n=== ${chapter} ===`)

  const startParts = parseParts(runIn(chapter, ['tests/run.mjs']))
  const startTotal = [...startParts.values()].reduce((sum, p) => sum + p.score, 0)
  const startMax = [...startParts.values()].reduce((sum, p) => sum + p.max, 0)
  const startOk = startParts.size > 0 && startTotal === 0
  lines.push(`  起点基线：${startTotal} / ${startMax}  ${startOk ? '通过（预期 0 分）' : '不通过（预期 0 分）'}`)

  const best = new Map()
  mergeBest(best, startParts)
  const refs = gradeFiles(chapter, '.reference.mjs')
  const examples = gradeFiles(chapter, '.example.json')
  const isAggregate = startParts.has('合计')
  if (isAggregate) {
    // 折算型作业（ch01 / ch02）只输出一个总分，逐轮取最大值无法合成满分，
    // 所以把全部参考实现与参考答案一次性传给同一轮。
    const env = {}
    if (refs.length === 1) env.IMPL = `../grade/${refs[0]}`
    else {
      // 多个参考实现时按名字映射（llm → IMPL_LLM、tools → IMPL_TOOLS），
      // 因为同一轮里两个构建题需要指向不同的文件。
      for (const name of refs) {
        const key = name.replace(/\.reference\.mjs$/, '').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
        env[`IMPL_${key}`] = `../grade/${name}`
      }
    }
    if (examples[0]) env.A_ANSWERS = `grade/${examples[0]}`
    if (examples[1]) env.B_ANSWERS = `grade/${examples[1]}`
    // 作答类判据（notes）从参考答案目录读，用于验证它自身可被满足。
    if (existsSync(join(HERE, chapter, 'grade', 'answers'))) env.NOTES_DIR = 'grade/answers'
    mergeBest(best, parseParts(runIn(chapter, ['tests/run.mjs'], env)))
  } else {
    for (const name of refs) {
      mergeBest(best, parseParts(runIn(chapter, ['tests/run.mjs'], { IMPL: `../grade/${name}` })))
    }
    for (const name of examples) {
      mergeBest(best, parseParts(runIn(chapter, ['tests/run.mjs'], { A_ANSWERS: `grade/${name}` })))
      mergeBest(best, parseParts(runIn(chapter, ['tests/run.mjs'], { B_ANSWERS: `grade/${name}` })))
    }
  }
  const refTotal = [...best.values()].reduce((sum, p) => sum + p.score, 0)
  const refMax = [...best.values()].reduce((sum, p) => sum + p.max, 0)
  const refOk = refMax > 0 && refTotal === refMax
  lines.push(`  参考基线：${refTotal} / ${refMax}  ${refOk ? '通过（满分）' : '不通过（应满分）'}`)
  if (!refOk) {
    const short = [...best.entries()]
      .filter(([, p]) => p.score < p.max)
      .map(([key, p]) => `${key} ${p.score}/${p.max}`)
    if (short.length) lines.push(`            未满分的 Part：${short.join('、')}`)
  }

  const negativeOutput = runIn(chapter, ['grade/negative-check.mjs'])
  const caught = (negativeOutput.match(/已抓住|变体 \d+：/g) ?? []).length
  const summary =
    negativeOutput.match(/结果：(\d+)\/(\d+)\s*类错误被抓住/) ??
    negativeOutput.match(/(\d+)\/(\d+)\s*个变体被正确抓住/)
  const missed = summary ? Number(summary[2]) - Number(summary[1]) : 0
  const negativeOk = caught > 0 && missed === 0
  lines.push(`  负向基线：抓住 ${caught} 类、漏掉 ${missed} 类  ${negativeOk ? '通过' : '不通过'}`)
  if (negativeOk === false && caught === 0) {
    lines.push('            未找到负向检查输出（grade/negative-check.mjs 是否可运行？）')
  }

  return { chapter, startOk, refOk, negativeOk, lines }
}

const requested = process.argv.slice(2)
const targets = requested.length ? requested : CHAPTERS
const results = targets.map(verifyChapter)
for (const result of results) for (const line of result.lines) console.log(line)

const failed = results.filter((r) => !(r.startOk && r.refOk && r.negativeOk))
console.log(`\n共 ${results.length} 个作业：三组基线全通过 ${results.length - failed.length}，失败 ${failed.length}`)
if (failed.length) {
  console.log(`失败的作业：${failed.map((r) => r.chapter).join('、')}`)
  process.exitCode = 1
}
