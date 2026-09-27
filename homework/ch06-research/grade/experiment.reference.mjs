// Part D 的参考实现。

import { sampleSize } from './stats.reference.mjs'

/** 实验设计：样本量、重复、种子与成本估算。 */
export function planExperiment(spec) {
  const runs = spec.runs ?? 3
  const { tasks } = sampleSize({ baselineRate: spec.baselineRate, targetDelta: spec.targetDelta })
  const totalRuns = tasks * runs
  return {
    tasks,
    runs,
    totalRuns,
    costEstimate: totalRuns * spec.costPerTask,
    seeds: Array.from({ length: runs }, (_, i) => i + 1),
  }
}

/** 消融设计：中性替代 + 完整性核对项。 */
export function planAblation(component) {
  if (!component?.neutral) throw new Error('消融必须给出中性替代（不是删掉组件）')
  return {
    component: component.name,
    neutral: component.neutral,
    integrity: [
      '其余组件的配置与消融前逐字段相同',
      '任务集与随机种子与消融前一致',
      '模型与环境版本与消融前一致',
    ],
    steps: [
      `改前：用原实现跑三次并记录响应`,
      `改后：把「${component.name}」替换为「${component.neutral}」再跑三次`,
      '核对完整性清单（其余因素未变）',
      '用 compare 给出差异、区间与效应量',
    ],
  }
}

/** 构造报告（六项必填）。 */
export function buildReport(record, result, conclusion) {
  if (conclusion?.detected === false && !conclusion?.resolution) {
    throw new Error('未检出差异时必须给出分辨率（否则读者无法判断是「确实无效」还是「测不出来」）')
  }
  return {
    problem: result?.problem ?? '见实验设计',
    bench: record.bench,
    runs: {
      bench: record.bench,
      code: record.code,
      seeds: record.seeds,
      env: record.env,
    },
    results: result?.summary ?? {},
    conclusion: { ...conclusion },
    limits: result?.limits?.length ? result.limits : ['本次实验只覆盖了一个基准与一组参数'],
  }
}

/** 可复现性检查（四项记录）。 */
export function isReproducible(record) {
  const missing = []
  const need = [
    ['bench.name', record?.bench?.name],
    ['bench.version', record?.bench?.version],
    ['bench.checksum', record?.bench?.checksum],
    ['code.commit', record?.code?.commit],
    ['code.config', record?.code?.config],
    ['code.profile', record?.code?.profile],
    ['env.deps', record?.env?.deps],
    ['env.model', record?.env?.model],
    ['env.external', record?.env?.external],
  ]
  for (const [path, value] of need) {
    if (value === undefined || value === null || (typeof value === 'object' && value !== null && Array.isArray(value) && value.length === 0)) {
      missing.push(path)
    }
  }
  if (!Array.isArray(record?.seeds) || record.seeds.length === 0) missing.push('seeds')
  missing.sort()
  return { ok: missing.length === 0, missing }
}
