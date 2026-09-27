/**
 * 运行器：把一个用例集跑 N 次，统计成功率与失败分类。
 *
 * ★ 为什么必须跑 N 次：并发、进程、恢复这些功能的失败是【偶发】的。
 *   单次通过不能说明任何事——6.5840 的建议是跑几百次，
 *   Columbia 的同类课程是每个测试跑 50 次。
 *   本框架默认 20 次（开发时的默认值，可调）。
 */

/**
 * 跑一个用例集。
 *
 * @param {object} suite 用例集定义
 * @param {string} suite.name 名称
 * @param {Array} suite.cases 用例数组，每个 { name, task, check }
 * @param {Function} suite.harness 被测对象（暴露 run(task, options)）
 * @param {Function} [suite.makeOptions] 每次运行前生成注入选项 (i) => options
 * @param {object} opts
 * @param {number} [opts.runs] 每个用例跑几次（默认 20）
 * @returns {Promise<object>} 报告数据
 */
export async function runSuite(suite, opts = {}) {
  const runs = opts.runs ?? 20
  const results = []

  for (const c of suite.cases) {
    results.push(await runCase(c, suite, runs))
  }

  return { suite: suite.name, runs, results, at: Date.now() }
}

/**
 * 跑单个用例 N 次。
 * @param {object} c 用例
 * @param {object} suite 用例集
 * @param {number} runs 次数
 * @returns {Promise<object>} 该用例的统计
 */
async function runCase(c, suite, runs) {
  let pass = 0
  const failures = []

  for (let i = 0; i < runs; i++) {
    try {
      // ★ 每次运行都重新生成注入选项——同一个种子序列会被推进，
      //   所以 N 次运行会遇到不同的故障组合（而不是每次都一样的故障）。
      const options = suite.makeOptions ? suite.makeOptions(i) : {}
      const trace = await suite.harness.run(c.task, options)
      // ★ 把 options 传给断言：断言必须知道"这次注入了什么"，
      //   否则它无法判断 harness 有没有【正确处理】注入的故障。
      //   （这是自测抓出的问题——一个不处理截断的实现不会在轨迹里
      //     留下任何痕迹，只检查轨迹的断言会误判为通过。）
      const check = await c.check(trace, { options, run: i })
      if (check.ok) pass++
      else failures.push({ run: i, reason: check.reason ?? '断言失败' })
    } catch (e) {
      failures.push({ run: i, reason: `抛出异常：${e.message}` })
    }
  }

  return {
    case: c.name,
    runs,
    pass,
    rate: pass / runs,
    // ★ 按原因归类——这是"修根因而不是逐个修"的基础（题库 Q2.4.2）
    reasons: summarize(failures),
    // 只留前几条供复现（完整列表没有阅读价值）
    samples: failures.slice(0, 3),
  }
}

/**
 * 把失败按原因归类。
 * @param {Array<{run: number, reason: string}>} failures 失败列表
 * @returns {Array<{reason: string, count: number, firstRun: number}>} 归类结果
 */
function summarize(failures) {
  const map = new Map()
  for (const f of failures) {
    const key = normalize(f.reason)
    const cur = map.get(key)
    if (cur) cur.count++
    else map.set(key, { reason: key, count: 1, firstRun: f.run })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/**
 * 把失败原因归一化，便于归类。
 * ★ 去掉数字与具体路径——它们会让"同一类失败"被拆成很多类。
 * @param {string} reason 原始原因
 * @returns {string} 归一化后的原因
 */
function normalize(reason) {
  return String(reason)
    .replace(/\/[\w./-]+/g, '<path>')
    .replace(/\b\d+\b/g, '<n>')
    .trim()
}
