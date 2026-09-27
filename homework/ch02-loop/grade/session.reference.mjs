// 2.7 会话日志与循环 · 参考实现
//
// 契约（见 kit/CONTRACT-session.md 与讲义 2.7）：
//   1 追加只往末尾加，顺序号单调递增（不用时钟）；
//   2 readLog 逐行解析，跳过尾部不完整的那一行并报告 truncated；
//   3 deriveMessages 从事件派生模型输入；压缩点派生出一条摘要消息；
//   4 pairingComplete：每个 tool-call 都必须有对应 tool-result，
//     被拦截与抛异常的调用同样要产出结果；
//   5 shouldStop：这一轮没有工具调用即正常收敛，原因为 no-tool-calls。

export function appendEvent(events, event) {
  const previous = events.length > 0 ? events[events.length - 1] : null
  const seq = previous && typeof previous.seq === 'number' ? previous.seq + 1 : 1
  return [...events, { seq, ...event }]
}

export function readLog(lines) {
  const events = []
  let truncated = false
  for (const line of lines) {
    if (String(line).trim() === '') continue
    try {
      events.push(JSON.parse(line))
    } catch {
      truncated = true
    }
  }
  return { events, truncated }
}

export function deriveMessages(events) {
  const messages = []
  for (const event of events) {
    switch (event.type) {
      case 'user':
        messages.push({ role: 'user', text: event.text })
        break
      case 'assistant':
        messages.push({ role: 'assistant', text: event.text })
        break
      case 'tool-call':
        messages.push({ role: 'assistant', toolCall: event.id, name: event.name })
        break
      case 'tool-result':
        messages.push({ role: 'tool', toolCall: event.id, result: event.result, ok: event.ok !== false })
        break
      case 'compaction':
        messages.push({ role: 'assistant', summary: true, text: event.text })
        break
      default:
        break
    }
  }
  return messages
}

export function pairingComplete(events) {
  const calls = new Set()
  const results = new Set()
  for (const event of events) {
    if (event.type === 'tool-call') calls.add(event.id)
    if (event.type === 'tool-result') results.add(event.id)
  }
  return [...calls].every((id) => results.has(id))
}

export function shouldStop(response) {
  const calls = response?.toolCalls ?? []
  if (calls.length === 0) return { stop: true, reason: 'no-tool-calls' }
  return { stop: false, reason: 'has-tool-calls' }
}