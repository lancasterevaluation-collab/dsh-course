// 负向验证：判分器必须抓住四类"看起来对、其实错"的实现。
//
// 四类都对应这一卷的核心判据——**结论有没有被噪声解释掉**。
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
    name: 'Part C：分位数用插值（而不是最近秩法）',
    source: 'stats.reference.mjs',
    module: 'statsA',
    test: 't3-stats.mjs',
    from: `  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1))
  return sorted[idx]`,
    to: `  const pos = q * (sorted.length - 1) // 错误：线性插值
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)`,
  },
  {
    name: 'Part C：噪声用总体标准差（分母 n 而不是 n-1）',
    source: 'stats.reference.mjs',
    module: 'statsB',
    test: 't3-stats.mjs',
    from: `  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)`,
    to: `  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length // 错误：总体标准差`,
  },
  {
    name: 'Part C：显著性只看"差异不为零"（不看区间重叠）',
    source: 'stats.reference.mjs',
    module: 'statsC',
    test: 't3-stats.mjs',
    from: `  return {
    delta,
    ciA,
    ciB,
    significant: !overlap,`,
    to: `  const _unused = overlap
  return {
    delta,
    ciA,
    ciB,
    significant: delta !== 0, // 错误：落在噪声里也算显著`,
  },
  {
    name: 'Part D：报告不检查"未检出差异必须带分辨率"',
    source: 'experiment.reference.mjs',
    module: 'experiment',
    test: 't4-experiment.mjs',
    from: `  if (conclusion?.detected === false && !conclusion?.resolution) {
    throw new Error('未检出差异时必须给出分辨率（否则读者无法判断是「确实无效」还是「测不出来」）')
  }`,
    to: `  // 错误：没有检查分辨率`,
  },
]

const dir = mkdtempSync(join(tmpdir(), 'ch06-neg-'))
let caught = 0

console.log('\n负向验证：四类实现应当全部被抓住\n')

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
  // experiment 的变体要能导入同目录的 stats 参考实现
  if (c.module === 'experiment') {
    writeFileSync(join(dir, 'stats.reference.mjs'), readFileSync(join(HERE, 'stats.reference.mjs'), 'utf8'))
  }

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
