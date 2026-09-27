/**
 * 故障注入。
 *
 * ★ 设计原则一：所有随机都走同一个【可复现】的 PRNG。
 *   否则失败无法复现，而"无法复现的失败"对学习毫无价值。
 *
 * ★ 设计原则二：注入的故障必须对应【真实的失败模式】，
 *   而不是随机构造的错误。每一条都标注了它模拟什么（见 README 的三）。
 */

/**
 * 伪随机数生成器（splitmix32 的计数器模式）。
 *
 * ★ 实测教训（两条，都值得记住）：
 *
 *   教训一：最初用线性同余 + 相邻种子（1000、1001、…），
 *     结果 30 次运行一次都没触发故障——因为 LCG 的第一个输出对相邻种子
 *     几乎相同（2678429223 → 2680093748，比值只差 0.0004）。
 *
 *   教训二：改成"每次调用重新哈希状态"之后，故障触发了，
 *     但【注入率远高于设定值】——实测约 20% 的运行连续 5 次失败，
 *     而按设定值应当只有 0.24%。原因是那种写法会让状态收敛，
 *     产生大量偏小的值。
 *     修法是回到 splitmix32 的标准计数器模式：每次先把状态推进一个常数，
 *     再做混合。这个模式下输出的分布才是均匀的。
 *
 *   这两个 bug 都是【框架自测】抓出来的——而它们的后果都是
 *   "让正确的实现看起来失败"或"让错误的实现看起来通过"。
 *   这正是 6.5840 那条教训的具体形态。
 *
 * @param {number} seed 种子——同一个种子必须产生同一串序列
 * @returns {() => number} 返回 [0, 1) 的随机数
 */
export function makeRandom(seed = 42) {
  let z = ((seed >>> 0) || 1) | 0
  return () => {
    z = (z + 0x9e3779b9) | 0
    let t = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97)
    return ((t ^ (t >>> 15)) >>> 0) / 0x100000000
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 包装一个 provider，按 policy 注入故障。
 *
 * 注入的四类故障与它们模拟的真实情况：
 *   · timeout   —— 网络抖动 / 服务过载        → 检验超时处理与取消传播
 *   · rateLimit —— API 限流                   → 检验退避重试
 *   · malformed —— ★ 输出被长度上限截断        → 检验【停止原因分支】
 *   · （无故障）  —— 正常路径
 *
 * @param {{ name: string, chat: Function }} base 原始 provider
 * @param {object} policy 故障策略
 * @returns {object} 包装后的 provider（额外暴露 calls 计数）
 */
export function faultyProvider(base, policy = {}) {
  const rand = makeRandom(policy.seed ?? 1)
  const timeoutRate = policy.timeoutRate ?? 0
  const rateLimitRate = policy.rateLimitRate ?? 0
  const malformedRate = policy.malformedRate ?? 0
  const timeoutMs = policy.timeoutMs ?? 30
  let calls = 0
  /**
   * ★ 记录【实际注入过】的故障。
   *
   * 为什么必须记录：断言要知道"这次运行注入了什么"才能判断
   * "harness 有没有正确处理它"。否则断言只能看到轨迹，
   * 而一个【没有处理截断】的实现根本不会在轨迹里留下痕迹——
   * 断言就会误判为通过。（这是自测抓出的第二个问题。）
   *
   * @type {string[]}
   */
  const injected = []

  return {
    name: `faulty(${base.name})`,
    get calls() {
      return calls
    },
    injected,
    async chat(messages, options) {
      calls++
      const r = rand()

      if (r < timeoutRate) {
        injected.push('timeout')
        // ★ 真的等一下——让调用方的超时逻辑被触发
        await sleep(timeoutMs * 10)
        const err = new Error('ETIMEDOUT: simulated model timeout')
        err.code = 'ETIMEDOUT'
        err.retryable = true
        throw err
      }
      if (r < timeoutRate + rateLimitRate) {
        injected.push('rateLimit')
        const err = new Error('429 Too Many Requests')
        err.status = 429
        err.retryable = true
        throw err
      }
      if (r < timeoutRate + rateLimitRate + malformedRate) {
        injected.push('malformed')
        // ★ 模拟"输出被截断"：把内容砍掉一半，并标记 truncated。
        //   这正是题库 Q2.1.1 的 ② 里说的那种失败——参数只写了一半。
        const res = await base.chat(messages, options)
        const text = String(res.content ?? '')
        return { ...res, content: text.slice(0, Math.max(1, Math.floor(text.length / 2))), truncated: true }
      }
      return base.chat(messages, options)
    },
  }
}

/**
 * 包装一组工具，按 policy 注入故障。
 *
 * 注入的两类故障：
 *   · fail      —— 工具级错误（环境问题）    → 检验【错误分类】（题库 Q2.1.2）
 *   · oversized —— 返回超大结果              → 检验截断与溢出落盘
 *
 * @param {Record<string, Function>} tools 原始工具表
 * @param {object} policy 故障策略
 * @returns {Record<string, Function>} 包装后的工具表
 */
export function faultyTools(tools, policy = {}) {
  const rand = makeRandom(policy.seed ?? 2)
  const failRate = policy.failRate ?? 0
  const oversizedRate = policy.oversizedRate ?? 0
  const oversizedBytes = policy.oversizedBytes ?? 2 * 1024 * 1024
  const failOn = policy.failOn ?? null

  const out = {}
  for (const [name, fn] of Object.entries(tools)) {
    out[name] = async (args, ctx) => {
      const r = rand()
      if ((failOn === null || failOn === name) && r < failRate) {
        // ★ 工具级错误：请求是合法的，是环境的问题
        return { isError: true, content: `工具级错误：${name} 执行失败（注入）` }
      }
      if (r < failRate + oversizedRate) {
        return { isError: false, content: 'x'.repeat(oversizedBytes) }
      }
      return fn(args, ctx)
    }
  }
  return out
}

/**
 * 进程级故障：在 harness 跑到一半时把它"杀掉"。
 *
 * ★ 它模拟的是真实场景：主进程崩溃、被 Ctrl-C、或 OOM 被杀。
 *   这是验证"恢复"与"无孤儿"的唯一方式——见题库 20-durability 的验收判据。
 *
 * @param {number} afterMs 多久之后触发
 * @param {() => void} onKill 触发时执行（通常是把 harness 的 signal abort）
 * @returns {() => void} 取消函数
 */
export function killAfter(afterMs, onKill) {
  const t = setTimeout(onKill, afterMs)
  return () => clearTimeout(t)
}
