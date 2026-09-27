// 汇总：依次跑四个 Part 并给出总分。
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const A_ANSWERS = process.env.A_ANSWERS ?? 'kit/answers/a-problems.json'
const B_ANSWERS = process.env.B_ANSWERS ?? 'kit/answers/b-observations.json'

const SUITES = [
  { title: 'Part A · 问题清单', file: 't1-problems.mjs', weight: 25, args: ['--answers', A_ANSWERS] },
  { title: 'Part B · 观察与转化', file: 't2-observations.mjs', weight: 20, args: ['--answers', B_ANSWERS] },
  { title: 'Part C · 统计', file: 't3-stats.mjs', weight: 30, args: [] },
  { title: 'Part D · 实验设计与报告', file: 't4-experiment.mjs', weight: 25, args: [] },
]

const rows = []
let total = 0
let max = 0
for (const s of SUITES) {
  const r = spawnSync(process.execPath, [join(HERE, s.file), ...s.args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env } })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const m = /总分\s+([\d.]+)\s*\/\s*(\d+)/.exec(out)
  const score = m ? Number(m[1]) : 0
  const cap = m ? Number(m[2]) : s.weight
  const passed = /小计：(\d+)\/(\d+)/.exec(out)
  rows.push({ title: s.title, score, cap, detail: passed ? `${passed[1]}/${passed[2]} 条判据` : '未运行（读不到输出）' })
  total += score
  max += cap
}

console.log('\n══════════════════════════════════════════════════')
console.log('大作业六 · 科研出口　总分')
console.log('──────────────────────────────────────────────────')
for (const r of rows) console.log(`  ${r.title.padEnd(24, ' ')} ${String(r.score).padStart(7)} / ${String(r.cap).padStart(3)}   ${r.detail}`)
console.log('──────────────────────────────────────────────────')
console.log(`  ${'合计'.padEnd(24, ' ')} ${String(Math.round(total * 100) / 100).padStart(7)} / ${String(max).padStart(3)}`)
console.log('══════════════════════════════════════════════════\n')
console.log('提示：这一卷的判据在校对「结论有没有被噪声解释掉」。若你的实现总能发现显著差异，')
console.log('      先看 compare 里的区间重叠判断。')

process.exit(total === max ? 0 : 1)
