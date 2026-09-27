# 契约 · 大作业四

> 这份文件定义一个**接口契约**：你的实现要满足它，判分器按它检查。
> **不要修改这份文件。** 如果你认为契约本身有问题，把它写进 `writeup.md`。
>
> 契约的写法遵循第 1.4 篇的规范：每个函数给出**前置条件**、**返回值**、以及**必须成立的不变量**。不变量是判分的依据。

---

## 通用约定

**模块格式**：ESM（`export`），后缀 `.mjs`。**不要引入第三方依赖**。

**错误处理**：只在契约明确要求时报错（`throw new Error(...)`，信息含契约给出的关键词）。

**纯函数**：除 `release` 外都是纯函数（同样的输入得到同样的输出），**不得修改传入参数**（判分器会冻结部分参数）。

**时间来源**：不得在函数内部调用 `Date.now()`。所有时间从参数取（`ctx.now` 或 `opts.now`）。

**可选复用**：契约里标了「可复用 ch03」的地方，你可以 `import` 大作业三的实现（例如 `../../ch03-reliability/grade/context.reference.mjs` 或你自己写的 `kit/src/context.mjs`）。**判分器不检查这一点**。

---

## Part A · 写入与触发策略（答案 JSON）

### 形状

```jsonc
{
  "writes": [
    {
      "id": "m1",
      "decision": "write",          // write | skip
      "kind": "fact",               // fact | preference | inference（skip 时可为 null）
      "reason": "..."               // 必填，非空；需提到三个过滤器之一
    }
    // ... 12 项
  ],
  "skills": [
    {
      "id": "sk1",
      "description": "...",         // 改写成触发条件（回答"何时用"）
      "doesNotApplyWhen": "..."     // 一条不适用条件
    }
    // ... 6 项
  ],
  "bounded": [
    { "id": "b1", "action": "...", "reason": "..." }
    // ... 2 项
  ]
}
```

### 不变量

1. `writes` 有 12 项，`id` 与题目一致；`decision` 属于两个取值之一。
2. 每项 `reason` 非空，且包含三个过滤器的关键词之一：`跨会话`、`可验证`、`临时`。
3. `decision === 'write'` 时 `kind` 必须是三个取值之一；`skip` 时 `kind` 可为 `null`。
4. `skills` 有 6 项，每项 `description` 与 `doesNotApplyWhen` 均非空，且 `description` **不得以"关于"、"本技能"开头**（那说明写的是主题而不是触发条件）。
5. `bounded` 有 2 项，`action` 与 `reason` 非空。

---

## Part B · 诊断与可行动性（答案 JSON）

### 形状

```jsonc
{
  "failures": [
    {
      "id": "f1",
      "kind": "silent",                        // error | silent | goal-miss
      "candidates": [
        { "cause": "...", "evidence": "counterfactual" }
        // 至少两个；evidence ∈ correlation | counterfactual | reproducible
      ]
    }
    // ... 9 项
  ],
  "rewrites": [
    {
      "id": "r1",
      "rewritten": "...",                      // 含一个可改对象的结论
      "targetKind": "prompt"                   // prompt | threshold | tool-desc | skill-condition | config
    }
    // ... 5 项
  ]
}
```

### 不变量

1. `failures` 有 9 项，`kind` 属于三个取值之一。
2. 每项 `candidates` **至少两个**（判据要求强制比较，避免过早收敛）。
3. 每项 `evidence` 属于三个取值之一；**至少一项的 `evidence` 是 `counterfactual` 或 `reproducible`**（"全是相关性"说明没有做验证）。
4. `rewrites` 有 5 项，`targetKind` 属于五个取值之一；`rewritten` 非空且**不得包含"模型能力"或"用户表达"**（那两句是不可行动的原型）。

---

## Part C · `kit/src/memory.mjs`

### 数据结构

```js
// 一条记忆条目
{ id, text, kind: 'fact' | 'preference' | 'inference', source, createdAt,
  useCount, suppressedAt?, expiresAt?, supersededBy? }

// 候选（写入请求）
{ text, kind, source?, crossSessionUseful?, verifiable?, temporary? }

// 存储
{ capacity: number, entries: Entry[] }
```

