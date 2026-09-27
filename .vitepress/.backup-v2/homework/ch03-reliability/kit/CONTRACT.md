# 契约 · 大作业三

> 这份文件定义一个**接口契约**：你的实现要满足它，判分器按它检查。
> **不要修改这份文件。** 如果你认为契约本身有问题，把它写进 `writeup.md`（那会被算作有效观察）。
>
> 契约的写法遵循第 1.4 篇的规范：每个函数给出**前置条件**、**返回值**、以及**必须成立的不变量**。不变量是判分的依据。

---

## 通用约定

**模块格式**：ESM（`export`），文件后缀 `.mjs`。**不要引入任何第三方依赖**（只用 Node 内置模块）。

**错误处理**：只在契约明确要求时报错。**要求报错的地方用 `throw new Error(...)`，内容需包含契约里给出的关键词**（判分器用关键词匹配，不匹配具体措辞之外的细节）。

**纯函数**：除 `runShell` 之外的函数都必须是纯函数——**同样的输入必须得到同样的输出**，并且不得修改传入的参数（判分器会用冻结对象调用它们）。

**时间来源**：不得在函数内部调用 `Date.now()`。所有时间都从参数里取（可测试性的前提，与讲义 3.6 的"记录原始值"同源）。

---

## Part A · 重试与错误分类（答案 JSON）

### 形状

```jsonc
{
  "classification": [
    {
      "id": "e1",                                  // 与题目里的编号一致
      "answer": "retryable",                        // 四选一：retryable | fatal | needs-human | unknown
      "reason": "..."                               // 必填，非空；需提到依据
    }
    // ... 12 项
  ],
  "policies": [
    {
      "id": "p1",
      "answer": "...",                              // 该题的判断
      "reason": "..."                               // 必填，非空
    }
    // ... 3 项
  ],
  "counterexamples": [
    {
      "id": "c1",
      "answer": "...",                              // 一个具体场景
      "reason": "...",                              // 它为什么有害（含条件与后果）
      "conditions": ["..."]                         // 至少一项条件
    }
    // ... 2 项
  ]
}
```

### 不变量

1. `classification` 有 12 项，`id` 与题目一致且不重复。
2. 每项的 `answer` 属于四个取值之一（大小写敏感，全小写）。
3. 每项的 `reason` 非空，且包含下面三者之一的关键词（判分器做包含匹配）：`类型`、`状态`、`幂等`、`副作用`、`限流`、`超时`。
4. `policies` 有 3 项，`counterexamples` 有 2 项，`reason` 均非空。
5. `counterexamples` 的每一项有非空的 `conditions` 数组（**"泛泛而谈的反例"指的是没有条件的那种**）。

---

## Part B · 守卫与审批策略（答案 JSON）

### 形状

```jsonc
{
  "rules": [
    {
      "id": "op1",
      "risk": "high",                               // low | medium | high | critical
      "action": "ask",                              // allow | ask | deny
      "consequence": "..."                           // 面向人的后果描述
    }
    // ... 10 项
  ],
  "policies": [
    { "id": "bp1", "action": "...", "reason": "...", "granularity": "session" }
    // ... 3 项；granularity ∈ {once, session, project, forever}
  ]
}
```

### 不变量

1. `rules` 有 10 项，`id` 与题目一致。
2. `risk` 与 `action` 的对应规则：
   - `low` 可以是 `allow` 或 `ask`，**不得是 `deny`**；
   - `critical` 必须是 `ask` 或 `deny`，**不得是 `allow`**；
   - `high` 且不可逆时不得是 `allow`。
3. `consequence` 必须通过三条检查：**不含反引号**、**不含 `rm`/`mv`/`cp`/`chmod`/`curl` 这些命令名**、**包含"可恢复"或"不可恢复"之一**。
4. `policies` 有 3 项，`granularity` 属于四个取值之一，`reason` 非空。

**关于第 3 条**：它的目的是让"后果描述"真的是后果（"删除这个目录，不可恢复"）而不是命令的复述。**判分器用一个正则做这件事**，而它可能误伤合法的表述——如果你认为自己的表述合理而被判错，写进 `writeup.md`。

