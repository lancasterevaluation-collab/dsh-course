// 4.4 诊断的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/**
 * 定义 4.4.1：三类失败，判定顺序从最明确到最宽泛。
 * @param turn 形如 `{ error, goal }` 的回合
 * @param checks 检查数组（`{ name, passed }`）
 * @returns 失败对象；三类都不成立时为 null
 */
export function classifyFailure(turn, checks = []) {
  if (turn.error) return { kind: 'error', detail: turn.error }
  const failed = checks.filter((c) => !c.passed(turn))
  if (failed.length) return { kind: 'silent', detail: failed.map((c) => c.name) }
  if (turn.goal && !turn.goal.met(turn)) return { kind: 'goal-miss', detail: turn.goal.summary }
  return null
}

/** 定义 4.4.3：三类证据的强度与改动成本的次序。 */
export const STRENGTH = { correlation: 1, counterfactual: 2, reproducible: 3 }
export const COST_ORDER = { low: 0, medium: 1, high: 2 }

/**
 * 定义 4.4.3：一个候选的证据得分。
 * @param c 候选
 * @returns 证据强度之和
 */
export function score(c) {
  return c.evidence.reduce((n, e) => n + STRENGTH[e], 0)
}

/**
 * 定义 4.4.2 / 命题 4.4.2：过滤不可行动的候选，再按证据与成本排序。
 * @param candidates 候选数组
 * @returns 排序后的候选
 */
export function rankCandidates(candidates) {
  return [...candidates]
    .filter((c) => c.actionable !== null)
    .sort((a, b) => score(b) - score(a) || COST_ORDER[a.cost] - COST_ORDER[b.cost])
}

/**
 * 命题 4.4.2：候选是否够全（至少两条，除非一条同时具备反事实与复现）。
 * @param candidates 候选数组
 * @returns `{ ok, reason }`
 */
export function checkCandidateCount(candidates) {
  if (candidates.length >= 2) return { ok: true, reason: '' }
  const strong = candidates.some((c) => c.evidence.includes('counterfactual') && c.evidence.includes('reproducible'))
  return strong ? { ok: true, reason: '单候选但证据足够强' } : { ok: false, reason: '候选不足，需要继续收集' }
}

/**
 * 定义 4.4.6：生成六字段结论。
 * @param candidates 候选数组
 * @param failure 失败对象
 * @param known 已知条件
 * @param taskId 任务标识
 * @returns 诊断结论
 * @throws 当没有可行动的候选时
 */
export function conclude(candidates, failure, known, taskId) {
  const ranked = rankCandidates(candidates)
  if (ranked.length === 0) throw new Error('没有可行动的候选：需要扩大观测范围或改可配置性')
  const chosen = ranked[0]
  return {
    phenomenon: `${failure.kind}：${JSON.stringify(failure.detail)}`,
    knownConditions: known,
    candidates: ranked,
    conclusion: { cause: chosen.cause, why: `证据得分 ${score(chosen)}，改动成本 ${chosen.cost}` },
    action: { target: chosen.actionable, verify: `改后重跑：${taskId}` },
    watchList: ranked.slice(1).map((c) => c.cause),
  }
}

/**
 * 命题 4.4.5：修复验证——改前复现、改后不出现，缺一不可。
 * @param diagnosis 诊断结论
 * @param replay 重放函数，返回 `{ failed }`
 * @param rerun 重跑函数，返回 `{ failed }`
 * @returns `{ ok, reason }`
 */
