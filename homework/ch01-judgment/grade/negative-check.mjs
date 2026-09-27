/**
 * 负向验证：证明测试有鉴别力。
 *
 * 做法：从参考答案出发，制造三个【看起来合理但违反契约】的变体，
 * 验证测试能抓住每一个。
 *
 * ★ 为什么要做这个：一个只能给参考答案满分的测试是无价值的——
 *   它可能对任何实现都给满分（比如断言写得太松）。
 *   【证明测试能失败，和证明它能通过同样重要。】
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const REF = 'grade/memory.reference.mjs'
const ref = readFileSync(REF, 'utf8')

const variants = [
  {
    name: '变体 1：满仓时丢弃最旧的（最常见的错误实现）',
    expectFail: 'B',
    code: ref.replace(
      'if (this.#entries.size >= this.#limit) throw new CapacityError(this.#limit, this.#entries.size)',
      'if (this.#entries.size >= this.#limit) { this.#entries.delete(this.#entries.keys().next().value) }',
    ),
  },
  {
    name: '变体 2：list 只复制数组，不复制元素（最常见的半成品）',
    expectFail: 'G',
    code: ref.replace(
      'return [...this.#entries.values()].map((e) => ({ ...e }))',
      'return [...this.#entries.values()]',
    ),
  },
  {
    name: '变体 3：merge 之前检查容量（与契约【三】冲突）',
    expectFail: 'D',
    code: ref.replace(
      '    // ★ 先检查全部 id 存在，再动手',
      '    if (this.#entries.size >= this.#limit) throw new CapacityError(this.#limit, this.#entries.size)\n    // ★ 先检查全部 id 存在，再动手',
    ),
  },
  {
    name: '变体 4：remove 之后不释放容量（用固定计数）',
    expectFail: 'C',
    code: ref
      .replace(
        '    return this.#entries.delete(id)',
        '    const had = this.#entries.has(id)\n    if (had) { this.removedCount = (this.removedCount ?? 0) + 1; this.#entries.delete(id) }\n    return had',
      )
      .replace(
        'if (this.#entries.size >= this.#limit) throw new CapacityError(this.#limit, this.#entries.size)',
        'if (this.#entries.size + (this.removedCount ?? 0) >= this.#limit) throw new CapacityError(this.#limit, this.#entries.size)',
      ),
  },
]

let pass = 0
const results = []

for (const v of variants) {
  const tmp = `_variant-${results.length}.mjs`
  writeFileSync(tmp, v.code)
  let output = ''
  try {
    // 调用单项判分器而不是总入口：这里需要的是【逐用例】的输出行（❌ B · …），
    // 而 tests/run.mjs 只打印各项的汇总分数。
    output = execFileSync('node', ['tests/t5-build.mjs'], {
      env: { ...process.env, IMPL: `../${tmp}` },
      encoding: 'utf8',
    })
  } catch (e) {
    // ★ 退出码非零时 execFileSync 会抛——但我们【不】用它判断是否被抓住。
    //   原因是：测试的退出码阈值是 80%，只错一个用例时退出码仍是 0。
    //   这正是第一次负向验证失败的原因——验证脚本自己不能靠退出码。
    output = String(e.stdout ?? '')
  }
  rmSync(tmp, { force: true })

  // 检查【预期的那个用例】是否失败——这才是"被抓住"的判据
  const line = output.split('\n').find((l) => l.includes(`❌ ${v.expectFail} ·`))
  const caught = !!line
  results.push({ name: v.name, caught, expect: v.expectFail, line: line?.trim() ?? '(未找到失败的用例)' })
  if (caught) pass++
}

console.log('══ 负向验证：测试能否抓住违反契约的实现 ══')
console.log('')
for (const r of results) {
  console.log(`${r.caught ? '✅' : '❌'} ${r.name}`)
  console.log(`   预期失败的用例：${r.expect}`)
  if (!r.caught) console.log(`   ★ 没有被抓住：${r.line}`)
}
console.log('')
console.log(`${pass}/${variants.length} 个变体被正确抓住`)
console.log('')

if (pass !== variants.length) {
  console.log('★ 有变体没被抓住——说明【测试本身】不够严，需要修测试而不是修实现。')
  process.exit(1)
}
console.log('负向验证通过：四个违反契约的实现都被抓住了。')
