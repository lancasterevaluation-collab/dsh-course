// 汇总：依次跑六个 Part 并给出总分。
//
// 用法：node tests/run.mjs
//       IMPL=../grade/context.reference.mjs node tests/run.mjs   （只对构建题生效）
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// 答案路径可被环境变量覆盖（用于拿参考答案验证测试本身）。
const A_ANSWERS = process.env.A_ANSWERS ?? 'kit/answers/a-retry.json'
const B_ANSWERS = process.env.B_ANSWERS ?? 'kit/answers/b-guard.json'

const SUITES = [
  { title: 'Part A · 重试与错误分类', file: 't1-retry.mjs', weight: 15, args: ['--answers', A_ANSWERS] },
  { title: 'Part B · 守卫与审批', file: 't2-guard.mjs', weight: 15, args: ['--answers', B_ANSWERS] },
  { title: 'Part C · 压缩与溢出', file: 't3-context.mjs', weight: 15, args: [] },
  { title: 'Part D · 进程与作业', file: 't4-proc.mjs', weight: 20, args: [] },
  { title: 'Part E · 持久化与恢复', file: 't5-persist.mjs', weight: 20, args: [] },
  { title: 'Part F · 可观测', file: 't6-metrics.mjs', weight: 15, args: [] },
]

const rows = []
let total = 0
let max = 0

for (const s of SUITES) {
  const r = spawnSync(process.execPath, [join(HERE, s.file), ...s.args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const m = /总分\s+([\d.]+)\s*\/\s*(\d+)/.exec(out)
  const score = m ? Number(m[1]) : 0
  const cap = m ? Number(m[2]) : s.weight
  const passed = /小计：(\d+)\/(\d+)/.exec(out)
  rows.push({
    title: s.title,
    score,
    cap,
    detail: passed ? `${passed[1]}/${passed[2]} 条判据` : '未运行（读不到输出）',
  })
  total += score
  max += cap
}

console.log('\n══════════════════════════════════════════════════')
console.log('大作业三 · 可靠性与纵深　总分')
console.log('──────────────────────────────────────────────────')
for (const r of rows) {
  console.log(`  ${r.title.padEnd(26, ' ')} ${String(r.score).padStart(7)} / ${String(r.cap).padStart(3)}   ${r.detail}`)
}
console.log('──────────────────────────────────────────────────')
console.log(`  ${'合计'.padEnd(26, ' ')} ${String(Math.round(total * 100) / 100).padStart(7)} / ${String(max).padStart(3)}`)
console.log('══════════════════════════════════════════════════\n')
console.log('提示：明细里的「不通过」后面跟的是一条判据的名字，而每条判据的意图在')
console.log('      kit/CONTRACT.md 与对应讲义里。先看判据再改代码，通常更快。')

process.exit(total === max ? 0 : 1)
