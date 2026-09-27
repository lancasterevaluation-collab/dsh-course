// 负向验证：判分器必须抓住四类"看起来对、其实错"的实现。
//
// 做法：从参考实现复制并**只改一处**，然后跑对应测试，核对它确实不通过。
// 四类错误都对应这一卷的核心判据——**该拒绝的时候没有拒绝**。
//
// 用法：node grade/negative-check.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

const CASES = [
  {
    name: 'Part C：检索时不排除被抑制的条目',
    source: 'memory.reference.mjs',
    module: 'memory',
    test: 't3-memory.mjs',
    from: `  const alive = (store.entries ?? []).filter((e) => !e.suppressedAt && !(typeof e.expiresAt === 'number' && e.expiresAt <= now))`,
    to: `  const alive = (store.entries ?? []).filter(() => true) // 错误：抑制与过期都没有被排除`,
  },
  {
    name: 'Part D：反驳与隐式支持等权（置信度只会单向上升）',
    source: 'user-model.reference.mjs',
    module: 'user-model',
    test: 't4-user-model.mjs',
    from: `const WEIGHT = { explicit: 3, implicit: 1, contradict: -2 }`,
    to: `const WEIGHT = { explicit: 3, implicit: 1, contradict: -1 } // 错误：反驳与支持等权`,
  },
  {
    name: 'Part E：门控只看"有没有改善"，不比较噪声',
    source: 'evolution.reference.mjs',
    module: 'evolution',
    test: 't5-evolution.mjs',
    from: `  if (gain <= 2 * noise) {`,
    to: `  if (gain <= 0) { // 错误：没有与噪声比较`,
  },
  {
    name: 'Part F：覆盖率只统计"完成"，不认带理由的放弃',
    source: 'longhorizon.reference.mjs',
    module: 'longhorizon',
    test: 't6-longhorizon.mjs',
    from: `  const closed = list.filter((o) => o.state === 'done' || (o.state === 'dropped' && o.dropReason)).length`,
    to: `  const closed = list.filter((o) => o.state === 'done').length // 错误：带理由的放弃没有计入`,
  },
]

const dir = mkdtempSync(join(tmpdir(), 'ch04-neg-'))
let caught = 0

console.log('\n负向验证：四类"该拒绝时没拒绝"的实现应当全部被抓住\n')

for (const c of CASES) {
  const src = readFileSync(join(HERE, c.source), 'utf8')
  if (!src.includes(c.from)) {
    console.log(` 无法构造  ${c.name}\n          ← 在 ${c.source} 里找不到待替换片段`)
    continue
  }
  const patched = src.replace(c.from, c.to)
  if (patched === src) {
    console.log(` 无法构造  ${c.name}\n          ← 替换未生效`)
    continue
  }
  const target = join(dir, `${c.module}.mjs`)
  writeFileSync(target, patched)

  const r = spawnSync(process.execPath, [join(ROOT, 'tests', c.test)], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, IMPL: target },
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const failed = r.status !== 0 || /不通过/.test(out)
  const failLine = out.split('\n').find((l) => l.includes('不通过'))
  const firstFail = failLine ? failLine.trim().replace(/^不通过\s*/, '') : '(未捕获到失败明细)'
  if (failed) caught++
  console.log(` ${failed ? '已抓住' : '漏掉了'}  ${c.name}`)
  if (failed) console.log(`          ← 触发的判据：${firstFail}`)
}

rmSync(dir, { recursive: true, force: true })

console.log(`\n结果：${caught}/${CASES.length} 类错误被抓住`)
if (caught !== CASES.length) console.log('有漏检说明判据不够锐利——那是需要修测试的问题，而不是实现的问题。')
process.exit(caught === CASES.length ? 0 : 1)
