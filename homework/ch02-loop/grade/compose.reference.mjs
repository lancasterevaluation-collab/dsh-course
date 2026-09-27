// 2.6 装配与配置组合 · 参考实现
//
// 契约（见 kit/CONTRACT-compose.md 与讲义 2.6）：
//   1 merge 深合并对象，未冲突的键保留下层贡献，冲突的键上层胜出；
//   2 数组整体替换，不做元素级合并（否则上层无法"减少"元素）；
//   3 merge 不修改入参；
//   4 结合律成立（可任意分组），交换律不成立（顺序即语义）；
//   5 resolveConfig 在合并的同时记录每个键的最终来源层。

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function merge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    // 数组与非对象一律整体替换（替换前先克隆，避免共享引用）。
    return Array.isArray(override) ? [...override] : override
  }
  const result = {}
  for (const [key, value] of Object.entries(base)) {
    result[key] = Array.isArray(value) ? [...value] : value
  }
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? merge(result[key], value) : Array.isArray(value) ? [...value] : value
  }
  return result
}

/** 四层覆盖：越靠后的层优先级越高，同时记录每个键的最终来源。 */
export function resolveConfig(layers) {
  const order = ['builtin', 'user', 'project', 'session']
  let value = {}
  const source = {}
  for (const name of order) {
    const layer = layers[name] ?? {}
    value = merge(value, layer)
    for (const key of Object.keys(layer)) source[key] = name
  }
  return { value, source }
}