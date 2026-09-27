// 2.7 会话日志与循环 · 作答模板
//
// 按 kit/CONTRACT-session.md 实现。判分器会读源码：只要还留着 TODO，整份按未作答记 0 分。

export function appendEvent(events, event) {
  // TODO 1：只往末尾追加，顺序号单调递增（不要用时间戳）。
  throw new Error('TODO 1：还没有实现 appendEvent')
}

export function readLog(lines) {
  // TODO 2：逐行解析；尾部不完整的那行跳过，并按 { events, truncated } 返回。
  throw new Error('TODO 2：还没有实现 readLog')
}

export function deriveMessages(events) {
  // TODO 3：从事件派生消息；压缩点要派生出一条摘要消息。
  throw new Error('TODO 3：还没有实现 deriveMessages')
}

export function pairingComplete(events) {
  // TODO 4：每个 tool-call 都必须有对应 tool-result（被拦截与抛异常的也要有）。
  throw new Error('TODO 4：还没有实现 pairingComplete')
}

export function shouldStop(response) {
  // TODO 5：没有工具调用即收敛，原因为 no-tool-calls。
  throw new Error('TODO 5：还没有实现 shouldStop')
}