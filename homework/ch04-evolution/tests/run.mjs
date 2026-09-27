// 汇总：依次跑六个 Part 并给出总分。
//
// 用法：node tests/run.mjs
//       IMPL_TEMPLATE=../grade/{name}.reference.mjs node tests/run.mjs
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

const A_ANSWERS = process.env.A_ANSWERS ?? 'kit/answers/a-memory.json'
const B_ANSWERS = process.env.B_ANSWERS ?? 'kit/answers/b-diagnosis.json'

const SUITES = [
  { title: 'Part A · 写入与触发策略', file: 't1-memory-policy.mjs', weight: 15, args: ['--answers', A_ANSWERS] },
  { title: 'Part B · 诊断与可行动性', file: 't2-diagnosis.mjs', weight: 15, args: ['--answers', B_ANSWERS] },
  { title: 'Part C · 记忆系统', file: 't3-memory.mjs', weight: 20, args: [] },
  { title: 'Part D · 用户模型', file: 't4-user-model.mjs', weight: 15, args: [] },
  { title: 'Part E · 演化与门控', file: 't5-evolution.mjs', weight: 15, args: [] },
  { title: 'Part F · 长程与复盘', file: 't6-longhorizon.mjs', weight: 20, args: [] },
]

const rows = []
let total = 0
let max = 0

for (const s of SUITES) {
  const r = spawnSync(process.execPath, [join(HERE, s.file), ...s.args], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env },
  })
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
console.log('大作业四 · 学习进化　总分')
console.log('──────────────────────────────────────────────────')
for (const r of rows) {
  console.log(`  ${r.title.padEnd(24, ' ')} ${String(r.score).padStart(7)} / ${String(r.cap).padStart(3)}   ${r.detail}`)
}
console.log('──────────────────────────────────────────────────')
console.log(`  ${'合计'.padEnd(24, ' ')} ${String(Math.round(total * 100) / 100).padStart(7)} / ${String(max).padStart(3)}`)
console.log('══════════════════════════════════════════════════\n')
console.log('提示：这一卷有一半判据在检验「该拒绝时拒绝了吗」。如果你的实现总是「答应」，')
console.log('      先去看门控与过滤器的顺序——它们在打分或写入之前。')

process.exit(total === max ? 0 : 1)