---

## Part C · `kit/src/context.mjs`

### `shouldCompact(state, policy)`

```
前置条件：policy.threshold ∈ (0, 1]
参数：state = { usedTokens: number, maxTokens: number }
      policy = { threshold: number }
返回：boolean
```

**不变量**
1. 当 `usedTokens / maxTokens > threshold` 时返回 `true`。
2. 当 `usedTokens / maxTokens === threshold` 时返回 `false`（**恰好等于不触发**）。
3. `usedTokens === 0` 时返回 `false`。
4. 不使用 `Date.now()`；不修改参数。

### `compactRange(events, policy)`

```
前置条件：events 是按 seq 升序的事件数组（可能为空）
参数：policy = { keepTail: number, minRange: number }
返回：{ from: number, to: number } | null
```

`from` 与 `to` 是**被压缩的区间边界**（含 `from`、不含 `to`，即半开区间），以 `seq` 表示。

**不变量**
1. 保留末尾 `keepTail` 条事件不被压缩：`to === events[events.length - keepTail].seq`（当 `events.length > keepTail`）。
2. 可压缩的条数少于 `minRange` 时返回 `null`。
3. `events.length <= keepTail` 时返回 `null`。
4. 空数组返回 `null`。
5. 返回的区间非空：`from < to`。

### `spill(content, budget)`

```
参数：content: string
      budget = { maxChars: number, headRatio: number }   // headRatio ∈ [0, 1]
返回：{ inline: string, pointer: string | null, spilled: string | null }
```

**不变量**
1. `content.length <= maxChars` 时：`inline === content`、`pointer === null`、`spilled === null`。
2. `content.length > maxChars` 时：`spilled === content`（**完整内容必须被保留**）、`pointer !== null`（**必须给出指针**）、且 `inline` 同时包含头部与尾部（头部长度约 `maxChars * headRatio`）。
3. `pointer` 一旦非空，必须是一个非空字符串（可读的标识，例如 `spill://<id>`）。
4. `inline.length <= maxChars`（**不得超预算**）。

### `applyCompaction(events, range, summary)`

```
参数：events: SessionEvent[]   // 含 type、seq、以及其他字段
      range: { from: number, to: number }
      summary: string
返回：{ events: SessionEvent[], watermark: number }
```

**不变量**
1. 区间内的事件被**一条** `type === 'session/compaction'` 的事件替换，该事件带 `atSeq`（等于原区间最后一条的 seq）、`summary`（等于参数）、以及 `placeholder: true`。
2. 区间外的事件保持不变（顺序与内容）。
3. 返回的 `watermark` 等于 `atSeq`（即被替换掉的那部分最后一条的 seq）——**它表示"到此为止已被压缩"**。
4. 不修改传入的 `events` 数组。

---

## Part D · `kit/src/proc.mjs`

### `runShell(cmd, opts)`

```
参数：cmd: string
      opts = { timeoutMs: number, signal?: AbortSignal, cwd?: string }
返回：Promise<{ exitCode: number | null, signal: string | null, stdout: string, stderr: string, timedOut: boolean, cancelled: boolean, durationMs: number }>
```

**不变量**
1. **超时后必须终止整棵进程树**（不只是直接子进程）。判分器启动一个会派生孙进程的命令，超时后核对孙进程也已退出。
2. `opts.signal` 被取消时，先发温和终止信号，等待一个宽限期（函数内部常量，建议 500–2000ms），再强制终止；`cancelled === true`。
3. **stdout/stderr 必须被并发消费**——判分器会输出远超管道缓冲区大小的内容，实现若在进程结束后才读会死锁（测试有超时保护，超时即判该条不通过）。
4. `timedOut` 与 `cancelled` 不得同时为 `true`。
5. `stdout` 与 `stderr` 是完整内容（**不截断**；截断是 `collectOutput` 的职责）。
6. 命令不存在时返回 `exitCode !== 0`，**不抛错**（把它当作一次失败退出）。

### `transition(state, event)`

```
参数：state: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
      event: 'start' | 'succeed' | 'fail' | 'cancel'
返回：新的 state，或 null（表示该转换不允许）
```

