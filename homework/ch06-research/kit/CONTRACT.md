# 契约 · 大作业六

> 这份文件定义**接口契约**：你的实现要满足它，判分器按它检查。**不要修改这份文件。**
>
> 这一卷与其他五卷的差别：**它的判据大多与"结论能不能被信任"有关**——噪声、分辨率、区间重叠、多重比较。

---

## 通用约定

**模块格式**：ESM（`export`），后缀 `.mjs`，不引入第三方依赖。

**纯函数**：全部是纯函数，不得修改传入参数。

**确定性**：`bootstrapCI` 与 `compare` 必须接受 `seed` 并在同一 `seed` 下**返回相同结果**（判分器会连调两次核对）。**实现可以用任何伪随机算法**——判据不核对具体数值，只核对"同种子同结果"与区间的基本性质。

---

## Part A · 问题清单（答案 JSON）

### 形状

```jsonc
{
  "classifications": [
    { "id": "q1", "kind": "open", "criterion": "missing-measure", "missing": ["漂移的可观测定义"] }
    // ... 8 项；kind ∈ engineering | open | not-answerable
    //        criterion ∈ resource-test | missing-measure | answer-shape
  ],
  "formulations": [
    {
      "id": "f1",
      "independent": { "name": "压缩阈值", "values": [0.5, 0.8] },
      "dependent": { "name": "任务成功率", "instrument": "check" },
      "baseline": { "kind": "ablation", "what": "无压缩" }
    }
    // ... 5 项；baseline.kind ∈ ablation | comparison | sweep
  ],
  "decisions": [
    { "id": "p1", "ifA": "...", "ifB": "...", "worthDoing": true }
    // ... 4 项
  ]
}
```

### 不变量

1. `classifications` 有 8 项；`kind` 与 `criterion` 属于给定取值；每项 `criterion` 非空。
2. **`kind === 'open'` 或 `'not-answerable'` 的项必须有非空 `missing`**；`engineering` 的项 `missing` 可为空。
3. `formulations` 有 5 项；每项 `independent.values` **至少两个**；`dependent.instrument` 非空（`check` / `human-label` / `model-judge` 之一）。
4. `decisions` 有 4 项；**`ifA` 与 `ifB` 必须不同**（相同说明问题没有决策影响）。

---

## Part B · 观察与转化（答案 JSON）

### 形状

```jsonc
{
  "observations": [
    { "id": "o1", "decision": "log", "kind": "surprise",
      "expected": "...", "observed": "...", "conditions": ["..."] }
    // ... 6 项；decision ∈ log | skip；kind ∈ surprise | anomaly | silent-deviation
  ],
  "rulings": [
    { "id": "r1",
      "explanations": [ { "text": "...", "kind": "mundane" }, { "text": "...", "kind": "mechanism" }, { "text": "...", "kind": "mechanism" } ],
      "remaining": "...", "how": "experiment" }
    // ... 4 项；kind ∈ mundane | mechanism；how ∈ lookup | experiment | counterexample
  ],
  "repros": [
    { "id": "m1", "steps": ["...", "..."], "expected": "...", "observed": "...", "minimality": "..." }
    // ... 3 项
  ]
}
```

### 不变量

1. `observations` 有 6 项；`decision === 'log'` 时 `expected` 与 `observed` 必须非空（**没有预期就没有意外**）；`skip` 时可省略。
2. **`kind === 'surprise'` 的项必须有 `expected`**（"意外"的定义就是与预期冲突）。
3. `rulings` 有 4 项；每项 `explanations` **至少三个**，且**至少一个 `kind === 'mundane'`**（平凡解释必须被列上）。
4. `repros` 有 3 项；每项 `steps` 至少两步、`expected` 非空、`minimality` 非空（说明"每一步为什么必要"）。

---

## Part C · `kit/src/stats.mjs`

### `percentile(values, q)`

```
返回：number
```

**不变量**
1. **最近秩法**：`sorted[ceil(q * n) - 1]`，不插值。取索引时夹在 `[0, n-1]`。
2. 空数组返回 0。
3. `q` 为 0.5 且 `n` 为偶数时，结果是"中间两个的**较小**者"（例如 `[10,20,30,40]` 取 20）——这是 `ceil(q*n)-1` 的直接结果，不插值。

### `noiseFloor(runs)`

```
runs: number[]        // **同一配置**的多次运行结果
返回：number          // 2 × 样本标准差（除以 n-1）
```

**不变量**
1. `n < 2` 时返回 0。
2. 用**样本标准差**（分母 `n - 1`），乘以 2。
3. 等值数组返回 0。

### `sampleSize(opts)`

```
opts = { baselineRate: number, targetDelta: number }
返回：{ tasks: number }
```

