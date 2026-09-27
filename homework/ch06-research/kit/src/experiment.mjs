// Part D · 实验设计与报告
//
// 对应讲义：6.2 实验方法。契约：见 ../CONTRACT.md 的「Part D」。
//
// 起步状态：四个函数都抛错。两条特点判据：
//   消融必须换**中性替代**（不是删掉）、报告里"未检出差异"必须带**分辨率**。

/**
 * 实验设计：样本量、重复、种子与成本估算。
 *
 * 契约要点：
 *   - tasks 与 Part C 的 sampleSize 公式一致
 *   - totalRuns = tasks * runs；**costEstimate = totalRuns * costPerTask**（成本是乘法的）
 *   - seeds 长度等于 runs 且互不相同
 *
 * 提示：成本有三个乘数（任务数 × 重复次数 × 每任务成本），因此"先压低每任务成本"通常
 *       比"多跑几次"更能让实验可行（讲义 6.2 的 1.7）。
 *
 * @param {{ baselineRate: number, targetDelta: number, runs?: number, costPerTask: number }} spec
 * @returns {{ tasks: number, runs: number, totalRuns: number, costEstimate: number, seeds: number[] }}
 */
export function planExperiment(spec) {
  throw new Error('未实现：planExperiment')
}

/**
 * 消融设计：中性替代 + 完整性核对项。
 *
 * 契约要点：
 *   - neutral 缺失或为空 → 抛错（信息含「中性」）
 *   - integrity 至少一项
 *   - steps 至少三步，且含「改前」与「改后」
 *
 * 提示：直接删掉一个组件常常既跑不起来、也无法归因（其他东西也跟着变了）——
 *       所以消融是"换成中性替代"（讲义 6.2 的 1.3）。
 *
 * @param {{ name: string, neutral?: string }} component
 * @returns {{ component: string, neutral: string, integrity: string[], steps: string[] }}
 */
export function planAblation(component) {
  throw new Error('未实现：planAblation')
}

/**
 * 构造报告（六项必填）。
 *
 * 契约要点：
 *   - 返回六个非空键：problem、bench、runs、results、conclusion、limits
 *   - **conclusion.detected === false 时必须给出 resolution**，否则抛错（信息含「分辨率」）
 *   - limits 至少一项
 *
 * 提示："未检出差异也是一条结论"，但它必须带分辨率——否则读者无法判断
 *       这是"确实无效"还是"测不出来"（讲义 6.2 的 3.5）。
 *
 * @param {object} record
 * @param {object} result
 * @param {{ detected: boolean, note: string, resolution?: string }} conclusion
 * @returns {object}
 */
export function buildReport(record, result, conclusion) {
  throw new Error('未实现：buildReport')
}

/**
 * 可复现性检查（四项记录）。
 *
 * 契约要点：
 *   - 检查 bench（name/version/checksum）、code（commit/config/profile）、seeds（非空）、env（deps/model/external）
 *   - missing 的每项是点路径（例如 bench.checksum、env.model），按字典序排序
 *   - ok === missing.length === 0
 *
 * 提示：四项里**模型版本最容易被忽略**，而它恰恰是 agent 实验里变化最快的一项。
 *
 * @param {object} record
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function isReproducible(record) {
  throw new Error('未实现：isReproducible')
}
