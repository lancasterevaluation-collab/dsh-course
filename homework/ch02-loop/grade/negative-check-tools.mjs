/**
 * 负向验证：证明 2.2 构建题判分器有鉴别力。
 *
 * 做法：从参考答案出发，制造四个【看起来合理但违反契约】的变体，
 * 验证判分器能抓住每一个。
 *
 * ★ 为什么必须做这个：一个只能给参考答案满分的判分器是无价值的。
 *   【证明判分器能失败，和证明它能通过同样重要。】
 *
 * ★ 变体文件写在 grade/ 下，而不是章节根目录——因为参考答案要 import
 *   './llm.reference.mjs'，路径是相对它自己的位置解析的。
 *   （2.1 的那份负向验证没有这个问题：llm.reference.mjs 不 import 任何本地文件。）
 *
 * ★ 每个变体都断言"与参考答案不同"。否则替换没生效，验证会退化成
 *   "参考答案能否通过"——这正是 2.1 那份脚本第一版的失败模式。
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CH_DIR = fileURLToPath(new URL('..', import.meta.url))
const GRADE_DIR = fileURLToPath(new URL('.', import.meta.url))
const GRADER = fileURLToPath(new URL('../tests/t4-build.mjs', import.meta.url))
const ref = readFileSync(fileURLToPath(new URL('./tools.reference.mjs', import.meta.url)), 'utf8')

/** 删掉 [from, to) 之间的文本（from 是起始 marker，to 是结束 marker 之后的位置）。 */
function cut(src, fromMarker, toMarker) {
  const a = src.indexOf(fromMarker)
  if (a < 0) throw new Error(`找不到起始 marker：${fromMarker.slice(0, 40)}`)
  const b = src.indexOf(toMarker, a)
  if (b < 0) throw new Error(`找不到结束 marker：${toMarker.slice(0, 40)}`)
  return src.slice(0, a) + src.slice(b + toMarker.length)
}

/** 替换一处必须存在的文本，并确认它真的被替换了。 */
function replaceOnce(src, from, to) {
  if (!src.includes(from)) throw new Error(`找不到要替换的文本：${from.slice(0, 40)}`)
  return src.replace(from, to)
}

const variants = [
  {
    name: '变体 1：校验器不检查未知字段',
    expectFail: 'A5',
    clause: '承诺 1',
    build: () => cut(ref, '  for (const key of Object.keys(value)) {', '\n  }\n'),
  },
  {
    name: '变体 2：truncate 只保留头（丢掉结论所在的那一半）',
    expectFail: 'B2',
    clause: '承诺 2',
    build: () =>
      replaceOnce(
        ref,
        '  if (!Number.isFinite(limit) || limit <= 0) return source\n',
        '  if (!Number.isFinite(limit) || limit <= 0) return source\n  return source.slice(0, limit) // 只留头\n',
      ),
  },
  {
    name: '变体 3：路径前缀比较不带分隔符（/work-evil 被当作在 /work 内）',
    expectFail: 'B6',
    clause: '承诺 3',
    build: () => replaceOnce(ref, '!target.startsWith(base + sep)', '!target.startsWith(base)'),
  },
  {
    name: '变体 4：工具实现抛异常时不标 internal',
    expectFail: 'C10',
    clause: '承诺 7',
    build: () => replaceOnce(ref, '\n        internal: true,', ''),
  },
]

let pass = 0
const results = []

for (const [i, v] of variants.entries()) {
  let code
  try {
    code = v.build()
  } catch (e) {
    console.log(`⚠️  变体 ${i + 1} 构造失败：${e.message}`)
    results.push({ name: v.name, caught: false, expect: v.expectFail, note: '构造失败' })
    continue
  }

  if (code === ref) {
    console.log(`⚠️  变体 ${i + 1} 与参考答案相同——替换没有生效`)
    results.push({ name: v.name, caught: false, expect: v.expectFail, note: '与参考答案相同' })
    continue
  }

  const tmp = `_variant-tools-${i}.mjs`
  writeFileSync(`${GRADE_DIR}/${tmp}`, code)
  let output = ''
  try {
    output = execFileSync(process.execPath, [GRADER], {
      cwd: CH_DIR,
      env: { ...process.env, IMPL: `../grade/${tmp}` },
      encoding: 'utf8',
    })
  } catch (e) {
    // ★ 不用退出码判断——阈值是 50%，只错一项时退出码仍是 0。
    output = String(e.stdout ?? '') + String(e.stderr ?? '')
  }
  rmSync(`${GRADE_DIR}/${tmp}`, { force: true })

  const caught = output.includes(`❌ ${v.expectFail} ·`)
  results.push({ name: v.name, caught, expect: v.expectFail, clause: v.clause })
  if (caught) pass++
}

console.log('')
console.log('══ 负向验证：判分器能否抓住违反契约的实现（2.2 工具系统）══')
console.log('')
for (const r of results) {
  console.log(`${r.caught ? '✅' : '❌'} ${r.name}`)
  console.log(`   对应契约：${r.clause ?? '—'}　预期被抓住的用例：${r.expect}`)
  if (r.note) console.log(`   ★ ${r.note}`)
}
console.log('')
console.log(`${pass}/${variants.length} 个变体被正确抓住`)
console.log('')

if (pass !== variants.length) {
  console.log('★ 有变体没被抓住——说明【判分器本身】不够严，要修判分器而不是修实现。')
  process.exit(1)
}
console.log('负向验证通过：四个违反契约的实现都被抓住了。')
console.log('')