**不变量**
1. 用这个公式（契约写死，便于核对）：`tasks = ceil(2 * 1.96² * p * (1 - p) / delta²)`，其中 `p = baselineRate`、`delta = targetDelta`。
2. `delta <= 0` 或 `p <= 0` 或 `p >= 1` → 抛错（信息含「参数」）。
3. **单调性**：`delta` 变小 → `tasks` 变大（判据用两组输入核对）。

### `bootstrapCI(samples, opts)`

```
opts = { level = 0.95, iters = 1000, seed = 1 }
返回：{ lo: number, hi: number }
```

**不变量**
1. 用**有放回重采样**（每次从 `samples` 抽 `samples.length` 个）算均值，取 `iters` 次，按分位数取 `lo` 与 `hi`（下尾 `(1-level)/2`、上尾 `1-(1-level)/2`）。
2. **同一个 `seed` 两次调用返回相同结果**（判分器会核对）。
3. `lo <= hi`；两者都应落在 `[min(samples), max(samples)]` 的宽松范围内。
4. 空数组或单元素数组 → 抛错（信息含「样本」）。

### `compare(a, b, opts)`

```
opts = { level = 0.95, iters = 1000, seed = 1 }
返回：{ delta, ciA, ciB, significant, effectSize, n }
```

**不变量**
1. `delta = mean(b) - mean(a)`。
2. `ciA` 与 `ciB` 来自 `bootstrapCI`（同一个 `seed`）。
3. **`significant` 的定义是"两个区间不重叠"**：`!overlap`。**重叠时必须为 `false`**（这是这一卷最重要的一条判据）。
4. `effectSize = delta / pooledSd`，其中 `pooledSd = sqrt((varA + varB) / 2)`（样本方差）；`pooledSd === 0` 时 `effectSize` 为 0。
5. `n` 为两个数组的长度之和。

---

## Part D · `kit/src/experiment.mjs`

### `planExperiment(spec)`

```
spec = { baselineRate, targetDelta, runs = 3, costPerTask }
返回：{ tasks, runs, totalRuns, costEstimate, seeds }
```

**不变量**
1. `tasks` 由 `sampleSize` 得到（与 Part C 的公式一致）。
2. `totalRuns === tasks * runs`。
3. **`costEstimate === totalRuns * costPerTask`**（成本是乘法的：任务数 × 重复 × 每任务成本）。
4. `seeds` 是长度等于 `runs` 的数组，且元素互不相同。

### `planAblation(component)`

```
component = { name: string, neutral?: string }
返回：{ component, neutral, integrity: string[], steps: string[] }
```

**不变量**
1. `neutral` 缺失或为空 → 抛错（信息含「中性」）。**消融不是"删掉"，而是换一个中性替代**。
2. `integrity` 至少一项（需要核对"其余因素未变"的项）。
3. `steps` 至少三步，且含"改前"与"改后"的测量（判据只核对关键词「改前」「改后」都出现）。

### `buildReport(record, result, conclusion)`

```
record = { bench: { name, version, checksum }, code: { commit, config, profile }, seeds: [], env: { deps, model, external } }
result = { perTask: [], summary: {} }
conclusion = { detected: boolean, note: string, resolution?: string }
返回：{ problem, bench, runs, results, conclusion, limits }
```

**不变量**
1. 返回的六个键都存在且非空：`problem`、`bench`、`runs`、`results`、`conclusion`、`limits`。
2. **`conclusion.detected === false` 时，必须给出 `resolution`**（非空），否则抛错（信息含「分辨率」）。理由：读者要能判断这是"确实无效"还是"测不出来"。
3. `bench` 来自 `record.bench`，`runs` 来自 `record`（含四项记录）。
4. `limits` 至少一项（本次实验没有覆盖的部分）。

### `isReproducible(record)`

```
返回：{ ok: boolean, missing: string[] }
```

**不变量**
1. 检查四项：`bench`（含 `name`、`version`、`checksum`）、`code`（含 `commit`、`config`、`profile`）、`seeds`（非空数组）、`env`（含 `deps`、`model`、`external`）。
2. `missing` 的每一项是一个**点路径**（例如 `bench.checksum`、`env.model`），按字典序排序。
3. `ok === missing.length === 0`。
4. **`env.model` 缺失必须被报出来**（它是最容易被忽略的一项）。

---

## 附：判分器如何调用你的实现

```js
const impl = await import(process.env.IMPL ?? '../kit/src/stats.mjs')
const r = impl.compare([0.7, 0.72, 0.71], [0.90, 0.91, 0.89], { seed: 7 })
assert(r.significant === true, '差异很大且区间不重叠时应当显著')
```

**这意味着**：函数必须是具名导出；抛错用 `throw`；不要依赖模块级可变状态。
