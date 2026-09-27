/**
 * 2.1 模型层 · 客观题判分
 *
 * 对应 CS336 的 tests/：判分器就是一组能被反复运行的检查。
 * 三组题（共 80 分）自动判分：
 *   A 组 · 接口宽度判断（12 题 × 3 分 = 36）
 *   B 组 · 错误分类（8 题 × 3 分 = 24）
 *   C 组 · 术语（10 题 × 2 分 = 20）
 * 另有 D 组构建题 20 分，由 tests/t2-build.mjs 判。
 *
 * 用法：
 *   node tests/t1-llm.mjs --answers kit/answers/a1-llm.json [--verbose]
 *
 * 判分口径（本作业固定）：逐题全对才给分，不做部分分。
 * 理由是这三组考的都是【判断题】——判断没有"答对一半"的说法。
 */

import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const VERBOSE = argv.includes('--verbose')
const ANSWERS_PATH = argOf('--answers', 'kit/answers/a1-llm.json')

/** A 组答案。取值：safe / breaking。 */
const A_KEY = {
  1: 'safe', 2: 'breaking', 3: 'safe', 4: 'breaking', 5: 'safe', 6: 'breaking',
  7: 'breaking', 8: 'safe', 9: 'breaking', 10: 'safe', 11: 'breaking', 12: 'safe',
}

/** B 组答案。取值：retry / retry_wait / no_retry。 */
const B_KEY = {
  1: 'retry_wait', 2: 'retry', 3: 'retry', 4: 'no_retry',
  5: 'no_retry', 6: 'no_retry', 7: 'retry', 8: 'no_retry',
}

/** C 组答案。术语名要写对（允许常见同义写法）。 */
const C_KEY = {
  1: ['provider', '模型提供者'],
  2: ['线格式', 'wire format', '线上格式'],
  3: ['role', '角色', '消息角色'],
  4: ['tool call', '工具调用', '工具调用请求'],
  5: ['错误分类', 'error classification'],
  6: ['可替换性', 'replaceability'],
  7: ['幂等', 'idempotent', '幂等性'],
  8: ['边界处解析', '在边界解析', '边界解析'],
  9: ['决策性分类', '按处理方式分类'],
  10: ['unknown', '未知分类', 'unknown 分类'],
}

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

let answers
try {
  const raw = readFileSync(ANSWERS_PATH, 'utf8').replace(/^\uFEFF/, '')
  answers = JSON.parse(raw)
} catch (err) {
  console.error(`读不到答卷：${ANSWERS_PATH}`)
  console.error(`原因：${err.message}`)
  console.error('提示：从 kit/problems/a1-llm.template.json 复制一份到 kit/answers/a1-llm.json 再填。')
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
    label: 'A 组 · 接口宽度判断（12 题 × 3 分）',
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
    label: 'B 组 · 错误分类（8 题 × 3 分）',
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
    // 术语允许同义写法：命中任一即可
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
console.log('══ 2.1 模型层 · 客观题判分 ══')
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
console.log(`客观题：${earned.toFixed(1)} / ${total}（另有 20 分构建题见 tests/t2-build.mjs）`)
console.log(
  pct >= 0.9
    ? '评级：优秀——概念与判断都稳，可以去答面试题了。'
    : pct >= 0.75
      ? '评级：良好——少数几处判断偏了，看 --verbose 的错题。'
      : pct >= 0.6
        ? '评级：及格——回去读讲义对应小节再答一遍。'
        : '评级：需要重做——先读讲义，尤其是 1.3 与 1.6 两节。',
)
console.log('')
console.log('提示：加 --verbose 会列出每一道错题的标准答案。')

process.exit(pct >= 0.5 ? 0 : 1)
