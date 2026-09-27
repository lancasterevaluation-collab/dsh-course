/**
 * 断言库。
 *
 * ★ 设计原则：断言判的是【行为与不变量】，不是"答案对不对"。
 *   这是 "tester is the grader" 的核心——它让评分无法被"理解"绕过。
 *
 * 每个断言返回 { ok: boolean, reason?: string }。
 */

const ok = () => ({ ok: true })
const bad = (reason) => ({ ok: false, reason })

/**
 * 从轨迹里取出工具调用名序列。
 * @param {object} trace 轨迹
 * @returns {string[]} 工具名序列
 */
function names(trace) {
  return (trace?.toolCalls ?? []).map((c) => c.name)
}

export const asserts = {
  /**
   * 调用了某个工具。
   * @param {string} name 工具名
   * @returns {(trace: object) => { ok: boolean, reason?: string }}
   */
  toolCalled(name) {
    return (trace) => (names(trace).includes(name) ? ok() : bad(`没有调用工具 ${name}（实际调用了 ${names(trace).join(', ') || '无'}）`))
  },

  /**
   * 工具调用包含指定的子序列。
   * ★ 用子序列而不是全等——因为允许中间有其他合法调用。
   * @param {string[]} expected 期望的子序列
   * @returns {(trace: object) => { ok: boolean, reason?: string }}
   */
  toolOrder(expected) {
    return (trace) => {
      const actual = names(trace)
      let i = 0
      for (const n of actual) if (i < expected.length && n === expected[i]) i++
      return i === expected.length ? ok() : bad(`工具顺序不满足：期望包含 [${expected.join(' → ')}]，实际 [${actual.join(' → ')}]`)
    }
  },

  /**
   * 没有工具级错误被漏处理。
   * @returns {(trace: object) => { ok: boolean, reason?: string }}
   */
  noUnhandledToolError() {
    return (trace) => {
      const bad_ = (trace?.toolCalls ?? []).filter((c) => c.error && !c.handled)
      return bad_.length === 0 ? ok() : bad(`${bad_.length} 处工具错误没有被处理：${bad_[0].name}`)
    }
  },

  /**
   * 工具调用总次数不超过上限。
   * ★ 它抓的是"重试爆炸"——一个不会退避的实现可能调用几十次。
   * @param {number} n 上限
   * @returns {(trace: object) => { ok: boolean, reason?: string }}
   */
  maxToolCalls(n) {
    return (trace) => {
      const c = (trace?.toolCalls ?? []).length
      return c <= n ? ok() : bad(`工具调用 ${c} 次，超过上限 ${n}（可能是重试没有退避）`)
    }
  },

  /**
   * 最终消息包含指定文本。
   * @param {string} needle 要包含的文本
   * @returns {(trace: object) => { ok: boolean, reason?: string }}
   */
  finalContains(needle) {
    return (trace) => (String(trace?.finalMessage ?? '').includes(needle) ? ok() : bad(`最终消息不包含「${needle}」`))
  },

  /**
   * ★ 不变量：模型可见的内容必须能从事件日志重建。
   *
   * 这条对应题库反复强调的那条设计立场（"只有一个真相源"）。
   * 一个把派生结果直接拼进上下文、却没有写事件的实现会在这里失败。
   *
   * @returns {(trace: object) => { ok: boolean, reason?: string }}
   */
  eventsReconstructable() {
    return (trace) => {
      if (!Array.isArray(trace?.events)) return bad('轨迹里没有 events —— 无法检查可重建性')
      const derived = trace.rederived
      if (typeof derived !== 'string') return bad('harness 没有提供 rederived（从 events 重新派生的结果）')
      return derived === String(trace.finalMessage ?? '')
        ? ok()
        : bad('从事件重建的结果与实际输出不一致——"模型可见 ⇔ 日志可重建"被破坏')
    }
  },

  /**
   * ★ 不变量：同一个副作用没有发生两次（幂等）。
   * @param {string} [toolName] 只检查这个工具；省略则检查全部
   * @returns {(trace: object) => { ok: boolean, reason?: string }}
   */
  noDuplicateSideEffect(toolName) {
    return (trace) => {
      const calls = (trace?.toolCalls ?? []).filter((c) => !toolName || c.name === toolName)
      const seen = new Map()
      for (const c of calls) {
        const key = JSON.stringify(c.args ?? {})
        const n = (seen.get(key) ?? 0) + 1
        seen.set(key, n)
        // 允许"读"类工具重复；"写"类工具重复即为不幂等
        if (n > 1 && c.sideEffect && c.sideEffect !== 'read') {
          return bad(`副作用重复：${c.name} 用相同参数被调用了 ${n} 次（不幂等）`)
        }
      }
      return ok()
    }
  },

  /**
   * ★ 截断被正确处理。
   *
   * 判据：**如果这次运行注入了截断，那么轨迹里必须有"识别到截断"的痕迹**。
   *
   * 为什么必须从 ctx 读注入信息（这是自测抓出的问题）：
   *   **一个没有处理截断的实现，根本不会在轨迹里留下痕迹**——
   *   如果断言只看轨迹，就会把"什么都没做"误判为"通过"。
   *   断言必须知道"这次应该发生什么"，才能判断"有没有发生"。
   *
   * @returns {(trace: object, ctx: object) => { ok: boolean, reason?: string }}
   */
  truncatedHandled() {
    return (trace, ctx) => {
      const injected = ctx?.options?.provider?.injected ?? []
      if (!injected.includes('malformed')) return ok() // 这次没注入截断 → 不适用

      const recognized = (trace?.events ?? []).some((e) => e.type === 'llm/truncated')
      return recognized
        ? ok()
        : bad('注入了截断，但轨迹里没有识别截断的记录（缺少停止原因分支处理）')
    }
  },

  /**
   * 把多个断言组合起来（全部通过才算通过）。
   * @param {...Function} checks 断言函数
   * @returns {(trace: object) => { ok: boolean, reason?: string }}
   */
  all(...checks) {
    return (trace) => {
      for (const c of checks) {
        const r = c(trace)
        if (!r.ok) return r
      }
      return ok()
    }
  },
}
