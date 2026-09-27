// Part C 的参考实现。
//
// 它同时是契约的一个"可行证明"：如果这里的实现不能满分，说明契约或测试有问题。
// 学习者应当在**自己试过之后**再读它（见作业引导的附录）。

/**
 * 是否需要触发压缩（严格大于阈值；恰好等于不触发）。
 * @param {{ usedTokens: number, maxTokens: number }} state
 * @param {{ threshold: number }} policy
 * @returns {boolean}
 */
export function shouldCompact(state, policy) {
  if (!state || state.maxTokens <= 0) return false
  if (state.usedTokens === 0) return false
  return state.usedTokens / state.maxTokens > policy.threshold
}

/**
 * 计算被压缩的半开区间 [from, to)。
 * @param {Array<{ seq: number }>} events
 * @param {{ keepTail: number, minRange: number }} policy
 * @returns {{ from: number, to: number } | null}
 */
export function compactRange(events, policy) {
  if (!Array.isArray(events) || events.length === 0) return null
  if (events.length <= policy.keepTail) return null
  const compactable = events.length - policy.keepTail
  if (compactable < policy.minRange) return null
  const from = events[0].seq
  const to = events[compactable].seq
  if (!(from < to)) return null
  return { from, to }
}

/**
 * 超预算内容的三段式处理：内联片段、指针、完整内容。
 * @param {string} content
 * @param {{ maxChars: number, headRatio: number }} budget
 * @returns {{ inline: string, pointer: string | null, spilled: string | null }}
 */
export function spill(content, budget) {
  const { maxChars, headRatio } = budget
  if (content.length <= maxChars) return { inline: content, pointer: null, spilled: null }
  const pointer = `spill://${shortHash(content)}`
  const reserve = Math.min(80, Math.floor(maxChars * 0.4))
  let head = Math.max(1, Math.floor((maxChars - reserve) * headRatio))
  let tail = Math.max(1, maxChars - reserve - head)
  let marker = markerFor(content.length - head - tail)
  while (head + marker.length + tail > maxChars && tail > 1) {
    tail--
    marker = markerFor(content.length - head - tail)
  }
  while (head + marker.length + tail > maxChars && head > 1) {
    head--
    marker = markerFor(content.length - head - tail)
  }
  const inline = content.slice(0, head) + marker + content.slice(content.length - tail)
  return { inline, pointer, spilled: content }
}

/**
 * 应用压缩：把区间替换成一条 session/compaction 事件，并返回水位线。
 * @param {Array<{ seq: number, [k: string]: unknown }>} events
 * @param {{ from: number, to: number }} range
 * @param {string} summary
 * @returns {{ events: Array<object>, watermark: number }}
 */
export function applyCompaction(events, range, summary) {
  const inside = events.filter((e) => e.seq >= range.from && e.seq < range.to)
  if (inside.length === 0) throw new Error('压缩区间为空')
  const atSeq = inside[inside.length - 1].seq
  const before = events.filter((e) => e.seq < range.from)
  const after = events.filter((e) => e.seq >= range.to)
  const placeholder = { type: 'session/compaction', seq: range.from, atSeq, summary, placeholder: true }
  return { events: [...before, placeholder, ...after], watermark: atSeq }
}

/** @param {number} n */
function markerFor(n) {
  return `…[已省略 ${n} 字符]…`
}

/** @param {string} s */
function shortHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}
