// 4.5 演化的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/** 定义 4.5.5：不可被演化修改的对象。 */
export const META_CONTROLLED = ['gate/thresholds', 'gate/canary-ratio', 'eval/dataset', 'log/writer', 'meta/list']

/**
 * 命题 4.5.1：在 n 个任务的评估集上，退化率为 p 的改动被发现的概率。
 * @param p 单任务上的退化概率
 * @param n 评估集任务数
 * @returns 至少命中一次的概率
 */
export function detectionProbability(p, n) {
  return 1 - (1 - p) ** n
}

/**
 * 定义 4.5.2：提议必须含改前改后两段，且追溯到可行动对象。
 * @param diagnosis 诊断结论
 * @param change `{ id, target, diff, expectation, rollback, originVersion }`
 * @returns 提议
 * @throws 缺少差异文本或可行动对象时
 */
export function buildProposal(diagnosis, change) {
  if (!change.diff?.before || !change.diff?.after) throw new Error('提议必须给出改前与改后两段文本')
  if (!diagnosis.action?.target) throw new Error('提议必须追溯到一个可行动的对象')
  return {
    id: change.id,
    target: change.target,
    diff: change.diff,
    reason: `${diagnosis.phenomenon} → ${diagnosis.conclusion.cause}`,
    expectation: change.expectation,
    rollback: change.rollback,
    originVersion: change.originVersion,
  }
}

/**
 * 定义 4.5.2：把差异应用到一段文本上。
 * @param text 原文本
 * @param diff `{ before, after }`
 * @returns 应用后的文本
 * @throws 当原文本不含改前段时
 */
export function applyDiff(text, diff) {
  if (!text.includes(diff.before)) throw new Error('原文本不含改前段，无法应用')
  return text.replace(diff.before, diff.after)
}

/**
 * 定义 4.5.3 / 4.5.5：静态门——权限、基线版本与差异可应用。
 * @param p 提议
 * @param current 当前版本（`{ id, textOf }`）
 * @returns `{ ok, why }`
 */
export function staticGate(p, current) {
  if (META_CONTROLLED.includes(p.target.path)) return { ok: false, why: `元控制对象不可演化：${p.target.path}` }
  if (p.originVersion !== current.id) return { ok: false, why: `基线版本过期：${p.originVersion} ≠ ${current.id}` }
  try {
    applyDiff(current.textOf(p.target.path), p.diff)
  } catch {
    return { ok: false, why: '差异无法干净应用' }
  }
  return { ok: true }
}

/**
 * 定义 4.5.6：噪声与改善的比较，护栏参与判决。
 * @param baselineA 基线第一次运行
 * @param baselineB 基线第二次运行
 * @param candidate 候选运行
 * @param guardOk 护栏是否未退化
 * @returns `{ accepted, gain, noise, threshold, guardOk }`
 */
export function evaluate(baselineA, baselineB, candidate, guardOk = true) {
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
  const noise = Math.abs(mean(baselineA) - mean(baselineB))
  const gain = mean(candidate) - (mean(baselineA) + mean(baselineB)) / 2
  return { accepted: gain > 2 * noise && guardOk, gain, noise, threshold: 2 * noise, guardOk }
}

/** 定义 4.5.4：一个最小的版本库，用于演示原子切换与回滚。 */
export class VersionStore {
  #versions = new Map()
  #events = []
  #current = null
  #stateVersion = 1

  /**
   * @param stateVersion 当前持久状态的版本号
   */
  constructor(stateVersion = 1) {
    this.#stateVersion = stateVersion
  }

