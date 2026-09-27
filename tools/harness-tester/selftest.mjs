/**
 * 框架自测。
 *
 * ★ 为什么框架需要自测：6.5840 有已知教训——一道考题就描述了
 *   "一个有 bug 的测试会让正确的实现看起来失败"。
 *   【评分框架的正确性是它可信的前提】。
 *
 * 自测的做法：用两个 mock harness——一个正确、一个有 bug——
 * 验证框架能【区分】它们，并且失败原因的分类是准的。
 *
 * 运行：node selftest.mjs
 */

import { faultyProvider, faultyTools, makeRandom } from './faults.mjs'
import { runSuite } from './runner.mjs'
import { asserts } from './assertions.mjs'
import { scoreReport, renderReport } from './report.mjs'

// ───────────────────────────────────── 两个被测的 mock harness

/**
 * 正确的 harness：会重试、会检查截断、会把工具错误标为已处理。
 * @param {string} task 任务
 * @param {object} options 注入选项
 * @returns {Promise<object>} 轨迹
 */
async function goodRun(task, options = {}) {
  const provider = options.provider
  const tools = options.tools ?? {}
  const toolCalls = []
  const events = []
  let finalMessage = ''

  // ★ 重试 + 截断检查
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await provider.chat([{ role: 'user', content: task }])
      if (res.truncated) {
        events.push({ type: 'llm/truncated' }) // ★ 截断不当作正常结果
        continue
      }
      finalMessage = res.content
      events.push({ type: 'llm/response', content: res.content })
      break
    } catch (e) {
      events.push({ type: 'llm/error', retryable: !!e.retryable })
      if (!e.retryable) throw e
      await sleep(1)
    }
  }

  // 调工具
  if (tools.echo) {
    const r = await tools.echo({ text: task })
    toolCalls.push({
      name: 'echo',
      args: { text: task },
      result: r,
      sideEffect: 'read',
      error: r.isError ? r.content : undefined,
      handled: true, // ★ 错误被处理
    })
    events.push({ type: 'tool/call', name: 'echo', isError: !!r.isError })
  }

  return { toolCalls, finalMessage, events, rederived: finalMessage }
}

/**
 * 有 bug 的 harness：不重试、把截断当正常结果、把工具错误当成功、不记事件。
 * @param {string} task 任务
 * @param {object} options 注入选项
 * @returns {Promise<object>} 轨迹
 */
async function buggyRun(task, options = {}) {
  const provider = options.provider
  const tools = options.tools ?? {}
  const toolCalls = []
  let finalMessage = ''

  // ✗ 没有重试：一次失败就抛
  const res = await provider.chat([{ role: 'user', content: task }])
  // ✗ 没有检查 truncated
  finalMessage = res.content

  if (tools.echo) {
    const r = await tools.echo({ text: task })
    toolCalls.push({
      name: 'echo',
      args: { text: task },
      result: r,
      sideEffect: 'read',
      // ✗ 工具错误没有被标记
    })
  }

  // ✗ 没有记录事件，也没有提供 rederived
  return { toolCalls, finalMessage, events: [] }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ───────────────────────────────────── 用例集

const TASK = '把这句话回显给我'

/**
 * 构造一个用例集。
 * @param {Function} runFn 被测的 run 函数
 * @returns {object} 用例集
 */
function makeSuite(runFn) {
  return {
    name: '框架自测',
    harness: { run: runFn },
    // ★ 每次运行都推进种子——这样 N 次会遇到不同的故障组合
    makeOptions: (i) => ({
      provider: faultyProvider(
        {
          name: 'mock',
          async chat() {
            return { content: `已处理：${TASK}`, usage: { promptTokens: 10, completionTokens: 5 } }
          },
        },
        { seed: 1000 + i, timeoutRate: 0.15, rateLimitRate: 0.15, malformedRate: 0.15, timeoutMs: 2 },
      ),
      tools: faultyTools(
        {
          async echo(args) {
            return { isError: false, content: `echo: ${args.text}` }
          },
        },
        { seed: 2000 + i, failRate: 0.2 },
      ),
    }),
    cases: [
      {
        name: '任务完成且工具被调用',
        task: TASK,
        check: asserts.all(asserts.toolCalled('echo'), asserts.finalContains('已处理')),
      },
      {
        name: '识别并处理截断',
        task: TASK,
        check: asserts.truncatedHandled(),
      },
      {
        name: '工具错误被处理',
        task: TASK,
        check: asserts.noUnhandledToolError(),
      },
      {
        name: '事件可重建',
        task: TASK,
        check: asserts.eventsReconstructable(),
      },
    ],
  }
}

// ───────────────────────────────────── 跑自测

const RUNS = 30

console.log('══ 框架自测：验证它能区分「正确」与「有 bug」 ══')
console.log(`每个用例跑 ${RUNS} 次；故障注入率：超时 15%、限流 15%、截断 15%、工具失败 20%`)
console.log('')

const goodReport = await runSuite(makeSuite(goodRun), { runs: RUNS })
const goodScore = scoreReport(goodReport)

const buggyReport = await runSuite(makeSuite(buggyRun), { runs: RUNS })
const buggyScore = scoreReport(buggyReport)

console.log(renderReport(goodScore, { verbose: true }))
console.log(renderReport(buggyScore, { verbose: true }))

// ───────────────────────────────────── 自测的断言

const checks = []
const ck = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail })

