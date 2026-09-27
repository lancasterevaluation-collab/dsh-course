// 2.5 作用域与隔离 · 参考实现
//
// 契约（见 kit/CONTRACT-scope.md 与讲义 2.5）：
//   1 lookup 从本作用域向上找，先找到的胜出；
//   2 子作用域 define 同名值即遮蔽父作用域的值，父作用域自身不受影响；
//   3 shield(name) 切断该名字的向上查找：后代查不到，但本作用域自己仍可查得；
//   4 兄弟作用域互不可见；
//   5 dispose 递归退出，子先于父，返回退出顺序。

export function createScope(parent = null) {
  const own = new Map()
  const shielded = new Set()
  const children = []

  const scope = {
    parent,

    define(name, value) {
      own.set(name, value)
      return () => own.delete(name)
    },

    shield(name) {
      shielded.add(name)
    },

    child() {
      const created = createScope(scope)
      children.push(created)
      return created
    },

    lookup(name) {
      let current = scope
      while (current) {
        if (current.has(name)) return current.get(name)
        // 隔离标记在这里生效：本作用域没有它时，不再向上穿透。
        if (current.isShielded(name)) return undefined
        current = current.parent
      }
      return undefined
    },

    has(name) {
      return own.has(name)
    },

    get(name) {
      return own.get(name)
    },

    isShielded(name) {
      return shielded.has(name)
    },

    /** 只退出本作用域；孙辈先于子辈，子辈先于本作用域。 */
    disposeSelf() {
      const order = []
      for (const child of children) order.push(...child.disposeSelf())
      children.length = 0
      order.push(scope)
      own.clear()
      return order
    },

    /** 退出整棵树，返回从率先退出到最后的顺序。 */
    dispose() {
      return scope.disposeSelf()
    },

    childCount() {
      return children.length
    },
  }

  return scope
}