export async function verifyFix(diagnosis, replay, rerun) {
  const before = await replay(diagnosis.knownConditions)
  if (!before.failed) return { ok: false, reason: '改前无法复现，本次验证无效' }
  const after = await rerun(diagnosis.knownConditions)
  return { ok: !after.failed, reason: after.failed ? '改后仍失败' : '改前复现、改后通过' }
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export async function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('4.4 诊断 · 算例（SA-35）')
  rows.push('')

  rows.push('[1] 失败判定')
  line('报错类失败', classifyFailure({ error: 'boom' })?.kind)
  line('静默错误结果类失败', classifyFailure({}, [{ name: 'no-null', passed: () => false }])?.kind)
  line('目标未达成类失败', classifyFailure({ goal: { met: () => false, summary: '未覆盖全部用例' } })?.kind)
  line('同时有错与目标未达时的判定', classifyFailure({ error: 'boom', goal: { met: () => false } })?.kind)
  line('三类都不成立时是否算失败', classifyFailure({ goal: { met: () => true } }, [{ name: 'ok', passed: () => true }]) === null)
  line('报错优先于检查不通过', classifyFailure({ error: 'boom' }, [{ name: 'x', passed: () => false }])?.kind)
  line('检查优先于目标未达', classifyFailure({ goal: { met: () => false } }, [{ name: 'x', passed: () => false }])?.kind)
  rows.push('')

  rows.push('[2] 证据与候选')
  line('证据强度（相关 / 反事实 / 复现）', `${STRENGTH.correlation} / ${STRENGTH.counterfactual} / ${STRENGTH.reproducible}`)
  const candidates = [
    { cause: '单次调用的超时上限过小', evidence: ['counterfactual', 'reproducible'], actionable: '调大 3.4 的超时配置', cost: 'low' },
    { cause: '上下文过长导致首 token 很慢', evidence: ['correlation'], actionable: '收紧 3.3 的压缩阈值', cost: 'medium' },
    { cause: '模型能力不足', evidence: ['correlation'], actionable: null, cost: 'high' },
    { cause: '重试放大拥塞', evidence: ['correlation'], actionable: '调低 3.1 的并发或退避', cost: 'low' },
  ]
  const ranked = rankCandidates(candidates)
  line('不可行动的候选数', candidates.filter((c) => c.actionable === null).length)
  line('排序后的候选数', ranked.length)
  line('得分最高的候选', `${ranked[0].cause}（${score(ranked[0])}）`)
  line('排序（按得分）', ranked.map((c) => `${c.cause.slice(0, 6)}(${score(c)})`).join(', '))
  line('不可行动的候选是否进入结论', ranked.some((c) => c.actionable === null))
  line('同强度下低成本优先', ranked[1].cost === 'low' && ranked[2].cost === 'medium')
  line('同强度候选的顺序', ranked.slice(1).map((c) => c.cost).join(', '))
  line('单候选且证据弱时是否够全', checkCandidateCount([candidates[1]]).ok)
  line('单候选但证据强时是否够全', checkCandidateCount([candidates[0]]).ok)
  rows.push('')

  rows.push('[3] 结论')
  const known = { config: 'timeoutMs=30000', coldStart: false, loaded: ['refactor'], resources: { concurrency: 4 } }
  const diagnosis = conclude(candidates, { kind: 'silent', detail: ['no-timeout'] }, known, 'long-refactor')
  line('结论的字段数', Object.keys(diagnosis).length)
  line('结论的字段名', Object.keys(diagnosis).join(', '))
  line('结论里的可改对象', diagnosis.action.target)
  line('已知条件被记录', Object.keys(diagnosis.knownConditions).length)
  line('观察项条数', diagnosis.watchList.length)
  line('结论里的证据说明', diagnosis.conclusion.why)
  let threw = false
  try { conclude([{ cause: '模型能力不足', evidence: ['correlation'], actionable: null, cost: 'high' }], { kind: 'error', detail: 'x' }, known, 't') } catch { threw = true }
  line('无候选时抛错', threw)
  rows.push('')

  rows.push('[4] 修复验证')
  const notRepro = await verifyFix(diagnosis, async () => ({ failed: false }), async () => ({ failed: false }))
  line('改前不复现时的验证结果', notRepro.ok)
  line('改前不复现时的原因', notRepro.reason)
  const fixed = await verifyFix(diagnosis, async () => ({ failed: true }), async () => ({ failed: false }))
  line('改前复现、改后通过时的结果', fixed.ok)
  line('改前复现、改后通过时的原因', fixed.reason)
  const stillBad = await verifyFix(diagnosis, async () => ({ failed: true }), async () => ({ failed: true }))
  line('改前复现、改后仍失败时的结果', stillBad.ok)
  line('改后仍失败时的原因', stillBad.reason)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