**不变量**
1. 合法转换：`pending + start → running`、`running + succeed → succeeded`、`running + fail → failed`、`running + cancel → cancelled`、`pending + cancel → cancelled`。
2. **终态不可逆**：从 `succeeded`/`failed`/`cancelled` 出发的任何事件都返回 `null`。
3. 不在上表的组合返回 `null`（例如 `pending + succeed`）。

### `collectOutput(chunks, budget)`

```
参数：chunks: string[]                 // 按到达顺序的数据块
      budget = { maxChars: number, headRatio: number }   // headRatio ∈ [0, 1]
返回：{ text: string, truncated: boolean, omittedChars: number, pointer: string | null }
```

**不变量**
1. 全部拼接后的长度 `<= maxChars` 时：`text` 是完整拼接，`truncated === false`，`omittedChars === 0`，`pointer === null`。
2. 超预算时：`truncated === true`、`text` 含头部与尾部、`omittedChars === 拼接总长 - text.length`（**注意：因为省略的是中间一段**）、`pointer !== null`。
3. `pointer` 非空时必须是非空字符串。

**关于第 2 条的 `omittedChars`**：拼接总长减去 `text.length` 会包含被省略的中间段，而 `text` 里会有一段标记文字（例如 `…[已省略 N 字符]…`）。**判分器接受 `omittedChars` 与"被省略的原始字符数"相差不超过标记文字长度**。

---

## Part E · `kit/src/persist.mjs`

### `readAll(lines)`

```
参数：lines: string[]           // 日志的每一行（已去掉换行符）
返回：{ events: SessionEvent[], truncatedAt?: number, rejected?: { reason: string } }
```

**不变量**
1. 正常行（可解析、含 `seq`、`type` 已知）按顺序进入 `events`。
2. **半行**（JSON 解析失败）→ 截断：返回已读部分，并置 `truncatedAt`（等于已读条数）。**不抛错**。
3. **缺字段**（解析成功但没有 `seq` 或 `type`）→ 同样按截断处理并置 `truncatedAt`。
4. **顺序号跳号**（`seq !== 上一条的 seq + 1`）→ **抛错**，错误信息包含 `跳号` 或 `gap`。理由是"跳号意味着日志中间有缺口，那不是崩溃的正常结果"（讲义 3.5 的 3.2）。
5. **未知类型**：`type` 以 `session/` 开头且不在已知集合内、且该事件带 `ignorable: true` → 跳过该条并继续；**不带 `ignorable` → 返回 `rejected` 且 `events` 为空**（**拒绝整份日志**，讲义 3.5 的 0.3）。

   **注意**："跳过该条并继续"指的是不把它放进 `events`，而它**仍然计入顺序号的连续性**——日志的物理完整性由所有行决定，因此下一条仍须是 `被跳过那条的 seq + 1`。
6. `lines` 为空 → `{ events: [] }`。

**已知类型集合**（实现里可以硬编码）：`session/user`、`session/assistant`、`session/tool-result`、`session/compaction`、`session/state`。

### `recover(events, checkpoint)`

```
参数：events: SessionEvent[]                       // readAll 的输出
      checkpoint: { lastSeq: number, state: object } | null
返回：Promise<{ state: object, redone: number, reverted: number, truncatedAt?: number, fromCheckpoint: boolean }>
```

**不变量**
1. `checkpoint` 为 `null` 时从空状态开始，`fromCheckpoint === false`。
2. 非 null 时从 `checkpoint.state` 开始，且**跳过 `seq <= checkpoint.lastSeq` 的事件**，`fromCheckpoint === true`。
3. **重做必须幂等**：对同一份日志连做两次恢复，第二次的 `redone` 为 0（因为 `lastSeq` 已推进），且两次的最终 `state` 逐字段相同。
4. 未提交的事件（`committed !== true`）进入 `reverted` 计数，并从状态中撤销（`state.count` 减一，或按事件的 `op` 字段撤销）。

**状态形状**（为了让判分器可核对，`state` 使用这个最小形状）：

```js
{ lastSeq: 0, count: 0, items: [], }
```

