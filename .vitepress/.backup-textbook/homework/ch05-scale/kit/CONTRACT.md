# 契约 · 大作业五

> 这份文件定义**接口契约**：你的实现要满足它，判分器按它检查。**不要修改这份文件。**
>
> 每个函数给出**前置条件**、**返回值**与**必须成立的不变量**。不变量是判分的依据。

---

## 通用约定

**模块格式**：ESM（`export`），后缀 `.mjs`，不引入第三方依赖。

**错误处理**：只在契约要求时报错（`throw new Error(...)`，信息含契约给出的关键词）。

**纯函数**：全部是纯函数——**同样的输入得到同样的输出**，**不得修改传入参数**（判分器会冻结部分参数并重复调用）。

**时间来源**：不得调用 `Date.now()`；时间从 `ctx.now` 取。

**并发无关**：这些函数**不是**真的并发原语，它们是**在给定状态上做判决**的纯函数。判据核对的是判决与状态迁移的正确性，而不是线程安全。

---

## Part A · 模式与审批的分析（答案 JSON）

### 形状

```jsonc
{
  "defaults": [
    { "id": "d1", "verdict": "reproducible", "reason": "...", "action": "keep" }
    // ... 10 项；verdict ∈ reproducible | environment-dependent；action ∈ keep | make-explicit | move-to-generation
  ],
  "merges": [
    { "id": "g1", "values": { "concurrency": 8 }, "origin": { "concurrency": "用户级" } }
    // ... 6 项
  ],
  "consequences": [
    { "id": "c1", "text": "...", "risk": "high" }
    // ... 4 项；risk ∈ low | medium | high | critical
  ]
}
```

### 不变量

1. `defaults` 有 10 项，`verdict`、`action` 属于给定取值；每项 `reason` 非空。
2. **`verdict === 'environment-dependent'` 的项，其 `action` 不得是 `keep`**：由环境推断的用 `move-to-generation`，由代码内建默认的用 `make-explicit`。`verdict === 'reproducible'` 的项，其 `action` 必须是 `keep`。
3. `merges` 有 6 项，`values` 与 `origin` 都非空；`origin` 的每个值必须是四层名之一（`内建`、`用户级`、`项目级`、`运行参数`）。
4. `consequences` 有 4 项，每项 `text` 通过三条检查：**不含反引号**、**不含 `rm`/`mv`/`cp`/`chmod`/`curl`/`git push`**、**含「可恢复」或「不可恢复」之一**。

---

## Part B · 派发协议与信任边界（答案 JSON）

### 形状

```jsonc
{
  "delegations": [
    {
      "id": "t1",
      "goal": "...",                       // 可判定的一句话
      "context": { "give": ["..."], "notGive": ["..."] },
      "constraints": ["..."],              // 判据形式
      "outputFormat": { "kind": "patch", "maxChars": 4000 }
    }
    // ... 6 项
  ],
  "boundaries": [
    {
      "id": "e1",
      "fs": { "read": ["..."], "write": [] },
      "net": [],
      "budget": { "cpuMs": 0, "memoryMb": 0, "callsPerMinute": 0 },
      "contextSharing": { "parentHistory": false, "memory": "none" },
      "sideEffectCeiling": "read",
      "escapeAttempt": "..."
    }
    // ... 4 项
  ]
}
```

### 不变量

1. `delegations` 有 6 项；每项 `goal` 非空且长度 ≥ 8（可判定的最低要求）。
2. **`context.notGive` 必须非空**（判据要求明确"不给什么"——它让子 agent 知道自己看不到全貌）。
3. 每项 `constraints` 至少两条，且每条匹配 `/(不得|必须|只能|不允许|不超过|通过|等于)/`（判据形式）。
4. `outputFormat` 必须含 `kind` 与 `maxChars`（**容量是必需项**）。
5. `boundaries` 有 4 项；`contextSharing.parentHistory` 必须是 `false`（**默认不共享父会话历史**）；`sideEffectCeiling` 属于 `read | write | destructive | system`。
6. 每项 `escapeAttempt` 非空（一次用来验证边界的越界尝试）。

---

## Part C · `kit/src/profile.mjs`

### `compose(layers)`

```
layers = [{ name: '内建'|'用户级'|'项目级'|'运行参数', values: object }]   // 从低到高
返回：{ values, origin }        // origin[key] = 层名
```

