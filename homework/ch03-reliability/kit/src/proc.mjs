// Part D · 进程与后台作业
//
// 对应讲义：3.4 进程与后台作业。
// 契约：见 ../CONTRACT.md 的「Part D」一节。
//
// 起步状态：三个函数都抛错。这一项的 20 分里有 12 分来自三个**真实进程**的判据，
// 因此建议先让 runShell 在正常路径上工作，再处理超时、取消与大输出。

import { spawn } from 'node:child_process'

/**
 * 运行一个 shell 命令，带超时与取消。
 *
 * 契约要点：
 *   - 超时后终止**整棵进程树**（不只是直接子进程）。
 *   - 收到 opts.signal 的取消时：先温和终止，等一个宽限期，再强杀。
 *   - **并发消费 stdout/stderr**（否则大输出会因管道缓冲区满而死锁）。
 *   - timedOut 与 cancelled 不同时为 true；stdout/stderr 不截断。
 *   - 命令不存在时返回非零 exitCode，不抛错。
 *
 * 提示（两处最容易做错的地方）：
 *   1. 只 kill 直接子进程会留下孙进程——讲义 3.4 的 1.4 讲过进程组的做法。
 *      在 POSIX 上可以用 `detached: true` 加 `process.kill(-pid, sig)`；本作业的测试在
 *      Windows 与 POSIX 上都会跑，因此你需要判断平台（或用一个跨平台的替代：让子进程
 *      自己处理信号并等待它的子树退出，再用进程存活检查验证）。
 *   2. 管道缓冲区通常在 64KB 量级，而测试会输出远超它的内容。
 *
 * @param {string} cmd
 * @param {{ timeoutMs: number, signal?: AbortSignal, cwd?: string }} opts
 * @returns {Promise<{ exitCode: number | null, signal: string | null, stdout: string, stderr: string, timedOut: boolean, cancelled: boolean, durationMs: number }>}
 */
export async function runShell(cmd, opts) {
  throw new Error('未实现：runShell')
}

/**
 * 作业状态机的一次转换。
 *
 * 五态：pending、running、succeeded、failed、cancelled。
 * 合法转换：pending+start→running、running+succeed→succeeded、running+fail→failed、
 *          running+cancel→cancelled、pending+cancel→cancelled。
 * 其余组合（含**从终态出发的任何事件**）返回 null。
 *
 * 提示：这道题最容易被漏掉的是"终态不可逆"——写一个 switch 的表即可，但要想清楚
 *       为什么失败之后不能再 start（答案在讲义 3.4 的 1.6：终态表示结论已定）。
 *
 * @param {'pending'|'running'|'succeeded'|'failed'|'cancelled'} state
 * @param {'start'|'succeed'|'fail'|'cancel'} event
 * @returns {string | null}
 */
export function transition(state, event) {
  throw new Error('未实现：transition')
}

/**
 * 合并输出的数据块，并在超预算时保留头尾。
 *
 * 契约要点：
 *   - 不超预算：text 是完整拼接，truncated=false，omittedChars=0，pointer=null。
 *   - 超预算：text 含头尾，omittedChars 等于被省略的原始字符数，pointer 非空。
 *
 * 提示：头尾的比例用 headRatio；中间用一段标记文字（判分器允许 omittedChars 与
 *       "总长减 text.length"相差不超过标记文字的长度）。
 *
 * @param {string[]} chunks
 * @param {{ maxChars: number, headRatio: number }} budget
 * @returns {{ text: string, truncated: boolean, omittedChars: number, pointer: string | null }}
 */
export function collectOutput(chunks, budget) {
  throw new Error('未实现：collectOutput')
}
