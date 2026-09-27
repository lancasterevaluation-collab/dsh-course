# Part A · 问题清单（题目）

> 对应讲义：`6.1 开放问题`。作答方式见 `../../../作业引导.md` 第六节。
>
> 把答案写进 `kit/answers/a-problems.json`（从 `a-problems.template.json` 复制）。

---

## 第一组：分界判据（8 条）

对每条给出 `kind`、`criterion`、以及 `missing`。

| kind | 含义 | 对应判据 |
|---|---|---|
| `engineering` | 放大十倍资源会解决 | `resource-test` |
| `open` | 缺一个**可以建立但尚未建立**的测量或方法 | `missing-measure` |
| `not-answerable` | 连"要测什么"都还没有共识 | `answer-shape` |

**`open` 与 `not-answerable` 的项必须给出非空 `missing`。**

**q1.** 检索的相关性权重是手工调的超参。

**q2.** 目标漂移无法自动检测。

**q3.** 单进程模型下，一条会话的 CPU 密集操作会阻塞其他会话。

**q4.** 任务状态是否过时，没有可靠的判别信号。

**q5.** 两条记忆是否矛盾，需要语义判断。

**q6.** 评估集只有 50 个任务，分辨不出小的改善。

**q7.** 如何判断一个公开基准是否已经被污染。

**q8.** 两个成本不同的方法之间，如何给出可比较的结论。

---

## 第二组：三要素（5 条）

把下面五个**模糊方向**各写成一个可检验的命题：

- `independent`：自变量，含 `name` 与 `values`（**至少两个取值**）；
- `dependent`：因变量，含 `name` 与 `instrument`（`check` / `human-label` / `model-judge`）；
- `baseline`：基准，含 `kind`（`ablation` / `comparison` / `sweep`）与 `what`。

**f1.** 怎么让系统更可靠。

**f2.** 怎么降低上下文成本。

**f3.** 怎么让 agent 更懂用户。

**f4.** 怎么让多 agent 协作更有效。

**f5.** 怎么让长任务不失控。

---

## 第三组：决策影响（4 条）

对每条给出 `ifA`、`ifB`（**两者必须不同**）与 `worthDoing`。

**p1.** "压缩阈值越高越好。"

**p2.** "记忆条数越多越好。"

**p3.** "子 agent 的并发数越高越好。"

**p4.** "系统提示词越长越好。"

---

## 判据与答案表（作答之后再看）

| 判据 | 权重 |
|---|---|
| 8 条分类与判据正确 | 10 |
| 5 条三要素齐全 | 10 |
| 4 条给出两种答案的不同行动 | 5 |

| id | kind | criterion | missing（要点） |
|---|---|---|---|
| q1 | engineering | resource-test | —（更多标注即可自动调参） |
| q2 | open | missing-measure | 漂移的可观测定义 |
| q3 | engineering | resource-test | —（换多进程即可） |
| q4 | open | missing-measure | 状态一致性的可观测定义 |
| q5 | open | missing-measure | 矛盾判定的可靠方法 |
| q6 | engineering | resource-test | —（扩大任务集即可） |
| q7 | not-answerable | answer-shape | "独立信号"本身没有共识 |
| q8 | open | missing-measure | 成本与质量的报告规范 |

**三处值得说明的地方**：

- **q1 与 q6 是工程难题**：它们缺的是数据与资源，而放大投入就会解决。
- **q2、q4、q5 是开放问题**：缺的是一个**可以建立**的测量或方法（标注数据集、一致性定义、矛盾判定方法）——它们可回答，只是现在没人建立。
- **q7 是"不可回答"**：连"什么算独立的信号"都没有共识，因此无从下手。**它与 `open` 的差别是：`open` 的缺失项是具体的，而它的缺失项是模糊的。**