### `write(entry, store, policy)`

```
返回：{ ok: true, entry } | { ok: false, reason: string, mergedInto?: string }
```

**不变量**
1. 三个过滤器：
   - `crossSessionUseful === false` → 拒绝（`reason` 含「跨会话」）；
   - `temporary === true` → 拒绝（`reason` 含「临时」）；
   - `kind === 'inference'` 且 `source` 为空 → **抛错**（信息含「来源」）。
2. 容量未满：写入并返回新条目（`id` 由实现生成，`useCount` 从 0 开始）。
3. **容量已满**时：先找与候选相似度 ≥ `policy.similarityThreshold` 的已有条目，
   - 找到 → **合并**（把两条的文本按 `text1；text2` 拼接，`useCount` 相加，旧条目置 `supersededBy` 指向新条目），返回 `{ ok: true, entry, mergedInto: 旧条目 id }`；
   - 找不到 → 返回 `{ ok: false, reason: 含「容量」 }`。
4. **不得修改传入的 `store`**（返回新对象或新数组由实现决定，但入参不变）。
5. 相似度用**字符级 Jaccard**：`|A ∩ B| / |A ∪ B|`，A、B 是两条文本的字符集合（去重）。

### `retrieve(query, store, opts)`

```
opts = { k, threshold, now, decayDays = 30 }
返回：Entry[]（按分数降序，长度 ≤ k）
```

**不变量**
1. **打分之前**先过滤：`suppressedAt` 存在的、`expiresAt <= now` 的条目**不参与**。
2. 分数 = `1.0 * overlap + 0.3 * recency + 0.2 * frequency`，其中：
   - `overlap = |Q ∩ T| / |Q|`，Q 是 query 的字符集合，T 是条目文本的字符集合；`|Q| === 0` 时 overlap 为 0；
   - `recency = 1 / (1 + (now - createdAt) / decayDays)`；
   - `frequency = min(1, useCount / 5)`。
3. 分数 **< threshold** 的条目**不返回**（不为了凑满 `k` 而返回）。
4. 同分时按 `createdAt` 降序（新的在前）。
5. 空 store 返回 `[]`。

### `inject(entries, budget, opts)`

```
budget = { maxEntries, maxChars }
opts = { stableUses = 3 }
返回：{ text, picked: string[], chars: number, skipped: string[] }
```

**不变量**
1. 排序：`useCount >= stableUses` 的条目在前（稳定），其余在后；组内按 `useCount` 降序。
2. 预算 **双重**：条数不超过 `maxEntries`，且 `chars` 不超过 `maxChars`。
3. **超预算时跳过整条**（不得截断某条文本）；被跳过的 id 进入 `skipped`。
4. `text` 里每条记忆**带编号与性质说明**（形如 `1. [事实] ...`；`inference` 用 `[推测]`）。
5. `chars === text.length`。
6. **不修改 `entries`**。

### `observe(store)`

```
返回：{ entries, byKind: { fact, preference, inference }, suppressed, expired, totalUse }
```

**不变量**

1. `entries` 是条目总数；`byKind` 按 `kind` 计数。
2. `suppressed` 是有 `suppressedAt` 的条数；`expired` 是 `expiresAt <= opts.now` 的条数（`opts.now` 缺省时按 0 计）。
3. `totalUse` 是全部 `useCount` 之和。
4. 空 store：各项为 0。

---

## Part D · `kit/src/user-model.mjs`

### 数据结构

```js
// 模型
{ features: [ { key, value, weight, evidence: Observation[], lastUpdatedAt, expiresAt } ] }

// 观察
{ key, value, kind: 'explicit' | 'implicit' | 'contradict', at }
```

### `applyObservation(model, obs)`

**不变量**
1. 权重：`explicit = 3`、`implicit = 1`、`contradict = -2`。
2. 同向（已存在同 key 同 value）：`weight += WEIGHT[kind]`，证据追加。
3. 反向（已存在同 key 不同 value）：
   - `weight + WEIGHT.contradict <= 0` → **删除该特征**；
   - 否则削弱该特征的 weight，证据追加。