**不变量**
1. 按 `layers` 顺序覆盖；后来的层覆盖先前的同名标量。
2. **对象深合并**：两层的同名值是对象时按一层合并（同键取上层值，其余键保留）。
3. **数组整体替换**：上层是数组时**整段替换**（不得拼接下层的元素）。
4. `origin[key]` 记录**最终生效的那一层**。
5. 空 `layers` 返回 `{ values: {}, origin: {} }`；不修改入参。

### `expandCapabilities(profile, registry)`

```
profile = { plugins: [{ name }], requires: [string] }
registry = { provides(name): string[], dependencies(name): string[], has(name): boolean }
返回：{ caps: string[], size: number }
```

**不变量**
1. 展开**间接依赖**：从 `profile.plugins` 出发做广度优先遍历，遇到新的插件继续展开。
2. `caps` 是所有**可达插件**提供的全部能力，去重后按字典序排序。
3. `size === caps.length`。
4. 插件之间存在循环依赖时**不死循环**（用已访问集合）。

### `validate(profile, registry, ctx)`

```
ctx = { maxCapabilities: number }
返回：{ ok: boolean, issues: [{ level: 'error'|'warn', what: string, hint?: string }], capabilities: number }
```

**不变量**
1. 插件不存在 → `error`（`what` 含插件名）。
2. `requires` 里有能力未被提供 → `error`，且 `hint` 提到"某个插件可能提供它"（信息含「可能由」即可）。
3. `capabilities > ctx.maxCapabilities` → `error`（`what` 含「上限」）。
4. `ok === issues.every(i => i.level !== 'error')`。
5. 全部通过时 `issues` 为空数组（不是 `undefined`）。

### `planSwitch(from, to, ctx)`

```
from = { name, registrations: [{ what, scope, surviving?: boolean }] }
to = { name }
ctx = { capabilityDelta?: number }
返回：{ mode: 'whole', steps: string[], expectResidual: string[], stateToMigrate: string[] }
```

**不变量**
1. **`mode` 必须是 `'whole'`**（契约不接受增量重装；判分器会核对这个值）。
2. `steps` 按固定顺序且至少含四步：校验、构造、激活、核对残留（判据只核对关键词「校验」「构造」「激活」「残留」都出现）。
3. `expectResidual` 是 `from.registrations` 中**未标记 `surviving: true`** 的项（它们**应当**在切换后被释放，因此不出现在这个列表里）——**确认存活的是 `surviving: true` 的那些**，它们**不进** `expectResidual`。
4. `stateToMigrate` 非空（会话级状态需要迁移）。

---

## Part D · `kit/src/session.mjs`

### `admit(request, registry, policy)`

```
request = { sessionId: string }
registry = { globalRunning(): number, sessionRunning(id): number, tokensInWindow(id, ms): number, estimate(req): number }
policy = { globalMaxConcurrent: number, maxConcurrentPerSession: number, maxTokensPerMinute: number }
返回：{ ok: true } | { ok: false, reason: string, retryAfter: number }
```

**不变量**
1. **顺序固定**：全局并发 → 会话并发 → 速率。**全局满时不得因为会话未满而放行**。
2. 全局满 → `reason` 含「全局」，`retryAfter > 0`。
3. 会话满 → `reason` 含「会话」，`retryAfter > 0`。
4. 速率超限 → `reason` 含「速率」，且 `retryAfter >= 1000`（速率的等待比并发长）。

### `schedule(registry, ctx)`

```
registry = { all(): [{ id, state, preset, priority, credits }] }
ctx = { creditsPerRound?: number }
返回：string | null
```

**不变量**
1. 只考虑 `state` 为 `running` 或 `idle` 的会话。
2. **优先级高的先**（`priority` 数字大的先）。
3. 同优先级内，选**剩余 `credits > 0`** 的第一个（配额轮转）。
4. `credits` 全部为 0 或无可选会话 → 返回 `null`。
5. 不得依赖调用者传入的顺序（判据会打乱输入顺序核对结果一致）。

### `acquire(store, workspace, holder, ctx)`

```
store = { leases: [{ workspace, holder, expiresAt }] }
ctx = { now: number, ttlMs: number, allowQueue: boolean }
返回：{ ok: true, lease: { workspace, holder, expiresAt } }
    | { ok: false, queued: true }
    | { ok: false, reason: string }
```

