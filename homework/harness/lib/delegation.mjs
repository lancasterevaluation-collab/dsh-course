// Part F 的参考实现。

/** 派发协议：四要素校验 + 深度与默认预算。 */
export function buildDelegation(parent, spec) {
  if (!spec?.goal) throw new Error('派发缺少目标')
  if (!spec?.context) throw new Error('派发缺少上下文子集')
  if (!Array.isArray(spec?.constraints) || spec.constraints.length === 0) throw new Error('派发缺少约束')
  if (!spec?.outputFormat) throw new Error('派发缺少产出格式')
  if (!Array.isArray(spec.context.notGive) || spec.context.notGive.length === 0) {
    throw new Error('上下文子集必须说明不给什么')
  }
  if (!(spec.outputFormat.maxChars > 0)) throw new Error('产出格式必须给出容量（maxChars）')

  return {
    id: 'd-1',
    parentSession: parent.id,
    parentTask: parent.goal,
    depth: (parent.depth ?? 0) + 1,
    budget: spec.budget ?? { maxTokens: 50000, maxToolCalls: 30 },
    ...spec,
  }
}

/** 三条限制：深度 → 子任务数 → 全局并发。 */
export function admitDelegation(parent, ctx) {
  if ((parent.depth ?? 0) + 1 > ctx.maxDepth) {
    return { ok: false, reason: `派发深度已达上限 ${ctx.maxDepth}` }
  }
  if (ctx.runningChildrenOf(parent.id) >= ctx.maxChildrenPerSession) {
    return { ok: false, reason: '该会话的子任务数已达上限' }
  }
  if (ctx.globalRunning >= ctx.globalMaxConcurrent) {
    return { ok: false, reason: '全局并发已满' }
  }
  return { ok: true }
}

/** 回收：格式校验 + 容量裁剪 + 追溯元数据。 */
export function collectResult(child, format, ctx) {
  const meta = { childId: child.id, tokens: child.tokens ?? 0, turns: child.turns ?? 0 }
  if (format.kind === 'text') {
    if (typeof child.result !== 'string') {
      return { ok: false, retryable: true, reason: '产出不符合格式：期望文本' }
    }
    if (child.result.length > format.maxChars) {
      return { ok: true, content: child.result.slice(0, format.maxChars), truncated: true, meta }
    }
    return { ok: true, content: child.result, truncated: false, meta }
  }
  if (format.kind === 'list') {
    if (!Array.isArray(child.result)) {
      return { ok: false, retryable: true, reason: '产出不符合格式：期望列表' }
    }
    return { ok: true, content: child.result, truncated: false, meta }
  }
  return { ok: false, retryable: true, reason: `产出不符合格式：不认识的类型 ${format.kind}` }
}

const MAP = {
  ECONNREFUSED: 'retryable',
  ECONNRESET: 'retryable',
  timeout: 'retryable',
  ETIMEDOUT: 'retryable',
  ENOENT: 'fatal',
  InvalidRequest: 'fatal',
  EPROTO: 'fatal',
}

/** 外部错误归一化（未识别的视为 fatal 且需人介入）。 */
export function normalizeExternalError(err, server) {
  const code = String(err?.code ?? 'unknown')
  const kind = MAP[code]
  if (!kind) {
    return { kind: 'fatal', message: `${server}: 未识别的外部错误（${code}）`, needsHuman: true }
  }
  return { kind, message: `${server}: ${code}`, needsHuman: false }
}