4. **模型中无该 key 且 `kind === 'contradict'` → 不创建特征**（只返回原模型）。
5. 新建特征的 `expiresAt = at + TTL[key]`，其中 `TTL` 由 `opts.ttlDays` 提供（缺省 180 天）；`lastUpdatedAt = at`。
6. 不修改传入的 `model`。

### `decayAndDetect(model, now, opts)`

```
opts = { windowDays = 7, driftThreshold = 2 }
返回：{ model, drifting: string[] }
```

**不变量**
1. `expiresAt <= now` 的特征被删除（**不是抑制**）。
2. `drifting` 是满足「窗口内 `contradict` 证据数 ≥ driftThreshold」的特征 key 列表（按字典序）。
3. `decayAndDetect` **只报告，不自动降低权重**。

### `inject(model, spec, opts)`

```
spec = { length, format, notes: string[] }
opts = { threshold = 3, confirmThreshold = 6 }
返回：新的 spec（不修改入参）
```

**不变量**
1. `weight < threshold` 的特征**不生效**。
2. `weight >= confirmThreshold` 的特征生效但**不追加说明**（已确认过，反复说明是噪音）。
3. 中等置信度的特征生效，且 `notes` 里追加一句以「按你以往的偏好：」开头、含该特征 key 或 value 的说明。
4. 生效的具体形态由实现决定（例如 `spec.length = value`），但**不得改变 `spec` 之外的任何字段**。

### `listFeatures(model)`

```
返回：[{ label, reason, confidence }]
```

**不变量**
1. 每项 `label` 与 `reason` 非空，`confidence` 是 `已确认` 或 `推测`（`weight >= 6` 为已确认）。
2. **返回的对象里不得出现 `weight` 这个字段名**（判分器用正则检查序列化结果）。用户看到的应当是"已确认/推测"而不是内部数值。

---

## Part E · `kit/src/evolution.mjs`

### 数据结构

```js
// 提议
{ id, target: { kind: 'config' | 'prompt' | 'skill' | 'tool-desc', path },
  diff: { before, after }, reason, expectation: { metric, delta }, rollback, originVersion }
```

### `buildProposal(diagnosis, change)`

**不变量**
1. `change.diff.before` 与 `change.diff.after` 均非空，否则抛错（信息含「差异」）。
2. `diagnosis.action.target` 非空，否则抛错（信息含「可行动」）。
3. 返回的提议含 `reason`（由 `diagnosis` 派生）、`rollback`、`originVersion`。

### `gate(proposal, current, ctx)`

```
current = { id, textOf(path) }
ctx = { metaControlled: string[], applyDiff(text, diff), runs: { baseA, baseB, candidate }, guardOk: boolean }
返回：{ ok: boolean, why: string, stage: 'static' | 'eval' | 'ok' }
```

**不变量**
1. **静态层**（按顺序）：
   - `target.path` 在 `ctx.metaControlled` 里 → `{ ok: false, stage: 'static' }`，`why` 含「元控制」；
   - `proposal.originVersion !== current.id` → `{ ok: false, stage: 'static' }`，`why` 含「基线」；
   - `ctx.applyDiff` 抛错 → `{ ok: false, stage: 'static' }`，`why` 含「差异」。
2. **评估层**：
   - `noise = |mean(baseA) - mean(baseB)|`；`gain = mean(candidate) - (mean(baseA) + mean(baseB)) / 2`；
   - `gain <= 2 * noise` → `{ ok: false, stage: 'eval' }`，`why` 含「噪声」；
   - `ctx.guardOk === false` → `{ ok: false, stage: 'eval' }`，`why` 含「护栏」。
3. 全部通过 → `{ ok: true, stage: 'ok' }`。

### `release(store, proposal, ctx)`

```
store = { current: { id }, versions: [] }
返回：{ version: { id, base, changes: [proposal] }, from: string }
```

**不变量**
1. **一组改动作为一个版本**：`changes` 是数组（本次只有一条提议）。
2. `version.base === store.current.id`；`from === store.current.id`。
3. 不修改传入的 `store`（返回的 `version` 由调用方并入）。

