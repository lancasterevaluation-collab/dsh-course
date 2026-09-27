/**
 * 2.2 工具系统 · 客观题判分
 *
 * 对应 CS336 的 tests/：判分器就是一组能被反复运行的检查。
 * 三组题（共 80 分）自动判分：
 *   A 组 · 给模型看的那部分写得好不好（12 题 × 3 分 = 36）
 *   B 组 · 副作用等级（8 题 × 3 分 = 24）
 *   C 组 · 术语（10 题 × 2 分 = 20）
 * 另有 D 组构建题 20 分，由 tests/t4-build.mjs 判。
 *
 * 题面：kit/problems/a2-tools.questions.md
 * 用法：
 *   node tests/t3-tools.mjs --answers kit/answers/a2-tools.json [--verbose]
 *
 * 判分口径（本作业固定）：逐题全对才给分，不做部分分。
 */

import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const VERBOSE = argv.includes('--verbose')
const ANSWERS_PATH = argOf('--answers', 'kit/answers/a2-tools.json')

/** A 组答案。取值：usable / broken（模型能不能只凭这段文字正确地用一次）。 */
const A_KEY = {
  1: 'broken', 2: 'broken', 3: 'usable', 4: 'broken', 5: 'broken', 6: 'usable',
  7: 'broken', 8: 'broken', 9: 'broken', 10: 'usable', 11: 'broken', 12: 'usable',
}

/** B 组答案。取值：readonly / reversible / irreversible / external。 */
const B_KEY = {
  1: 'readonly', 2: 'reversible', 3: 'irreversible', 4: 'irreversible',
  5: 'irreversible', 6: 'readonly', 7: 'external', 8: 'external',
}

/** C 组答案。术语名要写对（允许常见同义写法）。 */
const C_KEY = {
  1: ['工具', 'tool'],
  2: ['json schema', 'jsonschema', 'json schema 子集'],
  3: ['副作用等级', '副作用分级'],
  4: ['可逆性', '可逆'],
  5: ['注册表', 'registry'],
  6: ['扩展点', 'extension point'],
  7: ['参数校验', '参数验证', '参数校验器'],
  8: ['失败是返回值', '失败即返回值', '失败是正常返回值'],
  9: ['最小防线', '最小防线检查'],
  10: ['能力边界', '工具能力边界'],
}

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

let answers
try {
  const raw = readFileSync(ANSWERS_PATH, 'utf8').replace(/^\uFEFF/, '')
  answers = JSON.parse(raw)
} catch (err) {
  console.error(`读不到答卷：${ANSWERS_PATH}`)
  console.error(`原因：${err.message}`)
  console.error('提示：从 kit/problems/a2-tools.template.json 复制一份到 kit/answers/a2-tools.json 再填。')
  process.exit(2)
}

const results = []

// ── A 组 ────────────────────────────────────────────────
{
  const given = answers.A?.items ?? {}
  const right = []
  const wrong = []
  for (const [n, expected] of Object.entries(A_KEY)) {
    const got = norm(given[n])
    if (got === expected) right.push(n)
    else wrong.push(`${n}（你答 ${given[n] ?? '空'}，应为 ${expected}）`)
  }
  results.push({
    label: 'A 组 · 给模型看的那部分（12 题 × 3 分）',
    score: right.length * 3,
    max: 36,
    detail: `答对 ${right.length}/${Object.keys(A_KEY).length}`,
    wrong,
  })
}

// ── B 组 ────────────────────────────────────────────────
{
  const given = answers.B?.items ?? {}
  const right = []
  const wrong = []
  for (const [n, expected] of Object.entries(B_KEY)) {
    const got = norm(given[n])
    if (got === expected) right.push(n)
    else wrong.push(`${n}（你答 ${given[n] ?? '空'}，应为 ${expected}）`)
  }
  results.push({
    label: 'B 组 · 副作用等级（8 题 × 3 分）',
    score: right.length * 3,
    max: 24,
    detail: `答对 ${right.length}/${Object.keys(B_KEY).length}`,
    wrong,
  })
}

// ── C 组 ────────────────────────────────────────────────
{
  const given = answers.C?.items ?? {}
  const right = []
  const wrong = []
  for (const [n, accepted] of Object.entries(C_KEY)) {
    const got = norm(given[n])
    if (got && accepted.some((a) => norm(a) === got)) right.push(n)
    else wrong.push(`${n}（你答 ${given[n] ?? '空'}，参考答案 ${accepted[0]}）`)
  }
  results.push({
    label: 'C 组 · 术语（10 题 × 2 分）',
    score: right.length * 2,
    max: 20,
    detail: `答对 ${right.length}/${Object.keys(C_KEY).length}`,
    wrong,
  })
}

// ── 输出 ────────────────────────────────────────────────
console.log('')
console.log('══ 2.2 工具系统 · 客观题判分 ══')
console.log('')
let earned = 0
let total = 0
for (const r of results) {
  const ratio = r.score / r.max
  const bar = '█'.repeat(Math.round(ratio * 20)).padEnd(20, '░')
  console.log(`${ratio >= 0.9 ? '✅' : ratio >= 0.6 ? '⚠️ ' : '❌'} ${r.label}`)
  console.log(`   ${bar}  ${r.score.toFixed(1)}/${r.max}`)
  console.log(`   ${r.detail}`)
  if (r.wrong.length && VERBOSE) console.log(`   ★ 错题：${r.wrong.join('；')}`)
  console.log('')
  earned += r.score
  total += r.max
}

const pct = earned / total
console.log(`客观题：${earned.toFixed(1)} / ${total}（另有 20 分构建题见 tests/t4-build.mjs）`)
console.log(
  pct >= 0.9
    ? '评级：优秀——你已经能在写工具之前判断它会不会被用错。'
    : pct >= 0.75
      ? '评级：良好——少数几处判断偏了，看 --verbose 的错题。'
      : pct >= 0.6
        ? '评级：及格——回去读讲义 1.1–1.3 与 1.8 再答一遍。'
        : '评级：需要重做——先读讲义，尤其是 1.2、1.5、1.8 三节。',
)
console.log('')
console.log('提示：加 --verbose 会列出每一道错题的标准答案。')

process.exit(pct >= 0.5 ? 0 : 1)
