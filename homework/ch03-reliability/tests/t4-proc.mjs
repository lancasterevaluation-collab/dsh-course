// Part D 的判据（14 条）。对应讲义 3.4 与 CONTRACT.md 的「Part D」。
//
// 其中 4 条需要**真实进程**（超时终止整棵树、取消、大输出不死锁）：它们跑不起来时
// 会以超时的方式失败，而不是给出一个含糊的错误。
import { writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSuite, loadImpl, assert, report } from './harness.mjs'

const impl = await loadImpl('proc')
const s = createSuite('Part D · 进程与作业', { weight: 20 })

const dir = mkdtempSync(join(tmpdir(), 'ch03-proc-'))
const script = (name, body) => {
  const p = join(dir, name)
  writeFileSync(p, body)
  return `node "${p.replace(/\\/g, '/')}"`
}

/** 进程是否存活（跨平台）。 */
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e?.code === 'EPERM'
  }
}

/** 轮询等待某个条件成立（用于等待进程真正退出）。 */
async function waitFor(fn, timeoutMs = 8000, stepMs = 200) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, stepMs))
  }
  return false
}

/** 给被测实现的调用套一层保护，避免测试本身卡死。 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）：实现可能死锁或未终止进程`)), ms)),
  ])
}

// ── runShell（真实进程） ────────────────────────────────────────
s.check('D1 正常命令：返回退出码与完整输出', async () => {
  const r = await withTimeout(impl.runShell('node -e "console.log(42)"', { timeoutMs: 10000 }), 15000, 'D1')
  assert.eq(r.exitCode, 0)
  assert.ok(r.stdout.trim() === '42', `stdout 应为 42，实际「${r.stdout.trim()}」`)
  assert.eq(r.timedOut, false)
  assert.eq(r.cancelled, false)
})

s.check('D2 非零退出码不抛错', async () => {
  const r = await withTimeout(impl.runShell('node -e "process.exit(3)"', { timeoutMs: 10000 }), 15000, 'D2')
  assert.eq(r.exitCode, 3)
})

s.check('D3 超时后终止整棵进程树（含孙进程）', async () => {
  const pidFile = join(dir, 'gc.pid')
  if (existsSync(pidFile)) rmSync(pidFile)
  const cmd = script('spawn-grandchild.cjs', `
    const { spawn } = require('child_process')
    // detached: 让孙进程拥有独立的进程组与控制台，避免"杀掉 shell 连带关闭控制台"这条副作用
    const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000)'], { stdio: 'ignore', detached: true })
    child.unref()
    require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid))
    setTimeout(() => {}, 120000)
  `)
  const r = await withTimeout(impl.runShell(cmd, { timeoutMs: 1500 }), 20000, 'D3')
  assert.eq(r.timedOut, true, '应当标记为超时')
  assert.ok(existsSync(pidFile), '孙进程应当已写出自己的 pid')
  const gcPid = Number(readFileSync(pidFile, 'utf8').trim())
  const gone = await waitFor(() => !isAlive(gcPid), 10000)
  assert.ok(gone, `孙进程 ${gcPid} 仍在运行：只终止了直接子进程`)
})

s.check('D4 取消：标记 cancelled 并终止进程', async () => {
  const cmd = script('sleep.cjs', 'setTimeout(() => {}, 120000)')
  const ac = new AbortController()
  const p = impl.runShell(cmd, { timeoutMs: 0, signal: ac.signal })
  setTimeout(() => ac.abort(), 400)
  const r = await withTimeout(p, 20000, 'D4')
  assert.eq(r.cancelled, true, '应当标记为已取消')
  assert.eq(r.timedOut, false, '取消与超时不得同时为真')
})

s.check('D5 大输出不死锁（并发消费管道）', async () => {
  const cmd = script('flood.cjs', 'for (let i = 0; i < 20000; i++) console.log("x".repeat(100))')
  const r = await withTimeout(impl.runShell(cmd, { timeoutMs: 30000 }), 40000, 'D5')
  assert.eq(r.exitCode, 0)
  assert.ok(r.stdout.length > 1_000_000, `stdout 应当被完整收集，实际长度 ${r.stdout.length}`)
})

s.check('D6 取消与超时不同时为真（超时路径）', async () => {
  const r = await withTimeout(impl.runShell('node -e "setTimeout(()=>{}, 60000)"', { timeoutMs: 800 }), 20000, 'D6')
  assert.eq(r.timedOut, true)
  assert.eq(r.cancelled, false)
})

// ── transition ─────────────────────────────────────────────────
s.check('D7 合法转换：pending+start→running', () => {
  assert.eq(impl.transition('pending', 'start'), 'running')
})

s.check('D8 合法转换：running+succeed→succeeded 且 running+cancel→cancelled', () => {
  assert.eq(impl.transition('running', 'succeed'), 'succeeded')
  assert.eq(impl.transition('running', 'cancel'), 'cancelled')
})

s.check('D9 终态不可逆', () => {
  for (const terminal of ['succeeded', 'failed', 'cancelled']) {
    for (const event of ['start', 'succeed', 'fail', 'cancel']) {
      assert.eq(impl.transition(terminal, event), null, `${terminal} + ${event} 应当为 null`)
    }
  }
})

s.check('D10 非法转换返回 null', () => {
  assert.eq(impl.transition('pending', 'succeed'), null)
  assert.eq(impl.transition('pending', 'fail'), null)
})

// ── collectOutput ──────────────────────────────────────────────
s.check('D11 不超预算：完整拼接、无指针', () => {
  const r = impl.collectOutput(['abc', 'def'], { maxChars: 100, headRatio: 0.6 })
  assert.eq(r.text, 'abcdef')
  assert.eq(r.truncated, false)
  assert.eq(r.omittedChars, 0)
  assert.eq(r.pointer, null)
})

s.check('D12 超预算：保留头尾、记录省略数、给出指针、不超预算', () => {
  const chunks = ['HEAD', 'x'.repeat(5000), 'TAIL']
  const r = impl.collectOutput(chunks, { maxChars: 300, headRatio: 0.6 })
  assert.eq(r.truncated, true)
  assert.ok(r.text.includes('HEAD'), '应当含头部')
  assert.ok(r.text.includes('TAIL'), '应当含尾部')
  assert.ok(r.text.length <= 300, `text 不得超预算，实际 ${r.text.length}`)
  assert.ok(typeof r.pointer === 'string' && r.pointer.length > 0, '应当给出指针')
  const total = chunks.join('').length
  assert.near(r.omittedChars, total - r.text.length, 80, 'omittedChars 与被省略的原始字符数应一致（容差为标记文字长度）')
})

s.check('D13 空块数组返回空文本', () => {
  const r = impl.collectOutput([], { maxChars: 100, headRatio: 0.5 })
  assert.eq(r.text, '')
  assert.eq(r.truncated, false)
})

s.check('D14 恰好等于预算时不截断', () => {
  const text = 'y'.repeat(200)
  const r = impl.collectOutput([text], { maxChars: 200, headRatio: 0.5 })
  assert.eq(r.truncated, false)
  assert.eq(r.text, text)
})

const result = await s.run()
rmSync(dir, { recursive: true, force: true })
report([result])
process.exit(result.passed === result.total ? 0 : 1)
