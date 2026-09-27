// Part C · 模式与预设
//
// 对应讲义：5.1 模式与预设。契约：见 ../CONTRACT.md 的「Part C」。
//
// 起步状态：四个函数都抛错。三条"看起来对、其实错"的判据：
//   数组必须整体替换（不是深合并）、能力集必须展开间接依赖、切换计划必须是整体的。

/**
 * 四层覆盖 + 来源追踪。
 *
 * 契约要点：
 *   - 按 layers 顺序覆盖（从低到高）
 *   - **对象深合并**（一层）：同键取上层，其余键保留
 *   - **数组整体替换**：上层是数组时整段替换，不得拼接下层的元素
 *   - origin[key] 记录最终生效的那一层
 *   - 不修改入参
 *
 * 提示：数组之所以不深合并，是因为"只加不减"的合并会让下层已被删除的元素残留——
 *       而那种残留只有在别人删东西时才会显现（讲义 5.1 的 1.2）。
 *
 * @param {Array<{ name: string, values: object }>} layers
 * @returns {{ values: object, origin: object }}
 */
export function compose(layers) {
  throw new Error('未实现：compose')
}

/**
 * 能力集展开（含间接依赖）。
 *
 * 契约要点：
 *   - 从 profile.plugins 出发广度优先，遇到新插件继续展开
 *   - caps 去重后按字典序排序；size === caps.length
 *   - 循环依赖不死循环
 *
 * 提示：手写声明覆盖不到"由依赖提供的能力"，因此能力集必须由推导得出而不是手写。
 *
 * @param {{ plugins: Array<{ name: string }>, requires: string[] }} profile
 * @param {{ provides: Function, dependencies: Function, has: Function }} registry
 * @returns {{ caps: string[], size: number }}
 */
export function expandCapabilities(profile, registry) {
  throw new Error('未实现：expandCapabilities')
}

/**
 * 启动校验（三层中的前两层）。
 *
 * 契约要点：
 *   - 插件不存在 → error（what 含插件名）
 *   - requires 未被满足 → error，且 hint 含「可能由」
 *   - 能力集超过上限 → error（what 含「上限」）
 *   - ok === issues.every(i => i.level !== 'error')；通过时 issues 为空数组
 *
 * @param {object} profile
 * @param {object} registry
 * @param {{ maxCapabilities: number }} ctx
 * @returns {{ ok: boolean, issues: Array<object>, capabilities: number }}
 */
export function validate(profile, registry, ctx) {
  throw new Error('未实现：validate')
}

/**
 * 切换计划（整体切换与残留预期）。
 *
 * 契约要点：
 *   - **mode 必须是 'whole'**（不接受增量重装）
 *   - steps 至少含四步：校验、构造、激活、核对残留
 *   - expectResidual **不含** 标记 surviving: true 的注册项（那些是应当存活的）
 *   - stateToMigrate 非空
 *
 * 提示：整体切换的代价是资源瞬时翻倍，而它换来"没有半应用状态"——
 *       增量重装的残留很难定位（讲义 5.1 的 1.5）。
 *
 * @param {{ name: string, registrations: Array<{ what: string, scope: string, surviving?: boolean }> }} from
 * @param {{ name: string }} to
 * @param {{ capabilityDelta?: number }} ctx
 * @returns {{ mode: string, steps: string[], expectResidual: string[], stateToMigrate: string[] }}
 */
export function planSwitch(from, to, ctx) {
  throw new Error('未实现：planSwitch')
}
