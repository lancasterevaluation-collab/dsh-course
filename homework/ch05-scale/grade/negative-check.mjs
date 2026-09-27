// 负向验证：判分器必须抓住四类"看起来对、其实错"的实现。
//
// 四类都对应这一卷的核心判据——**多份输入下才会暴露的问题**与**边界的松懈**。
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
    name: 'Part C：数组做了深合并（会拼接下层元素，只加不减）',
    source: 'profile.reference.mjs',
    module: 'profile',
    test: 't3-profile.mjs',
    from: `      values[k] = isPlain(values[k]) && isPlain(v) ? { ...values[k], ...v } : v // 对象深合并，其余整体替换`,
    to: `      values[k] = isPlain(values[k]) && isPlain(v)
        ? { ...values[k], ...v }
        : (Array.isArray(values[k]) && Array.isArray(v) ? [...values[k], ...v] : v) // 错误：数组被拼接`,
  },
  {
    name: 'Part D：配额只限并发，不限速率',
    source: 'session.reference.mjs',
    module: 'session',
    test: 't4-session.mjs',
    from: `  const used = registry.tokensInWindow(request.sessionId, 60_000)
  const need = registry.estimate(request)
  if (used + need > policy.maxTokensPerMinute) {
    return { ok: false, reason: '速率超限（token/分钟）', retryAfter: 60_000 }
  }`,
    to: `  // 错误：速率维度没有实现`,
  },
  {
    name: 'Part E：疲劳只看通过率（单信号）',
    source: 'interaction.reference.mjs',
    module: 'interaction',
    test: 't5-interaction.mjs',
    from: `    fatigued: median < 3000 && allowRate > 0.95 && refusalRate === 0,`,
    to: `    fatigued: allowRate > 0.95, // 错误：只看一个信号`,
  },
  {
    name: 'Part F：未识别的外部错误被当成可重试（会重复副作用）',
    source: 'delegation.reference.mjs',
    module: 'delegation',
    test: 't6-delegation.mjs',
    from: `  if (!kind) {
    return { kind: 'fatal', message: \`\${server}: 未识别的外部错误（\${code}）\`, needsHuman: true }
  }`,
    to: `  if (!kind) {
    return { kind: 'retryable', message: \`\${server}: \${code}\`, needsHuman: false } // 错误：盲目重试
  }`,
  },
]

const dir = mkdtempSync(join(tmpdir(), 'ch05-neg-'))
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
