// Part E · 持久化与恢复
//
// 对应讲义：3.5 持久化与恢复。
// 契约：见 ../CONTRACT.md 的「Part E」一节。
//
// 起步状态：两个函数都抛错。这一项的判据里有四条检验**损坏输入**、两条检验**幂等**、
// 一条检验"从检查点恢复与从头重放结果相同"（最关键的一条）。

/** 已知的事件类型（契约里给出）。未知类型且不可忽略时拒绝整份日志。 */
export const KNOWN_TYPES = new Set([
  'session/user',
  'session/assistant',
  'session/tool-result',
  'session/compaction',
  'session/state',
])

/**
 * 读日志并处理尾部损坏。
 *
 * 契约要点：
 *   - 正常行按顺序进入 events。
 *   - **半行**（JSON 解析失败）与**缺字段**（无 seq 或 type）→ 截断并置 truncatedAt（不抛错）。
 *   - **顺序号跳号** → 抛错，信息含「跳号」或「gap」。
 *   - 未知类型：带 ignorable: true 则跳过；不带则返回 rejected 且 events 为空。
 *   - 空输入返回 { events: [] }。
 *
 * 提示：三种损坏的处置不同，而区分它们正是这个函数的全部内容。写下每一类的分支之前，
 *       先想清楚"它在真实崩溃里可能出现吗"——讲义 3.5 的 0.3 讨论过这一点。
 *
 * @param {string[]} lines
 * @returns {{ events: Array<object>, truncatedAt?: number, rejected?: { reason: string } }}
 */
export function readAll(lines) {
  throw new Error('未实现：readAll')
}

/**
 * 三步恢复：分析、重做、撤销。
 *
 * 状态形状（判分器按它核对）：`{ lastSeq: 0, count: 0, items: [] }`。
 * 事件的 op 字段：
 *   - `{ op: 'append', value: X }` → items.push(X)，count++
 *   - `{ op: 'set', key, value }`  → state[key] = value
 *   - 无 op 的事件只推进 lastSeq
 *
 * 契约要点：
 *   - checkpoint 为 null 时从空状态开始，fromCheckpoint=false。
 *   - 非 null 时跳过 seq <= checkpoint.lastSeq 的事件，fromCheckpoint=true。
 *   - **重做幂等**：对同一份日志连做两次恢复，第二次 redone 为 0，且两次的最终 state 逐字段相同。
 *   - 未提交（committed !== true）的事件计入 reverted 并从状态撤销。
 *
 * 提示：幂等的关键在 lastSeq——重做时只处理 seq > state.lastSeq 的事件。而"第二次 redone 为 0"
 *       还要求你把推进后的 lastSeq**写回 state**（否则第二次会重做一遍）。
 *
 * @param {Array<object>} events
 * @param {{ lastSeq: number, state: object } | null} checkpoint
 * @returns {Promise<{ state: object, redone: number, reverted: number, truncatedAt?: number, fromCheckpoint: boolean }>}
 */
export async function recover(events, checkpoint) {
  throw new Error('未实现：recover')
}
