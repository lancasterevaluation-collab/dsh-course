// Part C · 上下文压缩与溢出
//
// 对应讲义：3.3 上下文压缩与溢出。
// 契约：见 ../CONTRACT.md 的「Part C」一节。本文件里每个函数的注释是契约的摘要，
//       而**判据以 CONTRACT.md 为准**（这里有歧义时以契约为准）。
//
// 起步状态：四个函数都抛错。跑 `node ../tests/t3-context.mjs` 会看到 12 条判据全不通过。
// 建议的顺序：先做 shouldCompact（最简单），再做 spill，然后 compactRange，最后 applyCompaction。

/**
 * 是否需要触发压缩。
 *
 * 契约要点：
 *   - 使用率**严格大于**阈值时返回 true（恰好等于不触发）。
 *   - usedTokens 为 0 时返回 false。
 *   - 纯函数，不修改参数，不使用 Date.now()。
 *
 * 提示：这道题的唯一陷阱是等于号。写下 `>` 之前先想清楚"恰好到阈值"该不该压。
 *
 * @param {{ usedTokens: number, maxTokens: number }} state
 * @param {{ threshold: number }} policy
 * @returns {boolean}
 */
export function shouldCompact(state, policy) {
  throw new Error('未实现：shouldCompact')
}

/**
 * 计算被压缩的区间（半开区间 [from, to)，以 seq 表示）。
 *
 * 契约要点：
 *   - 保留末尾 keepTail 条：返回值里 `to` 应当等于 events[length - keepTail].seq。
 *   - 可压缩条数少于 minRange 时返回 null。
 *   - events.length <= keepTail 时返回 null；空数组返回 null。
 *   - 区间非空：from < to。
 *
 * 提示：`from` 取第一条可压缩事件的 seq（而不是 1 或 0）——事件可能从任意 seq 开始。
 *
 * @param {Array<{ seq: number }>} events
 * @param {{ keepTail: number, minRange: number }} policy
 * @returns {{ from: number, to: number } | null}
 */
export function compactRange(events, policy) {
  throw new Error('未实现：compactRange')
}

/**
 * 处理超出预算的内容：内联片段加指针加完整内容。
 *
 * 契约要点：
 *   - 不超预算：inline === content，pointer 与 spilled 均为 null。
 *   - 超预算：spilled === content（完整保留）、pointer 非空、inline 同时含头尾、inline.length <= maxChars。
 *
 * 提示：三段式的关键是"不丢内容"——inline 是给模型看的，pointer 是给人查的，spilled 是原样。
 *
 * @param {string} content
 * @param {{ maxChars: number, headRatio: number }} budget
 * @returns {{ inline: string, pointer: string | null, spilled: string | null }}
 */
export function spill(content, budget) {
  throw new Error('未实现：spill')
}

/**
 * 应用压缩：用一条 session/compaction 事件替换区间，并返回新的水位线。
 *
 * 契约要点：
 *   - 替换事件的字段：type、atSeq（= 区间最后一条的 seq）、summary、placeholder: true。
 *   - 区间外的事件保持不变；不修改传入数组（返回新数组）。
 *   - watermark === atSeq。
 *
 * 提示：水位线的语义是"到此为止已被压缩"，因此它取的是**被替换部分的末尾**，而不是新长度。
 *
 * @param {Array<{ seq: number, [k: string]: unknown }>} events
 * @param {{ from: number, to: number }} range
 * @param {string} summary
 * @returns {{ events: Array<object>, watermark: number }}
 */
export function applyCompaction(events, range, summary) {
  throw new Error('未实现：applyCompaction')
}