### `rollback(store, toVersion, ctx)`

```
ctx = { canReadState(version) }
返回：{ ok: true, to } 或抛错（信息含「状态」）
```

**不变量**
1. `ctx.canReadState(toVersion) === false` → **抛错**（信息含「状态」或「兼容」）。
2. 否则返回 `{ ok: true, to: toVersion.id }`。

---

## Part F · `kit/src/longhorizon.mjs`

### 数据结构（与讲义 4.7 的八个字段一致）

```js
{ goal, revisions: [], constraints: [], milestones: [{ name, done, check }],
  done: [], doing: [], todo: [], decisions: [], open: [], artifacts: [], next,
  updatedAt, baselineTodoCount }
```

### `writeState(state, ctx)`

**不变量**
1. `state.next` 非空且长度 ≥ 8，否则抛错（信息含「下一步」）。
2. 每条 `constraint` 必须**可检查**：匹配 `/(通过|不通过|等于|大于|小于|不含|包含|存在|>=|<=|==|\d)/`，否则抛错（信息含「判据」）。
3. `doing.length > 1` → 抛错（信息含「进行中」）。
4. 返回的对象 `updatedAt === ctx.now`；不修改入参。

### `resume(state, ctx)`

```
ctx = { now, staleAfterDays = 14, mtimeOf(path) }
返回：{ startHere, context, remaining, verifyAt, warnings }
```

**不变量**
1. `startHere === state.next`。
2. `context` 含 `goal`、`constraints`、`decisions`（三者都来自状态）。
3. `remaining = { todos: state.todo.length, added: state.todo.filter(t => t.added).length }`。
4. `verifyAt` 是第一个未完成里程碑的 `{ name, check }`；全部完成时为 `null`。
5. `warnings` 按三条判据生成：
   - 任一 `artifact` 的 `ctx.mtimeOf(path)` **大于** `state.updatedAt` → 含「产物」的警告；
   - `ctx.now - state.updatedAt > staleAfterDays * 86400000` → 含「未更新」的警告；
   - `todo.length > 0 && doing.length === 0` → 含「进行中」的警告。

### `revise(state, revision, ctx)`

```
revision = { kind: 'goal', reason, text }             // 目标修订
         | { kind: 'scope', reason, item }             // 范围新增
```

**不变量**
1. `reason` 为空 → 抛错（信息含「理由」）。
2. `kind === 'goal'`：**`goal` 字段保持原值**，`revisions` 追加 `{ reason, text, at: ctx.now }`。
3. `kind === 'scope'`：`todo` 追加 `{ ...item, added: true }`，并在 `revisions` 追加一条**不含文本改动**的记录（`{ kind: 'scope', reason, at }`）。
4. 不修改入参（`goal` 尤其不得被改）。

### `coverage(outputs, ctx)`

```
outputs = [{ id, kind, action, state: 'todo' | 'doing' | 'done' | 'dropped', dropReason?, openedAt, closedAt? }]
ctx = { minCoverage = 0.6 }
返回：{ coverage: number, gated: boolean, closed: number, total: number }
```

**不变量**
1. 计入覆盖的条件：`state === 'done'`，或 `state === 'dropped'` **且** `dropReason` 非空。
2. `coverage = closed / total`；**空数组时 coverage 为 0**（不得为 NaN）。
3. `gated === coverage >= ctx.minCoverage`（`gated` 为 true 表示**允许新增产出**）。
4. **空数组时 `gated` 为 false**（没有历史就无从判断，先清空才算安全）。

---

## 附：判分器如何调用你的实现

```js
const impl = await import(process.env.IMPL ?? '../kit/src/memory.mjs')
const r = impl.write({ text: 'x', kind: 'fact', crossSessionUseful: false }, store, policy)
assert(r.ok === false, '会话内信息不应写入')
```

**这意味着**：函数必须是具名导出；抛错用 `throw`；不要依赖模块级可变状态（判分器可能在同一个进程里导入多个实现版本）。