**不变量**
1. 无租约，或已有租约**已过期**（`expiresAt <= now`）→ 授予新租约（`expiresAt === now + ttlMs`）。
2. 已有租约未过期且 `holder` 相同 → **重入**（返回同一个 holder 的新租约，不排队）。
3. 已有租约未过期且 holder 不同：
   - `ctx.allowQueue === true` → `{ ok: false, queued: true }`（**排队而不是失败**）；
   - 否则 → `{ ok: false, reason }`（`reason` 含「占用」）。
4. 不修改传入的 `store`。

### `closeReport(session, ctx)`

```
session = { id, workspaces: string[], registrations: [{ what, scope, expectedAfterDispose?: boolean, released?: boolean }] }
ctx = { graceMs: number }
返回：{ cancelled: number, released: string[], leaked: string[], order: string[] }
```

**不变量**
1. `order` 按固定顺序且**先取消后释放**（前两项是「取消」「释放租约」，判据核对这两个关键词的先后）。
2. `released` 列出被释放的工作区（`session.workspaces` 的全部）。
3. `leaked` 是**未标记 `expectedAfterDispose` 且未标记 `released: true`** 的注册项——即"本应被释放而实际上没有释放"的那些。`expectedAfterDispose: true` 的项**不进** `leaked`（它们本来就应当存活）。判据用这份列表核对回收报告的诚实性。
4. 返回 `cancelled` 为非负整数。

---

## Part E · `kit/src/interaction.mjs`

### `buildRequest(tool, args, ctx)`

```
tool = { name, sideEffect: 'read'|'write'|'destructive'|'system' }
args = { path?: string, target?: string }
ctx = { now, sessionId, preset, profile, taskSummary, workspaceRoot }
返回：{ id, origin, action: { tool, summary }, risk: { level, reason, undoable }, options: string[], raisedAt }
```

**不变量**
1. `origin` 含 `sessionId`、`preset`、`profile`，以及 `taskSummary`（**任务语境**）。
2. 风险分级规则（先看 `sideEffect`，再看影响范围）：
   - `read` → `low`；
   - `write` 且目标路径在 `workspaceRoot` 内且 `args.path` 的父目录**已存在**（新增）→ `low`；
   - `write` 覆盖已存在路径 → `medium`；
   - `destructive` 且在工作区内 → `high`；在工作区外 → `critical`；
   - `system` → `critical`。
   （判据只核对上面这几条；`medium` 与 `low` 的区分依据是"是否覆盖已有内容"。）
3. `undoable`：`read`/新增 `write` → `true`；覆盖、`destructive`、`system` → `false`。
4. `summary` **不得包含反引号与命令名**（`rm`/`mv`/`cp`/`chmod`/`curl`），且长度 ≥ 4。
5. `options` **必须含 `alternative`**，且顺序为 `['allow-once', 'allow-session', 'allow-project', 'deny', 'alternative']` 的子序列（从窄到宽）。

### `decide(request, permissions, presets)`

```
permissions = [{ match: { tool, constraint? }, source: { kind: 'preset'|'project'|'user'|'approval' }, revoked?: boolean }]
presets = { denies(req): boolean, isReadOnly(req): boolean, autoAllowReadOnly: boolean, matchConstraint(c, req): boolean }
返回：'allow' | 'ask' | 'deny'
```

**不变量**
1. **优先级固定，且"上界"排在最前**（判据会同时构造多个生效来源，核对返回的是最高优先的结论）：
   1. `presets.denies(request)` 为真 → `deny`。**它在最前**：预设的拒绝是上界，任何下游授权都不能放宽它；
   2. 否则有 `source.kind === 'user'` 且未 `revoked` 的匹配 → `allow`；
   3. 否则有 `source.kind === 'project'` 且未 `revoked` 的匹配 → `allow`；
   3. 否则 `presets.denies(request)` 为真 → `deny`（**预设的拒绝不可被项目约定放宽**：上面第 2 条必须在此之前判断，而第 3 条必须晚于第 1、2 条——即项目约定可以放行，但**不能放宽"预设拒绝"这类上界**；判据构造的情形是"既有项目约定、又有预设拒绝"，此时返回 `deny`）；
   4. 否则 `presets.autoAllowReadOnly && presets.isReadOnly(request)` → `allow`；
   5. 其余 → `ask`。
