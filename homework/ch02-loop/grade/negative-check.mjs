/**
 * 负向验证：证明构建题判分器有鉴别力。
 *
 * 做法：从参考答案出发，制造四个【看起来合理但违反契约】的变体，
 * 验证判分器能抓住每一个。
 *
 * ★ 为什么必须做这个：一个只能给参考答案满分的判分器是无价值的。
 *   【证明判分器能失败，和证明它能通过同样重要。】
 *
 * ★ 变体的构造方式：用 marker 定位 + 切片，而不用整段字符串替换。
 *   原因是替换的源文本必须逐字符一致（含中文注释与转义），
 *   而只要有一处对不上，replace 会静默地不做任何事——
 *   于是变体与参考答案相同，验证就变成了"参考答案能否通过"。
 *   这正是这份脚本第一版失败的原因（0/4）。
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CH_DIR = fileURLToPath(new URL('..', import.meta.url))
// ★ 判分器在 tests/ 下，而本文件在 grade/ 下——所以要用 ../tests/ 而不是裸文件名。
//   第一版写成了 't2-build.mjs'，于是它去 grade/ 里找，报 MODULE_NOT_FOUND，
//   而因为错误被吞进了子进程的 stderr，表现成了"0/4 个变体被抓住"。
const GRADER = fileURLToPath(new URL('../tests/t2-build.mjs', import.meta.url))
const ref = readFileSync(fileURLToPath(new URL('../grade/llm.reference.mjs', import.meta.url)), 'utf8')

/** 删掉 [from, to) 之间的文本（from 是起始 marker，to 是结束 marker 之后的位置）。 */
function cut(src, fromMarker, toMarker) {
  const a = src.indexOf(fromMarker)
  if (a < 0) throw new Error(`找不到起始 marker：${fromMarker.slice(0, 40)}`)
  const b = src.indexOf(toMarker, a)
  if (b < 0) throw new Error(`找不到结束 marker：${toMarker.slice(0, 40)}`)
  return src.slice(0, a) + src.slice(b + toMarker.length)
}

/** 在某个 marker 之前插入文本。 */
function insertBefore(src, marker, text) {
  const a = src.indexOf(marker)
  if (a < 0) throw new Error(`找不到 marker：${marker.slice(0, 40)}`)
  return src.slice(0, a) + text + src.slice(a)
}

const variants = [
  {
    name: '变体 1：parseArguments 漏掉"合法 JSON 但不是对象"的检查',
    expectFail: 'A3',
    clause: '承诺 4 第三条',
    build: () =>
      cut(
        ref,
        '  if (parsed === null || typeof parsed !== \'object\' || Array.isArray(parsed)) {',
        '\n  }\n',
      ),
  },
  {
    name: '变体 2：把 retryable 换成构造时传入的布尔值（不由 code 推出）',
    expectFail: 'B3',
    clause: '不变量 1',
    build: () => {
      // 第一步：删掉由 code 推出的那个 getter
      let code = cut(ref, '  /** 承诺 5：由 code 决定，不由调用方决定。 */', '\n  }\n\n')
      // 第二步：在构造函数里加一个实例字段——这才是"把重试性当成外部开关"的真实写法。
      //         注意不能只是插入一个裸标识符，那会让模块加载失败，
      //         而失败会被吞进子进程的 stderr，表现成"没被抓住"。
      code = code.replace(
        '    this.#retryAfterMs = options?.retryAfterMs // 承诺 6',
        '    this.#retryAfterMs = options?.retryAfterMs // 承诺 6\n    this.retryable = options?.retryable ?? false',
      )
      return code
    },
  },
  {
    name: '变体 3：MockProvider 脚本用尽时返回空响应（而不是抛错）',
    expectFail: 'C2',
    clause: '承诺 7',
    build: () =>
      cut(ref, '    if (!step) {', '\n    }\n').replace(
        '  async chat(_request) {',
        "  async chat(_request) {\n    const fallback = { content: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }",
      ),
  },
  {
    name: '变体 4：厂商字段名出现在非注释代码里',
    expectFail: 'E1',
    clause: '承诺 1',
    build: () =>
      insertBefore(ref, 'export const __internal', "export const PROVIDER = 'deepseek-chat'\n"),
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

  // 变体应当与参考答案不同——否则说明替换没生效（这正是第一版的失败模式）
  if (code === ref) {
    console.log(`⚠️  变体 ${i + 1} 与参考答案相同——替换没有生效`)
    results.push({ name: v.name, caught: false, expect: v.expectFail, note: '与参考答案相同' })
    continue
  }

  const tmp = `_variant-${i}.mjs`
  writeFileSync(`${CH_DIR}/${tmp}`, code)
  let output = ''
  try {
    output = execFileSync(process.execPath, [GRADER], {
      cwd: CH_DIR,
      env: { ...process.env, IMPL: `../${tmp}` },
      encoding: 'utf8',
    })
  } catch (e) {
    // ★ 不用退出码判断——阈值是 50%，只错一项时退出码仍是 0。
    output = String(e.stdout ?? '') + String(e.stderr ?? '')
  }
  rmSync(`${CH_DIR}/${tmp}`, { force: true })

  const caught = output.includes(`❌ ${v.expectFail} ·`)
  results.push({ name: v.name, caught, expect: v.expectFail, clause: v.clause })
  if (caught) pass++
}

console.log('')
console.log('══ 负向验证：判分器能否抓住违反契约的实现 ══')
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
