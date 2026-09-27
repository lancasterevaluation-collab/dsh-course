// 2.3 容器与依赖注入 · 参考实现
//
// 契约（见 kit/CONTRACT-container.md 与讲义 2.3）：
//   1 注册返回一个只能撤销它自己的句柄；
//   2 同名后注册者胜出，撤销后前者恢复可见；
//   3 disposeAll 按注册的逆序执行；
//   4 其中一次撤销失败不得阻断其余；
//   5 撤销幂等，第二次调用返回 false 且不做任何事。

export function createContainer() {
  const entries = new Map()
  let seq = 0

  return {
    register(name, value) {
      const token = { id: ++seq }
      const list = entries.get(name) ?? []
      const displaced = list.length > 0 ? list[list.length - 1].token : null
      list.push({ value, token })
      entries.set(name, list)
      let done = false
      return {
        name,
        token,
        displaced,
        dispose() {
          if (done) return false
          done = true
          const current = entries.get(name) ?? []
          const index = current.findIndex((entry) => entry.token === token)
          if (index >= 0) current.splice(index, 1)
          if (current.length === 0) entries.delete(name)
          return true
        },
      }
    },

    resolve(name) {
      const list = entries.get(name) ?? []
      return list.length > 0 ? list[list.length - 1].value : undefined
    },

    /** 按注册的逆序撤销；逐个捕获失败并汇总。 */
    disposeAll(handles) {
      let succeeded = 0
      const failures = []
      for (const handle of [...handles].reverse()) {
        try {
          if (handle.dispose()) succeeded += 1
        } catch (error) {
          failures.push({ name: handle.name, message: String(error?.message ?? error) })
        }
      }
      return { succeeded, failures }
    },
  }
}