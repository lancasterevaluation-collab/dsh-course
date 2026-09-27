// 2.5 作用域与隔离 · 作答模板
//
// 按 kit/CONTRACT-scope.md 实现。判分器会读源码：只要还留着 TODO，整份按未作答记 0 分。

export function createScope(parent = null) {
  // TODO 1：本作用域的登记表、隔离标记集合、子作用域列表。
  return {
    parent,

    define(name, value) {
      // TODO 2：在本作用域登记，返回一个撤销函数。
      throw new Error('TODO 2：还没有实现 define')
    },

    shield(name) {
      // TODO 3：切断这个名字的向上查找。
      throw new Error('TODO 3：还没有实现 shield')
    },

    child() {
      // TODO 4：创建一个以本作用域为父的子作用域。
      throw new Error('TODO 4：还没有实现 child')
    },

    lookup(name) {
      // TODO 5：向上查找；遇到隔离标记时停止，不要穿透。
      throw new Error('TODO 5：还没有实现 lookup')
    },

    dispose() {
      // TODO 6：递归退出，子先于父，返回退出顺序数组。
      throw new Error('TODO 6：还没有实现 dispose')
    },
  }
}