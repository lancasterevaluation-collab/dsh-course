#!/usr/bin/env node
/**
 * 1.4 接口与契约 · 客观题判分器
 *
 * 三组客观题（共 72 分）自动判分，另 28 分是分析题（由 kit/writeup.md 的 rubric 自评）。
 *
 * 用法：
 *   node check-answers.mjs --answers answers.json [--verbose]
 *   （在 kit 下用 tools/check.mjs，它会自动补上 --answers 路径）
 */

import { readFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const ANSWERS = argOf('--answers', 'answers.json')
const VERBOSE = args.includes('--verbose')

// ─────────────────────────────────────────── 标准答案

/** A 组：破坏性判断（12 题 × 3 分 = 36）。'breaking' | 'safe' */
const A_KEY = [
  ['增加一个【必填】参数', 'breaking'],
  ['增加一个【可选】参数', 'safe'],
  ['从返回对象里【删除】一个字段', 'breaking'],
  ['给返回对象【增加】一个字段', 'safe'],
  ['把参数允许的类型【放宽】（string → string | number）', 'safe'],
  ['把参数允许的类型【收紧】', 'breaking'],
  ['把返回类型的精度【收紧】（string → "a" | "b"）', 'safe'],
  ['把返回类型的精度【放宽】', 'breaking'],
  ['把函数从同步改为异步', 'breaking'],
  ['把函数从"不可重入"改为"可重入"', 'safe'],
  ['把函数从"可并发调用"改为"不可并发调用"', 'breaking'],
  ['把默认超时从 30 秒改为 60 秒', 'breaking'],
]

/** B 组：承诺分类（8 题 × 2 分 = 16）。'behavior' | 'timing' | 'error' | 'ownership' */
const B_KEY = [
  ['这个函数可以安全地重复调用', 'behavior'],
  ['必须在 connect() 之后调用', 'timing'],
  ['失败时抛出 TimeoutError', 'error'],
  ['调用它会创建一个文件句柄，调用方负责关闭', 'ownership'],
  ['这个方法不是线程安全的', 'timing'],
  ['调用它会写入日志文件', 'behavior'],
  ['参数为 null 时抛 TypeError', 'error'],
  ['可以在事件回调里调用它', 'timing'],
]

/** C 组：术语（10 题 × 2 分 = 20）。答案接受同义写法 */
const C_KEY = [
  ['调用方的义务叫什么？', ['前置条件', 'precondition']],
  ['实现方的义务叫什么？', ['后置条件', 'postcondition']],
  ['对象生命周期中始终为真的性质叫什么？', ['类不变量', '不变量', 'class invariant', 'invariant']],
  ['使依赖原契约的代码可能失败的改动叫什么？', ['破坏性变更', 'breaking change', '破坏性']],
  ['"用户足够多时，所有可观察行为都会被依赖"是谁的定律？', ['hyrum', '海勒姆', 'hyrum 定律', 'hyrum定律']],
  ['框架能检查并阻止违反的契约叫什么？', ['强制型', '强制型契约', 'enforced']],
  ['只能依赖约定、框架无法检查的契约叫什么？', ['信任型', '信任型契约', 'trust', 'trusted']],
  ['接口简单而内部复杂的模块叫什么？', ['深模块', 'deep module']],
  ['一个模块对外承诺的事项总数叫什么？', ['契约表面积', '表面积', 'surface']],
  ['验证"承诺"而不是"实现"的测试叫什么？', ['契约测试', 'contract test']],
]

// ─────────────────────────────────────────── 判分

const results = []
const item = (id, pts, ratio, note) => results.push({ id, pts, ratio: Math.max(0, Math.min(1, ratio)), note })

let answers
try {
  const raw = await readFile(ANSWERS, 'utf8')
  answers = JSON.parse(raw.replace(/^\uFEFF/, ''))
} catch (err) {
  console.error(`无法读取答卷 ${ANSWERS}：${err.message}`)
  console.error('提示：从 grade/answers.example.json 复制一份到 kit/answers.json 再填。')
  process.exit(2)
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '')

// A 组
const aGiven = (answers.A ?? {}).items ?? {}
let aHit = 0
const aWrong = []
A_KEY.forEach(([label, key], i) => {
  const n = String(i + 1)
  if (norm(aGiven[n]) === key) aHit++
  else aWrong.push(`${n}. ${label} → 应为 ${key}，你填 ${aGiven[n] ?? '（未填）'}`)
})
item('A 组 · 破坏性判断（12 题）', 36, aHit / A_KEY.length, `答对 ${aHit}/${A_KEY.length}${VERBOSE && aWrong.length ? '；错误：' + aWrong.join('；') : ''}`)

// B 组
const bGiven = (answers.B ?? {}).items ?? {}
let bHit = 0
const bWrong = []
B_KEY.forEach(([label, key], i) => {
  const n = String(i + 1)
  if (norm(bGiven[n]) === key) bHit++
  else bWrong.push(`${n}. ${label} → 应为 ${key}，你填 ${bGiven[n] ?? '（未填）'}`)
})
item('B 组 · 承诺分类（8 题）', 16, bHit / B_KEY.length, `答对 ${bHit}/${B_KEY.length}${VERBOSE && bWrong.length ? '；错误：' + bWrong.join('；') : ''}`)

// C 组
const cGiven = (answers.C ?? {}).items ?? {}
let cHit = 0
const cWrong = []
C_KEY.forEach(([q, keys], i) => {
  const n = String(i + 1)
  const got = norm(cGiven[n])
  if (got && keys.some((k) => norm(k) === got || got.includes(norm(k)))) cHit++
  else cWrong.push(`${n}. ${q} → 应为 ${keys[0]}，你填 ${cGiven[n] ?? '（未填）'}`)
})
item('C 组 · 术语（10 题）', 20, cHit / C_KEY.length, `答对 ${cHit}/${C_KEY.length}${VERBOSE && cWrong.length ? '；错误：' + cWrong.join('；') : ''}`)

// ─────────────────────────────────────────── 成绩单

const total = results.reduce((s, r) => s + r.pts, 0)
const earned = results.reduce((s, r) => s + r.pts * r.ratio, 0)
const bar = (x) => '█'.repeat(Math.round(x * 20)) + '░'.repeat(20 - Math.round(x * 20))

console.log('')
console.log('══ 1.4 接口与契约 · 客观题判分 ══')
console.log('')
for (const r of results) {
  const mark = r.ratio >= 0.999 ? '✅' : r.ratio > 0 ? '🟡' : '❌'
  console.log(`${mark} ${r.id}`)
  console.log(`   ${bar(r.ratio)}  ${(r.pts * r.ratio).toFixed(1)}/${r.pts}`)
  console.log(`   ${r.note}`)
}
console.log('')
console.log(`客观题：${earned.toFixed(1)} / ${total}（满分 72；另有 28 分分析题见 writeup.md 的 rubric）`)
const pct = earned / total
console.log(
  `评级：${
    pct >= 0.9 ? '优秀——概念与判断都稳，可以去答面试题了。'
    : pct >= 0.7 ? '良好——回看错得最多的那一组的正文小节。'
    : pct >= 0.5 ? '合格——重点重读 1.4.2 的分类表与 1.1 的三类承诺。'
    : '不合格——建议先把正文 L1 的 1.1 与 1.4 两节读完再重做。'
  }`,
)
console.log('')
console.log('提示：加 --verbose 会列出每一道错题的标准答案。')
process.exit(pct >= 0.5 ? 0 : 1)
