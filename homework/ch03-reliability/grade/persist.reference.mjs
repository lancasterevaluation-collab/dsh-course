// Part E 的参考实现。
//
// 两类处置的差别是这一项的重点：
//   - 尾部不完整（半行、缺字段）→ 截断并报告（不抛错）；
//   - 中间有缺口（顺序号跳号）→ 抛错（那不是崩溃的正常结果）。
// 未知类型则按"是否可忽略"决定跳过还是拒绝整份日志。

/** 已知的事件类型。 */
export const KNOWN_TYPES = new Set([
  'session/user',
  'session/assistant',
  'session/tool-result',
  'session/compaction',
  'session/state',
])

/**
 * 读日志并处理尾部损坏。
 * @param {string[]} lines
 * @returns {{ events: Array<object>, truncatedAt?: number, rejected?: { reason: string } }}
 */
export function readAll(lines) {
  const events = []
  let expectedNext = null // 由**所有行**推进（含被跳过的），见 CONTRACT.md 的不变量 5
  for (const line of lines ?? []) {
    if (typeof line !== 'string' || line.trim() === '') continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      return { events, truncatedAt: events.length } // 半行：写入中断
    }
    if (typeof rec?.seq !== 'number' || typeof rec?.type !== 'string') {
      return { events, truncatedAt: events.length } // 缺字段：写入实现有问题
    }
    if (rec.type.startsWith('session/') && !KNOWN_TYPES.has(rec.type)) {
      if (rec.ignorable === true) {
        expectedNext = rec.seq + 1
        continue // 更高版本写的可忽略事件
      }
      return { events: [], rejected: { reason: `未知事件类型：${rec.type}` } }
    }
    if (expectedNext !== null && rec.seq !== expectedNext) {
      throw new Error(`顺序号跳号：期望 ${expectedNext}，读到 ${rec.seq}`)
    }
    events.push(rec)
    expectedNext = rec.seq + 1
  }
  return { events }
}

/**
 * 三步恢复：分析、重做、撤销。
 * @param {Array<object>} events
 * @param {{ lastSeq: number, state: object } | null} checkpoint
 * @returns {Promise<{ state: object, redone: number, reverted: number, fromCheckpoint: boolean }>}
 */
export async function recover(events, checkpoint) {
  const fromCheckpoint = checkpoint !== null && checkpoint !== undefined
  const state = fromCheckpoint
    ? { count: 0, items: [], ...checkpoint.state }
    : { lastSeq: 0, count: 0, items: [] }
  if (!Array.isArray(state.items)) state.items = []

  let redone = 0
  let reverted = 0
  for (const e of events ?? []) {
    if (typeof e.seq !== 'number') continue
    if (e.seq <= state.lastSeq) continue // 已被检查点或本次重做覆盖（幂等的关键）
    if (e.committed === true) {
      apply(state, e)
      redone++
    } else {
      revert(state, e) // 未提交：确保它不在状态里
      reverted++
    }
    state.lastSeq = e.seq
  }
  return { state, redone, reverted, fromCheckpoint }
}

/** @param {object} state @param {object} e */
function apply(state, e) {
  if (e.op === 'append') {
    state.items.push(e.value)
    state.count = state.items.length
  } else if (e.op === 'set') {
    state[e.key] = e.value
  }
}

/** @param {object} state @param {object} e */
function revert(state, e) {
  if (e.op === 'append') {
    const i = state.items.lastIndexOf(e.value)
    if (i >= 0) state.items.splice(i, 1)
    state.count = state.items.length
  } else if (e.op === 'set') {
    delete state[e.key]
  }
}
