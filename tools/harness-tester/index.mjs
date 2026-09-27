/**
 * harness-tester 的对外接口。
 *
 * 用法（一个用例集的骨架）：
 *
 *   import { runSuite, asserts, faultyProvider, faultyTools, scoreReport, renderReport } from './index.mjs'
 *
 *   const suite = {
 *     name: '工具循环',
 *     harness: myHarness,                    // { run(task, options) }
 *     makeOptions: (i) => ({                 // 每次运行注入不同的故障
 *       provider: faultyProvider(realProvider, { seed: 1000 + i, timeoutRate: 0.1 }),
 *       tools: faultyTools(realTools, { seed: 2000 + i, failRate: 0.1 }),
 *     }),
 *     cases: [
 *       { name: '工具被调用', task: '...', check: asserts.toolCalled('read') },
 *     ],
 *   }
 *
 *   const report = await runSuite(suite, { runs: 20 })
 *   console.log(renderReport(scoreReport(report)))
 */

export { makeRandom, faultyProvider, faultyTools, killAfter } from './faults.mjs'
export { runSuite } from './runner.mjs'
export { asserts } from './assertions.mjs'
export { scoreReport, renderReport, reproduceHint } from './report.mjs'
