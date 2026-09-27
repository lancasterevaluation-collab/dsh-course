// Part D 的参考实现。
//
// 三处要点（也是这一项 12 分的来源）：
//   1. 终止的是整棵进程树（POSIX 用进程组，Windows 用 taskkill /T）；
//   2. 先温和后强杀，中间留宽限期；
//   3. stdout/stderr 从启动就被消费（不是等退出之后才读）。
import { spawn, spawnSync } from 'node:child_process'

/** 温和终止到强杀之间的宽限期。 */
const GRACE_MS = 800

/**
 * 运行 shell 命令，带超时与取消。
 * @param {string} cmd
 * @param {{ timeoutMs: number, signal?: AbortSignal, cwd?: string }} opts
 * @returns {Promise<{ exitCode: number | null, signal: string | null, stdout: string, stderr: string, timedOut: boolean, cancelled: boolean, durationMs: number }>}
 */
export async function runShell(cmd, opts) {
  const { timeoutMs = 0, signal, cwd } = opts ?? {}
  const started = Date.now()
  const isWin = process.platform === 'win32'
  const child = spawn(cmd, { shell: true, cwd, detached: !isWin, stdio: ['ignore', 'pipe', 'pipe'] })

  let stdout = ''
  let stderr = ''
  // 从启动就消费，避免管道缓冲区满导致的死锁。
  child.stdout?.on('data', (d) => { stdout += d.toString() })
  child.stderr?.on('data', (d) => { stderr += d.toString() })

  let timedOut = false
  let cancelled = false
  const timers = []

  const killTree = (force) => {
    if (child.pid === undefined) return
    if (isWin) {
      const args = ['/pid', String(child.pid), '/T']
      if (force) args.push('/F')
      try { spawnSync('taskkill', args, { stdio: 'ignore' }) } catch { /* 进程可能已退出 */ }
      return
    }
    try {
      process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM')
    } catch {
      try { child.kill(force ? 'SIGKILL' : 'SIGTERM') } catch { /* 已退出 */ }
    }
  }

  const terminate = () => {
    killTree(false)
    timers.push(setTimeout(() => killTree(true), GRACE_MS))
  }

  const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; terminate() }, timeoutMs) : null

  if (signal) {
    if (signal.aborted) {
      cancelled = true
      terminate()
    } else {
      signal.addEventListener('abort', () => {
        if (timedOut) return
        cancelled = true
        terminate()
      }, { once: true })
    }
  }

  const exit = await new Promise((resolve) => {
    child.on('close', (code, sig) => resolve({ code, sig }))
    child.on('error', () => resolve({ code: null, sig: null }))
  })

  if (timer) clearTimeout(timer)
  for (const t of timers) clearTimeout(t)
  // 一次幂等的强杀：确保整棵树都已退出（也是"取消必须收敛"的兑现）。
  if (timedOut || cancelled) killTree(true)

  return {
    exitCode: exit.code,
    signal: exit.sig,
    stdout,
    stderr,
    timedOut,
    cancelled,
    durationMs: Date.now() - started,
  }
}

const TRANSITIONS = {
  'pending+start': 'running',
  'running+succeed': 'succeeded',
  'running+fail': 'failed',
  'running+cancel': 'cancelled',
  'pending+cancel': 'cancelled',
}

/**
 * 作业状态机的一次转换（非法转换与终态之后的任何事件都返回 null）。
 * @param {'pending'|'running'|'succeeded'|'failed'|'cancelled'} state
 * @param {'start'|'succeed'|'fail'|'cancel'} event
 * @returns {string | null}
 */
export function transition(state, event) {
  return TRANSITIONS[`${state}+${event}`] ?? null
}

/**
 * 合并输出块，超预算时保留头尾并给出指针。
 * @param {string[]} chunks
 * @param {{ maxChars: number, headRatio: number }} budget
 * @returns {{ text: string, truncated: boolean, omittedChars: number, pointer: string | null }}
 */
export function collectOutput(chunks, budget) {
  const total = chunks.join('')
  if (total.length <= budget.maxChars) {
    return { text: total, truncated: false, omittedChars: 0, pointer: null }
  }
  const pointer = `spill://out-${shortHash(total)}`
  const reserve = Math.min(80, Math.floor(budget.maxChars * 0.4))
  let head = Math.max(1, Math.floor((budget.maxChars - reserve) * budget.headRatio))
  let tail = Math.max(1, budget.maxChars - reserve - head)
  const marker = (n) => `…[已省略 ${n} 字符，完整见 ${pointer}]…`
  let m = marker(total.length - head - tail)
  while (head + m.length + tail > budget.maxChars && tail > 1) {
    tail--
    m = marker(total.length - head - tail)
  }
  while (head + m.length + tail > budget.maxChars && head > 1) {
    head--
    m = marker(total.length - head - tail)
  }
  const text = total.slice(0, head) + m + total.slice(total.length - tail)
  return { text, truncated: true, omittedChars: total.length - head - tail, pointer }
}

/** @param {string} s */
function shortHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}
