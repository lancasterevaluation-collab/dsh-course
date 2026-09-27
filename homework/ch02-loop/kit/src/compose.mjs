// 2.6 装配与配置组合 · 作答模板
//
// 按 kit/CONTRACT-compose.md 实现。判分器会读源码：只要还留着 TODO，整份按未作答记 0 分。

export function merge(base, override) {
  // TODO 1：深合并对象；未冲突的键保留下层贡献，冲突的键上层胜出。
  // TODO 2：数组整体替换（不做元素级合并）。
  // TODO 3：不修改入参——要新建对象，而不是就地写。
  throw new Error('TODO 1：还没有实现 merge')
}

export function resolveConfig(layers) {
  // TODO 4：按 builtin → user → project → session 的顺序合并。
  // TODO 5：返回 { value, source }，source 里每个键记录它来自哪一层。
  throw new Error('TODO 4：还没有实现 resolveConfig')
}