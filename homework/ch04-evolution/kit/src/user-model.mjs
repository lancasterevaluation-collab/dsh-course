// Part D · 用户模型的置信度
//
// 对应讲义：4.3 用户建模。契约：见 ../CONTRACT.md 的「Part D」。
//
// 起步状态：四个函数都抛错。这一项的三条特点判据：
//   反驳到零即删除、无特征时反驳不创建特征、列表不暴露 weight。

/**
 * 应用一次观察：支持、反驳与归零删除。
 *
 * 契约要点：
 *   - 权重 explicit=3、implicit=1、contradict=-2
 *   - 同向累加；反向先削弱；reverse 后 weight <= 0 → **删除该特征**
 *   - **无该 key 且 kind==='contradict' → 不创建**（一次"不要这样"只是否定）
 *   - 新建特征带 expiresAt = at + ttlDays（缺省 180 天）
 *   - 不修改入参 model
 *
 * 提示：反驳之所以比支持更重，是因为沉默会被当成支持（讲义 4.3 的 1.3）——
 *       如果支持与反驳等权，置信度会随使用时长单向上升。
 *
 * @param {{ features: Array<object> }} model
 * @param {{ key: string, value: string, kind: 'explicit'|'implicit'|'contradict', at: number }} obs
 * @param {{ ttlDays?: number }} [opts]
 * @returns {{ features: Array<object> }}
 */
export function applyObservation(model, obs, opts) {
  throw new Error('未实现：applyObservation')
}

/**
 * 时间衰减与漂移报告（只报告，不自动处置）。
 *
 * 契约要点：
 *   - expiresAt <= now 的特征被**删除**（不是抑制）
 *   - drifting：窗口内 contradict 证据数 ≥ driftThreshold 的 key（按字典序）
 *
 * @param {{ features: Array<object> }} model
 * @param {number} now
 * @param {{ windowDays?: number, driftThreshold?: number }} [opts]
 * @returns {{ model: object, drifting: string[] }}
 */
export function decayAndDetect(model, now, opts) {
  throw new Error('未实现：decayAndDetect')
}

/**
 * 注入：门槛判定 + 执行层调整 + 中等置信度时把推断说出来。
 *
 * 契约要点：
 *   - weight < threshold 不生效
 *   - weight >= confirmThreshold 生效但**不追加说明**
 *   - 中等置信度生效时，notes 追加一句以「按你以往的偏好：」开头
 *   - 不修改入参 spec
 *
 * @param {{ features: Array<object> }} model
 * @param {{ length: string, format: string, notes: string[] }} spec
 * @param {{ threshold?: number, confirmThreshold?: number }} [opts]
 * @returns {object}
 */
export function inject(model, spec, opts) {
  throw new Error('未实现：inject')
}

/**
 * 面向人的特征列表（**不得暴露内部字段**）。
 *
 * 契约要点：
 *   - 每项 { label, reason, confidence }；confidence 为「已确认」（weight>=6）或「推测」
 *   - 返回的对象里不得出现 weight 这个字段名
 *
 * @param {{ features: Array<object> }} model
 * @returns {Array<{ label: string, reason: string, confidence: string }>}
 */
export function listFeatures(model) {
  throw new Error('未实现：listFeatures')
}