  /** @returns 事件数组 */
  get events() { return [...this.#events] }

  /** @returns 当前版本 */
  current() { return this.#versions.get(this.#current) }

  /** @returns 当前状态版本号 */
  stateVersion() { return this.#stateVersion }

  /**
   * 写入一个版本。
   * @param v 形如 `{ id, base, changes, canRead }`
   * @returns 版本
   */
  stage(v) {
    const version = { ...v, canRead: v.canRead ?? (() => true) }
    this.#versions.set(v.id, version)
    return version
  }

  /**
   * 原子切换。
   * @param id 目标版本号
   * @returns 无
   */
  atomicSwitch(id) { this.#current = id }

  /**
   * 读取一个版本。
   * @param id 版本号
   * @returns 版本
   */
  load(id) { return this.#versions.get(id) }

  /**
   * 追加一条事件。
   * @param e 事件
   * @returns 无
   */
  appendEvent(e) { this.#events.push(e) }
}

/**
 * 定义 4.5.4：发布——一组改动作为一个版本，切换是原子的。
 * @param store 版本库
 * @param proposal 提议
 * @param now 当前时间
 * @returns 新版本号
 */
export function release(store, proposal, now) {
  const previous = store.current()
  const next = store.stage({ id: `v${store.events.length + 2}`, base: previous.id, changes: [proposal] })
  store.atomicSwitch(next.id)
  store.appendEvent({ type: 'evolution/release', version: next.id, from: previous.id, proposal: proposal.id, at: now })
  return next.id
}

/**
 * 定义 4.5.4：回滚——先检查状态兼容，再原子切换。
 * @param store 版本库
 * @param to 目标版本号
 * @param now 当前时间
 * @returns 目标版本号
 * @throws 当目标版本读不了当前状态时
 */
export function rollback(store, to, now) {
  const target = store.load(to)
  if (!target.canRead(store.stateVersion())) throw new Error(`目标版本 ${to} 无法读取当前状态，需先迁移`)
  store.appendEvent({ type: 'evolution/rollback', to, at: now })
  store.atomicSwitch(to)
  return to
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('4.5 演化 · 算例（SA-36）')
  rows.push('')

  rows.push('[1] 提议')
  const diagnosis = {
    phenomenon: 'silent：["no-timeout"]',
    conclusion: { cause: '超时过小' },
    action: { target: '调大超时配置' },
  }
  const change = {
    id: 'p1',
    target: { kind: 'config', path: 'llm/timeoutMs' },
    diff: { before: 'timeoutMs: 30000', after: 'timeoutMs: 90000' },
    expectation: { metric: 'success-rate', delta: 0.05 },
    rollback: '应用反向差异',
    originVersion: 'v1',
  }
  const proposal = buildProposal(diagnosis, change)
  line('提议的字段数', Object.keys(proposal).length)
  line('提议的字段名', Object.keys(proposal).join(', '))
  line('理由追溯到诊断结论', proposal.reason.includes('超时过小'))
  let threw = 0
  try { buildProposal(diagnosis, { ...change, diff: { before: '', after: '' } }) } catch { threw++ }
  try { buildProposal({ action: { target: null } }, change) } catch { threw++ }
  line('两类校验各自抛错', threw === 2)
  rows.push('')

  rows.push('[2] 静态门')
  const current = { id: 'v1', textOf: () => 'timeoutMs: 30000\nretry: 3' }
  line('合法提议是否通过', staticGate(proposal, current).ok)
  line('改门控对象是否被拒', staticGate({ ...proposal, target: { kind: 'config', path: 'gate/thresholds' } }, current).ok === false)
  line('改评估集是否被拒', staticGate({ ...proposal, target: { kind: 'config', path: 'eval/dataset' } }, current).ok === false)
  line('改元控制清单是否被拒', staticGate({ ...proposal, target: { kind: 'config', path: 'meta/list' } }, current).ok === false)
  line('基线过期是否被拒', staticGate({ ...proposal, originVersion: 'v0' }, current).ok === false)
  line('差异冲突是否被拒', staticGate({ ...proposal, diff: { before: '不存在的一段', after: 'x' } }, current).ok === false)
  line('元控制对象数', META_CONTROLLED.length)
  rows.push('')

  rows.push('[3] 评估')
  const baselineA = [0.70, 0.72, 0.71, 0.73, 0.70, 0.72]
  const baselineB = [0.69, 0.70, 0.69, 0.71, 0.68, 0.70]
  const candidate = [0.78, 0.80, 0.79, 0.81, 0.78, 0.80]
  const r = evaluate(baselineA, baselineB, candidate)
  line('基线噪声', r.noise.toFixed(3))
  line('候选改善', r.gain.toFixed(3))
  line('接受阈值（两倍噪声）', r.threshold.toFixed(3))
  line('是否接受', r.accepted)
  line('改善落在噪声内时是否接受', evaluate(baselineA, baselineB, [0.715, 0.72, 0.71, 0.715, 0.72, 0.71]).accepted)
  line('护栏退化时是否接受', evaluate(baselineA, baselineB, candidate, false).accepted)
  line('50 个任务对 1% 退化的发现概率', detectionProbability(0.01, 50).toFixed(3))
  line('200 个任务对 1% 退化的发现概率', detectionProbability(0.01, 200).toFixed(3))
  rows.push('')

  rows.push('[4] 版本与回滚')
  const store = new VersionStore(1)
  store.stage({ id: 'v1', base: null, changes: [], canRead: (s) => s >= 1 })
  store.atomicSwitch('v1')
  const v2 = release(store, proposal, 100)
  line('发布后的当前版本', store.current().id)
  line('版本包含的改动数', store.current().changes.length)
  line('发布事件是否被记录', store.events.some((e) => e.type === 'evolution/release'))
  store.stage({ id: 'v3', base: v2, changes: [], canRead: (s) => s === 2 })
  line('回滚到能读当前状态的版本', rollback(store, 'v1', 200))
  line('回滚事件是否被记录', store.events.some((e) => e.type === 'evolution/rollback'))
  let rollbackThrew = false
  try { rollback(store, 'v3', 300) } catch { rollbackThrew = true }
  line('回滚到读不了的版本是否抛错', rollbackThrew)
  line('回滚后当前版本', store.current().id)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
