/**
 * 示例用例集：工具调用循环。
 *
 * 它演示"构建型作业"的判分形态——学生的 harness 要实现：
 *   · 重试（遇到可重试错误时退避重试）
 *   · 停止原因分支（识别被截断的输出，不把它当正常结果）
 *   · 错误分类（区分请求错误与执行错误）
 *   · 日志可重建（模型可见的内容必须能从事件重建）
 *
 * 运行：node examples/example-tool-loop.mjs
 */

import { runSuite, asserts, faultyProvider, faultyTools, scoreReport, renderReport } from '../index.mjs'

const TASK = '读一下 README 并告诉我它有行'

/** 被注入的工具表——框架会在这里注入失败与超大结果。 */
const baseTools = {
  async read(args) {
    return { isError: false, content: 'README\n第 1 行\n第 2 行' }
  },
}

/**
 * 学生要实现的对象。
 *
 * ★ 这里的实现是【正确】的版本——它演示了四条要求怎么满足。
 *   框架的自测里还有一个故意写错的版本，用来验证"框架能区分它们"。
 *
 * @param {string} task 任务
 * @param {object} options 注入选项
 * @returns {Promise<object>} 轨迹
 */
const goodHarness = {
  async run(task, options = {}) {
    const provider = options.provider
    const tools = options.tools ?? {}
    const toolCalls = []
    const events = []
    let finalMessage = ''

    // ① 重试：只对可重试错误退避
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await provider.chat([{ role: 'user', content: task }])
        // ② 停止原因分支：被截断的输出不是正常结果
        if (res.truncated) {
          events.push({ type: 'llm/truncated', attempt })
          continue
        }
        finalMessage = res.content
        events.push({ type: 'llm/response', content: res.content })
        break
      } catch (e) {
        events.push({ type: 'llm/error', retryable: !!e.retryable, message: e.message })
        if (!e.retryable) throw e // ③ 不可重试的错误直接抛
        await new Promise((r) => setTimeout(r, 2 ** attempt)) // 指数退避
      }
    }

    // 调工具
    const r = await tools.read({ path: 'README.md' })
    toolCalls.push({
      name: 'read',
      args: { path: 'README.md' },
      result: r,
      sideEffect: 'read',
      // ③ 错误分类：工具级错误被标记并处理
      error: r.isError ? r.content : undefined,
      handled: true,
    })
    events.push({ type: 'tool/call', name: 'read', isError: !!r.isError })

    // ④ 日志可重建：finalMessage 是事件的纯函数
    const rederived = events.filter((e) => e.type === 'llm/response').at(-1)?.content ?? ''
    return { toolCalls, finalMessage: rederived || finalMessage, events, rederived: rederived || finalMessage }
  },
}

const suite = {
  name: '示例 · 工具调用循环',
  harness: goodHarness,
  makeOptions: (i) => ({
    provider: faultyProvider(
      { name: 'mock', async chat() { return { content: 'README 有 2 行' } } },
      { seed: 1000 + i, timeoutRate: 0.12, rateLimitRate: 0.12, malformedRate: 0.12, timeoutMs: 2 },
    ),
    tools: faultyTools(baseTools, { seed: 2000 + i, failRate: 0.1, oversizedRate: 0.05 }),
  }),
  cases: [
    { name: '完成度：工具被调用且给出结论', task: TASK, check: asserts.all(asserts.toolCalled('read'), asserts.finalContains('行')) },
    { name: '停止原因：识别并处理截断', task: TASK, check: asserts.truncatedHandled() },
    { name: '错误分类：工具错误被处理', task: TASK, check: asserts.noUnhandledToolError() },
    { name: '不变量：事件可重建', task: TASK, check: asserts.eventsReconstructable() },
    { name: '约束：工具调用不爆炸', task: TASK, check: asserts.maxToolCalls(3) },
  ],
}

const report = await runSuite(suite, { runs: 30 })
const scored = scoreReport(report)
console.log(renderReport(scored, { verbose: true }))
