// 负向验证：判分器必须能抓住四类"看起来对、其实错"的实现。
//
// 做法：从参考实现复制并**只改一处**（改动是显式的，因此"只改一处"这件事可被复核），
// 然后跑对应测试，核对它确实不通过。
//
// 用法：node grade/negative-check.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

/** 四类错误：每一项只替换参考实现里的一处。 */
const CASES = [
  {
    name: 'Part C：阈值判断用了 >= （恰好等于时也会触发）',
    source: 'context.reference.mjs',
    module: 'context',
    test: 't3-context.mjs',
    from: 'return state.usedTokens / state.maxTokens > policy.threshold',
    to: 'return state.usedTokens / state.maxTokens >= policy.threshold',
  },
  {
    name: 'Part D：超时/取消后不终止进程（终止动作缺失）',
    source: 'proc.reference.mjs',
    module: 'proc',
    test: 't4-proc.mjs',
    // 注：这一类错误还有一个更细的实例（"只杀直接子进程"）。它在 POSIX 上可区分，
    //     但在 Windows 上杀 shell 会通过控制台关闭的副作用连带终止子进程，因此不易稳定区分。
    //     这里选"完全不终止"作为该类的一个可判定实例。
    from: `  const terminate = () => {
    killTree(false)
    timers.push(setTimeout(() => killTree(true), GRACE_MS))
  }`,
    to: `  const terminate = () => {
    /* 错误：不终止任何进程 */
  }`,
  },
  {
    name: 'Part E：读到半行时抛错（而不是截断并报告）',
    source: 'persist.reference.mjs',
    module: 'persist',
    test: 't5-persist.mjs',
    from: `      return { events, truncatedAt: events.length } // 半行：写入中断`,
    to: `      throw new Error('日志尾部不完整') // 错误处置：应当截断并报告`,
  },
  {
    name: 'Part F：cachedPromptTokens 缺失时抛错（而不是按零命中）',
    source: 'metrics.reference.mjs',
    module: 'metrics',
    test: 't6-metrics.mjs',
    from: `  const cached = Math.min(num(usage?.cachedPromptTokens), promptTokens) // 截断，避免负的 miss`,
    to: `  if (usage?.cachedPromptTokens === undefined) throw new Error('缺少 cachedPromptTokens')
  const cached = Math.min(num(usage?.cachedPromptTokens), promptTokens)`,
  },
]

const dir = mkdtempSync(join(tmpdir(), 'ch03-neg-'))
let caught = 0

console.log('\n负向验证：四类错误实现应当全部被抓住\n')

for (const c of CASES) {
  const src = readFileSync(join(HERE, c.source), 'utf8')
  if (!src.includes(c.from)) {
    console.log(` 无法构造  ${c.name}\n          ← 在 ${c.source} 里找不到待替换片段（参考实现改过？）`)
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
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, IMPL: target },
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const failed = /不通过/.test(out) || r.status !== 0
  const failLine = out.split('\n').find((l) => l.includes('不通过'))
  const firstFail = failLine ? failLine.trim().replace(/^不通过\s*/, '') : '(未捕获到失败明细)'
  if (failed) caught++
  console.log(` ${failed ? '已抓住' : '漏掉了'}  ${c.name}`)
  if (failed) console.log(`          ← 触发的判据：${firstFail}`)
}

rmSync(dir, { recursive: true, force: true })

console.log(`\n结果：${caught}/${CASES.length} 类错误被抓住`)
if (caught !== CASES.length) {
  console.log('有漏检说明判据不够锐利——那是一个需要修测试的问题，而不是实现的问题。')
}
process.exit(caught === CASES.length ? 0 : 1)