2. `revoked: true` 的授权**不参与**匹配。
3. 有 `constraint` 的授权，必须 `presets.matchConstraint(constraint, request)` 为真才算匹配。

### `fatigueSignals(events)`

```
events = [{ raisedAt, decidedAt?, decision?: 'allow-once'|'allow-session'|'deny'|'alternative' }]
返回：{ responded, medianLatencyMs, allowRate, refusalRate, fatigued }
```

**不变量**
1. 只统计 `decidedAt` 存在的事件。
2. `medianLatencyMs` 是 `decidedAt - raisedAt` 的**中位数**（偶数个体取中间两个的较小者，与 Part F 的分位数口径一致）。
3. `allowRate = 允许类决策数 / responded`；`refusalRate = (deny + alternative) / responded`。
4. **`fatigued` 是三信号的合取**：`medianLatencyMs < 3000 && allowRate > 0.95 && refusalRate === 0`。
5. 空输入 → `responded: 0`，三个比率为 0，`fatigued: false`。

---

## Part F · `kit/src/delegation.mjs`

### `buildDelegation(parent, spec)`

```
parent = { id, goal, tools: string[], depth?: number, constraints?: string[] }
spec = { goal, context: { give, notGive }, constraints: string[], outputFormat: { kind, maxChars }, preset?, budget? }
返回：{ id, parentSession, parentTask, depth, budget, ...spec }
```

**不变量**
1. 四个要素缺一 → 抛错，信息含缺的那个字段名（`目标` / `上下文` / `约束` / `产出格式`）。
2. `context.notGive` 为空数组 → 抛错（信息含「不给什么」）。
3. `outputFormat.maxChars` 缺失或 ≤ 0 → 抛错（信息含「容量」）。
4. `depth === (parent.depth ?? 0) + 1`；`parentTask === parent.goal`。
5. 默认预算：`budget = { maxTokens: 50000, maxToolCalls: 30 }`（`spec.budget` 提供时以它为准）。

### `admitDelegation(parent, ctx)`

```
ctx = { maxDepth, maxChildrenPerSession, globalRunning, globalMaxConcurrent, runningChildrenOf(id) }
返回：{ ok: true } | { ok: false, reason: string }
```

**不变量**
1. **顺序：深度 → 子任务数 → 全局并发**（判据构造同时越界的情形，核对报的是深度）。
2. 深度越界 → `reason` 含「深度」；子任务数越界 → 含「子任务」；全局满 → 含「全局」。

### `collectResult(child, format, ctx)`

```
child = { id, result: any, tokens?: number, turns?: number }
format = { kind: 'text'|'patch'|'list', maxChars: number }
返回：{ ok: boolean, content?: any, truncated?: boolean, retryable?: boolean, reason?: string, meta?: { childId, tokens, turns } }
```

**不变量**
1. `format.kind === 'text'` 时 `child.result` 必须是字符串；`list` 时必须是数组；否则 `{ ok: false, retryable: true }`（`reason` 含「格式」）。
2. `text` 超出 `format.maxChars` → 裁剪到 `maxChars`，`truncated: true`；`reason` 不必给出。
3. 未超出 → `truncated: false`。
4. 成功时 `meta` 含 `childId`、`tokens`、`turns`（缺省为 0）。

### `normalizeExternalError(err, server)`

```
err = { code?: string, message?: string }
返回：{ kind: 'retryable'|'fatal', message: string, needsHuman: boolean }
```

**不变量**
1. 映射：`ECONNREFUSED`/`ECONNRESET`/`timeout`/`ETIMEDOUT` → `retryable`；`ENOENT`/`InvalidRequest`/`EPROTO` → `fatal`。
2. **未识别的错误码 → `fatal` 且 `needsHuman: true`**（保守默认：不盲目重试，因为重试可能造成重复副作用）。
3. `message` 非空且含 `server` 名。

---

## 附：判分器如何调用你的实现

```js
const impl = await import(process.env.IMPL ?? '../kit/src/profile.mjs')
const r = impl.compose([{ name: '内建', values: { a: [1, 2] } }, { name: '用户级', values: { a: [3] } }])
assert.deepEq(r.values.a, [3], '数组必须整体替换')
```

**这意味着**：函数必须是具名导出；抛错用 `throw`；不要依赖模块级可变状态。
