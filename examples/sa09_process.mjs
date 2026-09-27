// 3.4 配备算例：终止序列、宽限期、状态机、输出归并、超时嵌套、背压。
//
// 每个函数对应讲义 3.4 的一条命题，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa09_process.mjs
import { pathToFileURL } from 'node:url'

/** 作业状态转移表。终止状态没有出边，因此不可离开（工具箱 5.1 第二条）。 */
export const TRANSITIONS = {
  pending: { start: 'running', cancel: 'cancelled' },
  running: { done: 'succeeded', error: 'failed', cancel: 'cancelled', restart: 'unknown' },
  succeeded: {},
  failed: {},
  cancelled: {},
  unknown: { done: 'succeeded', error: 'failed', cancel: 'cancelled' },
}

/** 终止状态集合。@returns 状态名数组 */
export const TERMINAL = ['succeeded', 'failed', 'cancelled']

/**
 * 定义 3.4.2：三步终止序列。负号表示按进程组寻址。
 * @param pid 进程组标识 @param graceMs 宽限期（毫秒）
 * @returns 三步数组
 */
export function killSequence(pid, graceMs) {
  return [
    { signal: 'SIGTERM', target: -pid, delay: 0 },
    { signal: null, target: null, delay: graceMs },
    { signal: 'SIGKILL', target: -pid, delay: 0 },
  ]
}

/**
 * 定义 3.4.2：宽限期到点时的判断。
 * @param alivePids 仍存活的进程 @param graceMs 宽限期 @param now 当前时刻 @param startedAt 发出终止请求的时刻
 * @returns `{ kill, cleaned, waiting? }`；cleaned 为 false 表示清理未完成，必须记录
 */
export function graceExpired(alivePids, graceMs, now, startedAt) {
  if (alivePids.length === 0) return { kill: false, cleaned: true }
  if (now - startedAt < graceMs) return { kill: false, cleaned: true, waiting: true }
  return { kill: true, cleaned: false }
}

/**
 * 定义 3.4.3：状态转移。非法转移抛错，而不是静默返回原状态。
 * @param state 当前状态 @param event 事件
 * @returns 新状态
 */
export function nextState(state, event) {
  const to = TRANSITIONS[state]?.[event]
  if (!to) throw new Error(`非法转移：${state} --${event}-->`)
  return to
}

/**
 * 定义 3.4.4 / 工具箱 5.3：按时间戳归并两条有序输出流。
 * @param a 一条流（每项含 t） @param b 另一条流 @returns 合并后的序列
 */
export function mergeStreams(a, b) {
  const out = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) out.push(a[i].t <= b[j].t ? a[i++] : b[j++])
  while (i < a.length) out.push(a[i++])
  while (j < b.length) out.push(b[j++])
  return out
}

/**
 * 命题 3.4.5 / 工具箱 5.2：检查超时层级是否单调不增。
 * @param levels 由外到内的超时数组
 * @returns `{ ok, violation }`
 */
export function checkTimeoutNesting(levels) {
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1]) return { ok: false, violation: [i - 1, i, levels[i - 1], levels[i]] }
  }
  return { ok: true, violation: null }
}

/**
 * 定义 3.4.5 / 工具箱 5.4：缓冲区填满时间。
 * @param capacity 缓冲区容量（字节） @param produceRate 产出速率（字节/秒） @param consumeRate 消费速率
 * @returns 秒数；消费不低于产出时返回 Infinity
 */
export function bufferFillTime(capacity, produceRate, consumeRate = 0) {
  const net = produceRate - consumeRate
  if (net <= 0) return Number.POSITIVE_INFINITY
  return capacity / net
}

/**
 * 工具箱 5.1：从某状态出发的可达状态集合。
 * @param from 起始状态 @returns 可达状态数组（含自身）
 */
export function reachableStates(from) {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length) {
    const s = queue.shift()
    for (const to of Object.values(TRANSITIONS[s] ?? {})) {
      if (!seen.has(to)) { seen.add(to); queue.push(to) }
    }
  }
  return [...seen]
}

/**
 * 工具箱 5.1 第三条：从某状态出发能否到达终止状态。
 * @param from 起始状态 @returns 是否存在到终止状态的路径
 */
export function canReachTerminal(from) {
  return reachableStates(from).some((s) => TERMINAL.includes(s))
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(40)} ${v}`)

  const seq = killSequence(1234, 1000)
  line('终止序列步数', seq.length)
  line('第一步', `${seq[0].signal} → ${seq[0].target}`)
  line('第二步等待', `${seq[1].delay} ms`)
  line('第三步', `${seq[2].signal} → ${seq[2].target}`)

  line('宽限期：无存活进程', JSON.stringify(graceExpired([], 1000, 99999, 0)))
  line('宽限期：未到点', JSON.stringify(graceExpired([11], 1000, 500, 0)))
  line('宽限期：到点仍存活', JSON.stringify(graceExpired([11], 1000, 1500, 0)))

  line('running + restart', nextState('running', 'restart'))
  line('running + done', nextState('running', 'done'))
  try { nextState('succeeded', 'start'); line('终止状态不可离开', '未拦截（缺陷）') }
  catch { line('终止状态不可离开', '抛错拦截') }

  const a = [{ t: 1, channel: 'out', line: 'a1' }, { t: 3, channel: 'out', line: 'a2' }]
  const b = [{ t: 2, channel: 'err', line: 'b1' }, { t: 4, channel: 'err', line: 'b2' }]
  line('归并顺序', mergeStreams(a, b).map((x) => x.line).join(' → '))

  line('超时嵌套 [30000,10000,5000]', JSON.stringify(checkTimeoutNesting([30000, 10000, 5000]).ok))
  line('超时嵌套 [5000,10000]', JSON.stringify(checkTimeoutNesting([5000, 10000])))

  line('填满时间（64KB, 1MB/s）', bufferFillTime(65536, 1000000, 0).toFixed(4) + ' 秒')
  line('填满时间（消费≥产出）', bufferFillTime(65536, 1000, 1000))

  line('从 pending 可达终止态', canReachTerminal('pending'))
  line('从 unknown 可达终止态', canReachTerminal('unknown'))
  line('从 running 可达终止态', canReachTerminal('running'))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