ck('正确的 harness 应当得高分（≥90%）', goodScore.percentage >= 90, `实际 ${goodScore.percentage}%`)
ck('有 bug 的 harness 应当得低分（≤60%）', buggyScore.percentage <= 60, `实际 ${buggyScore.percentage}%`)
ck('两者的分差应当显著（≥40 个百分点）', goodScore.percentage - buggyScore.percentage >= 40,
  `实际差 ${(goodScore.percentage - buggyScore.percentage).toFixed(1)}`)

// ★ 关键：框架分类失败原因的能力——它必须能指出"截断没被检查"
const buggyTruncated = buggyScore.cases.find((c) => c.case === '识别并处理截断')
ck('框架能识别「截断没有被检查」', buggyTruncated && buggyTruncated.rate < 1,
  `该用例成功率 ${((buggyTruncated?.rate ?? 0) * 100).toFixed(0)}%`)

// ★ 注入率必须接近设定值——否则框架会让【正确的实现看起来失败】
//   （这是自测抓出的第三个问题的直接检查）
const probe = faultyProvider(
  { name: 'probe', async chat() { return { content: 'ok' } } },
  { seed: 7, timeoutRate: 0.2, rateLimitRate: 0.2, malformedRate: 0.2, timeoutMs: 0 },
)
let threw = 0
const PROBE = 2000
for (let i = 0; i < PROBE; i++) {
  try {
    await probe.chat([])
  } catch {
    threw++
  }
}
const throwRate = threw / PROBE
ck('注入率接近设定值（0.40 ± 0.05）', Math.abs(throwRate - 0.4) < 0.05,
  `实测 ${(throwRate * 100).toFixed(1)}%，设定 40%`)

const buggyReconstruct = buggyScore.cases.find((c) => c.case === '事件可重建')
ck('框架能识别「事件不可重建」', buggyReconstruct.rate === 0,
  `该用例成功率 ${(buggyReconstruct.rate * 100).toFixed(0)}%`)

console.log('══ 自测结果 ══')
console.log('')
let pass = 0
for (const c of checks) {
  console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? `  （${c.detail}）` : ''}`)
  if (c.ok) pass++
}
console.log('')
console.log(`${pass}/${checks.length} 条自测通过`)
console.log('')

if (pass !== checks.length) {
  console.log('★ 自测未通过——说明【框架本身】有问题，而不是被测对象的问题。')
  console.log('  6.5840 的教训：一个有 bug 的测试会让正确的实现看起来失败。')
  process.exit(1)
}
console.log('框架自测通过：它能区分正确的实现与有 bug 的实现，且失败分类准确。')
process.exit(0)
