/**
 * 报告与算分。
 *
 * ★ 核心设计：扣分是【乘性】的，不是线性。
 *   成功率 90% 不是 90 分而是 81 分——因为一个偶发失败在生产环境里就是事故。
 *   这与 6.5840 的立场一致：鲁棒性优于单次正确。
 */

/**
 * 把运行报告算成分数。
 *
 * @param {object} report runSuite 的返回
 * @param {object} [opts]
 * @param {number} [opts.alpha] 惩罚指数（默认 2）
 * @param {number} [opts.baseScore] 每个用例的基础分（默认 100）
 * @returns {object} 含总分与逐用例得分
 */
export function scoreReport(report, opts = {}) {
  const alpha = opts.alpha ?? 2
  const defaultBase = opts.baseScore ?? 100

  const cases = report.results.map((r) => {
    // ★ 支持逐用例权重：契约里的不同条款重要性不同
    //   （如"满仓时失败"比"remove 幂等"重要得多）。
    const base = r.weight ?? defaultBase
    const factor = Math.pow(r.rate, alpha)
    return {
      case: r.case,
      rate: r.rate,
      factor: Number(factor.toFixed(4)),
      score: Number((base * factor).toFixed(2)),
      full: base,
      reasons: r.reasons,
    }
  })

  const earned = cases.reduce((s, c) => s + c.score, 0)
  const total = cases.reduce((s, c) => s + c.full, 0)

  return {
    suite: report.suite,
    runs: report.runs,
    alpha,
    cases,
    earned: Number(earned.toFixed(2)),
    total,
    percentage: total === 0 ? 0 : Number(((earned / total) * 100).toFixed(1)),
  }
}

/**
 * 把分数渲染成可读的文本报告。
 *
 * @param {object} scored scoreReport 的返回
 * @param {object} [opts]
 * @param {boolean} [opts.verbose] 是否输出失败原因
 * @returns {string} 报告文本
 */
export function renderReport(scored, opts = {}) {
  const lines = []
  const bar = (r) => {
    const n = Math.round(r * 20)
    return '█'.repeat(n) + '░'.repeat(20 - n)
  }

  lines.push('')
  lines.push(`══ 测试报告 · ${scored.suite} ══`)
  lines.push(`每用例 ${scored.runs} 次运行；惩罚指数 α=${scored.alpha}（乘性扣分）`)
  lines.push('')

  for (const c of scored.cases) {
    const mark = c.rate === 1 ? '✅' : c.rate >= 0.9 ? '🟡' : '❌'
    lines.push(`${mark} ${c.case}`)
    lines.push(`   ${bar(c.rate)}  ${c.score.toFixed(1)}/${c.full}  （成功率 ${(c.rate * 100).toFixed(0)}%，扣分因子 ${c.factor}）`)
    if (opts.verbose !== false && c.reasons.length > 0) {
      for (const r of c.reasons) lines.push(`     · ${r.count}/${scored.runs} 次：${r.reason}`)
    }
  }

  lines.push('')
  lines.push(`总分：${scored.earned} / ${scored.total}  （${scored.percentage}%）`)
  lines.push('')
  lines.push(verdict(scored.percentage))
  lines.push('')
  return lines.join('\n')
}

/**
 * 给出结论性的判断。
 * @param {number} pct 百分比
 * @returns {string} 判断文本
 */
function verdict(pct) {
  if (pct >= 95) return '优秀——行为稳定，可以认为这一项已经做好。'
  if (pct >= 80) return '良好——有偶发失败。★ 偶发失败不应当被忽略：它在生产环境里就是事故。'
  if (pct >= 50) return '不合格——失败率过高。先看失败原因的分类，修根因而不是逐个修。'
  return '远未完成——请先确认基本路径是否跑通。'
}

/**
 * 给出"复现命令"——把失败还原成一条可以重跑的命令。
 *
 * ★ 这是本框架对"可复现"的落实：报告不只要能看，还要能重跑。
 *
 * @param {object} report runSuite 的返回
 * @param {object} [opts]
 * @param {number} [opts.seed] 使用的种子
 * @returns {string} 可复现的说明
 */
export function reproduceHint(report, opts = {}) {
  const failed = report.results.filter((r) => r.rate < 1)
  if (failed.length === 0) return '全部用例通过——无需复现。'

  const lines = ['要复现这些失败，用同样的种子重跑：', '']
  for (const r of failed) {
    lines.push(`  node runner.mjs --suite <suite> --runs ${report.runs} --seed ${opts.seed ?? 42} --case "${r.case}"`)
  }
  lines.push('')
  lines.push('（若重跑不复现，说明失败依赖了非确定性因素——那本身就是需要修的问题。）')
  return lines.join('\n')
}
