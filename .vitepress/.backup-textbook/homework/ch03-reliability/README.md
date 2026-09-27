# 大作业三 · 可靠性与纵深

> **从这里开始读**：[`作业引导.md`](作业引导.md)。本文件只是索引。
>
> 覆盖讲义：第 3 卷的 6 篇（`3.1` 到 `3.6`）。
> 前置：大作业一（判断力）与大作业二（最小闭环）。**没有前者也能做，但会在契约与调试上更吃力。**

---

## 目录结构

```
ch03-reliability/
├── 作业引导.md                 ← 说明书（十五节）：做什么、怎么判、常见错误
├── README.md                   ← 本文件
├── kit/
│   ├── CONTRACT.md             ← 接口契约（六个 Part 的完整定义，判分依据）
│   ├── src/                    ← 四个构建 Part 的起点（每个函数都有 TODO）
│   │   ├── context.mjs         ← Part C：压缩与溢出（4 个函数）
│   │   ├── proc.mjs            ← Part D：进程与作业（3 个函数，含真跑进程）
│   │   ├── persist.mjs         ← Part E：持久化与恢复（2 个函数）
│   │   └── metrics.mjs         ← Part F：可观测（4 个函数）
│   ├── problems/               ← Part A/B 的题目与作答模板
│   ├── answers/                ← 你写答案的位置（初始只有 .gitkeep）
│   └── writeup.md              ← 设计说明（三处取舍 + 最弱一处）
├── tests/                      ← 测试与汇总（不要改）
└── grade/                      ← 判分器、参考答案与负向验证（做完再看）
```

---

## 快速开始

```bash
cd ch03-reliability

# 1. 看起点有多低（四个构建 Part 都抛错，因此分数很低）
node tests/run.mjs

# 2. 做 Part A/B（分析题）：复制模板后填写
cp kit/problems/a-retry.template.json kit/answers/a-retry.json
cp kit/problems/b-guard.template.json kit/answers/b-guard.json

# 3. 检查分析题
node tests/t1-retry.mjs --answers kit/answers/a-retry.json
node tests/t2-guard.mjs --answers kit/answers/b-guard.json

# 4. 做构建题：填 kit/src/ 下的四个文件，每填一个跑一次
node tests/t3-context.mjs
node tests/t4-proc.mjs
node tests/t5-persist.mjs
node tests/t6-metrics.mjs
```

---

## 六个 Part

| Part | 类型 | 交付物 | 权重 | 主要判据 |
|---|---|---|---|---|
| A | 分析 | `kit/answers/a-retry.json` | 15 | 12 个分类 + 3 个策略 + 2 个反例 |
| B | 分析 | `kit/answers/b-guard.json` | 15 | 10 条规则 + 3 个策略 |
| C | 构建 | `kit/src/context.mjs` | 15 | 12 条（含阈值等于、范围不足、溢出指针） |
| D | 构建 | `kit/src/proc.mjs` | 20 | 14 条（含真实进程的超时、取消、大输出） |
| E | 构建 | `kit/src/persist.mjs` | 20 | 13 条（含四类损坏、幂等、等价恢复） |
| F | 构建 | `kit/src/metrics.mjs` | 15 | 12 条（含缺失字段、空集合、四段求和） |

**总分 100。**

---

## 判分与自查

```bash
node tests/run.mjs                              # 总分与每一项的明细
node grade/negative-check.mjs                    # 判分器的鉴别力（必须 4/4 抓到）
IMPL=../grade/context.reference.mjs node tests/t3-context.mjs   # 参考答案应当满分
```

**判分器的运行方式**：测试通过 `IMPL` 环境变量导入被测实现（默认 `kit/src/<name>.mjs`），因此**你的实现与参考答案用同一套测试**。这条设计有两个推论：

- 如果参考答案不满分，说明测试本身有问题——**那时应当报告，而不是改测试**；
- 你可以在本地随时用参考答案对照自己的输出（**但建议先自己试**，见引导的附录）。

---

## 起点分数与验证基线

三组实测数据（判分设施建好时跑过一次，你可以自己复现）：

| 场景 | 命令 | 结果 |
|---|---|---|
| 起点（未作答、实现抛错） | `node tests/run.mjs` | **0 / 100** |
| 参考答案（六个 Part 全对） | `IMPL_TEMPLATE=../grade/{name}.reference.mjs A_ANSWERS=grade/a-retry.example.json B_ANSWERS=grade/b-guard.example.json node tests/run.mjs` | **100 / 100** |
| 判分器鉴别力 | `node grade/negative-check.mjs` | **4 / 4 类错误被抓住** |

**在动手之前先跑一次第一行，记下起点分数**（它是 0）。这个数字的作用是给你一条基线：**做完之后回看它，你能说出每一分是怎么挣来的**。

### 一条已知的平台局限（如实记录）

Part D 的判据 D3（超时后终止整棵进程树）在 **Windows 上比 POSIX 弱**：如果实现只终止 shell 而不终止整棵进程树，Windows 会因为"关闭共享控制台"这条副作用连带终止子进程，于是它与正确实现表现相同。测试里已经让孙进程 `detached`（独立控制台）以减少这条副作用，但它仍不能保证稳定区分。

**处置**：这一条判据在 **POSIX 上是准确的**；负向验证里 Part D 的代表性错误因此改用"超时后完全不终止"（它在任何平台上都可区分）。这条局限本身是讲义 3.4 的 1.4 里"平台差异必须如实暴露而不是假装两端一致"的一次实践。

---

## 与讲义的关系

六个 Part 与六篇讲义一一对应，而**每个 Part 的判据都能在对应讲义里找到来源**：

| Part | 讲义 | 判据的来源 |
|---|---|---|
| A | 3.1 | 1.2 三类错误的判断、1.5 幂等键 |
| B | 3.2 | 1.1 风险分级的依据、1.5 记住的粒度 |
| C | 3.3 | 1.3 触发条件、1.5 溢出的三段式 |
| D | 3.4 | 1.4 取消的三层、1.6 输出背压 |
| E | 3.5 | 1.2 三步恢复、1.6 原子写 |
| F | 3.6 | 1.3 三档成本、1.4 延迟分解 |

**卡住时的第一反应应当是翻对应小节**，而不是读测试。测试告诉你"哪一条不过"，而讲义告诉你"为什么要那一条"。

---

## 做完之后

1. 填完 `kit/writeup.md`（三处设计取舍 + 最弱一处）；
2. 跑一遍第十四节的自查五条；
3. 如果需要继续，下一个大作业是 `ch04-evolution`（学习进化）——**它会用到这个大作业的产物**：压缩与溢出（Part C）在记忆的注入预算里被复用，恢复（Part E）在记忆的持久化里被复用，度量（Part F）在复盘的产出台账里被复用。
