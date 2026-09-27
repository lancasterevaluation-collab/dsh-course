// 2.4 事件与扩展点 · 参考实现
//
// 契约（见 kit/CONTRACT-events.md 与讲义 2.4）：
//   1 on 返回一个幂等的取消函数；
//   2 emit 是广播：所有监听器都收到同一个载荷，按「优先级降序、同优先级按注册序」；
//   3 waterfall 是接力：监听器签名 (value, next)，调用 next 才继续；
//   4 不调用 next 即短路，后续监听器不执行（与原样传回不同）；
//   5 取消之后不再收到通知。

export function createBus() {
  let seq = 0
  const listeners = new Map()

  const ordered = (event) =>
    [...(listeners.get(event) ?? [])].sort((a, b) =>
      b.priority === a.priority ? a.seq - b.seq : b.priority - a.priority,
    )

  return {
    on(event, listener, options = {}) {
      const entry = { listener, priority: options.priority ?? 0, seq: ++seq }
      const list = listeners.get(event) ?? []
      list.push(entry)
      listeners.set(event, list)
      let done = false
      const off = () => {
        if (done) return false
        done = true
        const current = listeners.get(event) ?? []
        const index = current.indexOf(entry)
        if (index >= 0) current.splice(index, 1)
        if (current.length === 0) listeners.delete(event)
        return true
      }
      off.entry = entry
      return off
    },

    emit(event, payload) {
      let calls = 0
      for (const entry of ordered(event)) {
        entry.listener(payload)
        calls += 1
      }
      return calls
    },

    /** 接力：每个监听器收到 (value, next)，返回值作为下一个的输入。 */
    waterfall(event, initial) {
      const chain = ordered(event)
      let index = 0
      const step = (value) => {
        if (index >= chain.length) return { value, completed: true }
        const entry = chain[index]
        index += 1
        let continued = false
        const next = (v) => {
          continued = true
          return step(v)
        }
        const returned = entry.listener(value, next)
        return continued ? returned : { value: returned, completed: false }
      }
      return step(initial)
    },
  }
}