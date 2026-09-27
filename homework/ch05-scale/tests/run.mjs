// 汇总：依次跑六个 Part 并给出总分。
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const A_ANSWERS = process.env.A_ANSWERS ?? 'kit/answers/a-profile.json'
const B_ANSWERS = process.env.B_ANSWERS ?? 'kit/answers/b-delegation.json'

const SUITES = [
  { title: 'Part A · 模式与审批的分析', file: 't1-profile-policy.mjs', weight: 15, args: ['--answers', A_ANSWERS] },
  { title: 'Part B · 派发协议与信任边界', file: 't2-delegation-policy.mjs', weight: 15, args: ['--answers', B_ANSWERS] },
  { title: 'Part C · 模式与预设', file: 't3-profile.mjs', weight: 20, args: [] },
  { title: 'Part D · 多会话与并发', file: 't4-session.mjs', weight: 20, args: [] },
  { title: 'Part E · 交互与权限', file: 't5-interaction.mjs', weight: 15, args: [] },
  { title: 'Part F · 派发与外部工具', file: 't6-delegation.mjs', weight: 15, args: [] },
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
console.log('大作业五 · 规模化与交互　总分')
console.log('──────────────────────────────────────────────────')
for (const r of rows) console.log(`  ${r.title.padEnd(26, ' ')} ${String(r.score).padStart(7)} / ${String(r.cap).padStart(3)}   ${r.detail}`)
console.log('──────────────────────────────────────────────────')
console.log(`  ${'合计'.padEnd(26, ' ')} ${String(Math.round(total * 100) / 100).padStart(7)} / ${String(max).padStart(3)}`)
console.log('══════════════════════════════════════════════════\n')
console.log('提示：这一卷的判据大多在核对「两份输入互不影响」。若单份正确而两份出错，')
console.log('      多半是共享了不该共享的可变状态（讲义 5.2 的 0.0 那条判据）。')

process.exit(total === max ? 0 : 1)