**事件的 `op` 字段**：`{ op: 'append', value: X }` 表示把 X 加入 `items` 并把 `count` 加一；`{ op: 'set', key, value }` 表示设置一个键。**未带 `op` 的事件只推进 `lastSeq`**（不改变 `count`/`items`）。

---

## Part F · `kit/src/metrics.mjs`

### `costOf(usage, price)`

```
参数：usage = { promptTokens: number, completionTokens: number, cachedPromptTokens?: number }
      price = { missPerMTok: number, hitPerMTok: number, outPerMTok: number }
返回：{ missInput: number, hitInput: number, output: number, total: number }
```

**不变量**
1. `missInput = (promptTokens - cached) / 1e6 * missPerMTok`，其中 `cached = usage.cachedPromptTokens ?? 0`。
2. `hitInput = cached / 1e6 * hitPerMTok`。
3. `output = completionTokens / 1e6 * outPerMTok`。
4. `total` 是三者之和。
5. **`cachedPromptTokens` 缺失时按零命中处理，不得抛错**。
6. `cachedPromptTokens > promptTokens` 时按 `promptTokens` 截断（**不得产生负的 missInput**）。

### `latencyBreakdown(req)`

```
参数：req = { at: number, startedAt: number, firstTokenAt: number, finishedAt: number, retryWaitMs?: number }
返回：{ queueMs: number, firstTokenMs: number, generateMs: number, retryWaitMs: number, totalMs: number }
```

**不变量**
1. `queueMs = startedAt - at`、`firstTokenMs = firstTokenAt - startedAt`、`generateMs = finishedAt - firstTokenAt`。
2. `retryWaitMs = req.retryWaitMs ?? 0`。
3. `totalMs = finishedAt - at`，且**四段之和等于 `totalMs`**（判分器会核对这一条）。
4. 任一时间戳缺失时抛错，错误信息含 `时间戳`。

### `hitRate(usages)`

```
参数：usages: LLMUsage[]           // 每项含 promptTokens 与可选的 cachedPromptTokens
返回：number                        // [0, 1]
```

**不变量**
1. 分母是 `promptTokens` 之和；分子是 `cachedPromptTokens` 之和。
2. **空数组返回 0**（不得返回 `NaN`）。
3. 所有 `promptTokens` 之和为 0 时返回 0。
4. 返回值被夹在 `[0, 1]` 内。

### `summarize(records)`

```
参数：records: Array<{ sessionId, taskId?, tool?, usage, totalMs, queueMs, firstTokenMs, generateMs, retryWaitMs }>
返回：{
  requests: number,
  tokens: { missInput: number, hitInput: number, output: number },
  cost: { missInput: number, hitInput: number, output: number, total: number },
  hitRate: number,
  latency: { p50: number, p95: number, p99: number, max: number },
  bySession: Record<string, { requests: number, cost: number }>,
  byTool: Record<string, { requests: number, cost: number }>
}
```

`price` 通过第二个参数传入：`summarize(records, price)`。

**不变量**
1. `requests === records.length`。
2. `tokens` 是三档的合计；`cost` 由 `costOf` 对每条累加得到。
3. `hitRate === hitRate(records.map(r => r.usage))`（与那个函数一致）。
4. `latency` 是 `totalMs` 的分位数，**用最近秩法**（`p95` 取排序后第 `ceil(0.95 * n) - 1` 个；`n === 0` 时四项均为 0）。
5. `bySession` 与 `byTool` 按记录分组累加成本；**没有 `tool` 字段的记录不计入 `byTool`**。
6. 空数组：`requests === 0`、各合计为 0、`latency` 四项为 0、两个分组为空对象。

---

## 附：判分器如何调用你的实现

```js
// tests/t3-context.mjs 的形态
const impl = await import(process.env.IMPL ?? '../kit/src/context.mjs')
const r = impl.spill('x'.repeat(1000), { maxChars: 200, headRatio: 0.6 })
assert(r.pointer !== null, '溢出时必须给出指针')
```

**这意味着**：函数必须是具名导出；抛错时用 `throw`；不要依赖模块级可变状态（判分器可能在同一个进程里重复导入不同实现）。
