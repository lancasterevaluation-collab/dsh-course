# 大作业四 · 学习进化

> **从这里开始读**：[`作业引导.md`](作业引导.md)。本文件只是索引。
>
> 覆盖讲义：第 4 卷的 7 篇（`4.1` 到 `4.7`）。
> 前置：大作业三（可靠性与纵深）。**没有它也能做**，但 Part C 的溢出处理与 Part F 的状态管理会缺少可复用的部分。

---

## 目录结构

```
ch04-evolution/
├── 作业引导.md                 ← 说明书（十五节）
├── README.md                   ← 本文件
├── kit/
│   ├── CONTRACT.md             ← 接口契约（六个 Part 的完整定义）
│   ├── src/
│   │   ├── memory.mjs          ← Part C：记忆系统（4 个函数）
│   │   ├── user-model.mjs      ← Part D：用户模型（4 个函数）
│   │   ├── evolution.mjs       ← Part E：演化与门控（4 个函数）
│   │   └── longhorizon.mjs     ← Part F：长程与复盘（4 个函数）
│   ├── problems/               ← Part A/B 的题目与模板
│   ├── answers/                ← 你写答案的位置
│   └── writeup.md              ← 设计说明
├── tests/                      ← 测试与汇总（不要改）
└── grade/                      ← 判分器、参考答案与负向验证（做完再看）
```

---

## 快速开始

```bash
cd ch04-evolution
node tests/run.mjs                                   # 起点分数（六个 Part 全 0）
cp kit/problems/a-memory.template.json kit/answers/a-memory.json
cp kit/problems/b-diagnosis.template.json kit/answers/b-diagnosis.json
node tests/t1-memory-policy.mjs --answers kit/answers/a-memory.json
node tests/t2-diagnosis.mjs --answers kit/answers/b-diagnosis.json
node tests/t3-memory.mjs                             # 每填完一个函数跑一次
```

---

## 六个 Part

| Part | 类型 | 交付物 | 权重 | 主要判据 |
|---|---|---|---|---|
| A | 分析 | `answers/a-memory.json` | 15 | 12 个写入判定 + 6 条技能描述 + 2 个有界处置 |
| B | 分析 | `answers/b-diagnosis.json` | 15 | 9 个失败分类 + 至少两个候选 + 5 条改写 |
| C | 构建 | `src/memory.mjs` | 20 | 14 条（含抑制过滤、阈值、整条跳过、先合并） |
| D | 构建 | `src/user-model.mjs` | 15 | 13 条（含归零删除、反驳不创建、不暴露 weight） |
| E | 构建 | `src/evolution.mjs` | 15 | 13 条（**其中五条是"必须被拒绝"**） |
| F | 构建 | `src/longhorizon.mjs` | 20 | 14 条（含 goal 不可变、过时警告、覆盖率门控） |

**总分 100。**

---

## 这一卷的特点：一半的判据在检验"拒绝"

前三卷的判据大多在检验"做对了吗"；**这一卷有一半在检验"该拒绝的时候拒绝了吗"**：

- 写入的三个过滤器要**挡住**不该记的；
- 检索的阈值要**返回空**而不是硬凑；
- 注入预算不足时要**跳过整条**；
- 门控要**拒绝**元控制对象、过期基线、噪声范围内的"改善"、护栏退化；
- 覆盖率低时要**停止新增产出**。

**如果你的实现总是"答应"，分数会很低**——而这正是这一卷想让你体会的东西。

---

## 判分与自查

```bash
node tests/run.mjs
node grade/negative-check.mjs
IMPL_TEMPLATE=../grade/{name}.reference.mjs \
A_ANSWERS=grade/a-memory.example.json \
B_ANSWERS=grade/b-diagnosis.example.json \
node tests/run.mjs          # 参考答案应当满分
```

**判分器的运行方式**：测试通过 `IMPL`（单个文件）或 `IMPL_TEMPLATE`（含 `{name}` 占位，一次覆盖四个构建题）导入被测实现。你的实现与参考答案跑同一套测试，因此**参考答案不满分说明测试有问题**（那时应当报告，而不是改测试）。

---

## 起点与验证基线

| 场景 | 结果 |
|---|---|
| 起点（未作答、实现抛错） | **0 / 100** |
| 参考答案 | **100 / 100** |
| 判分器鉴别力 | **4 / 4 类错误被抓住**（四类都是"该拒绝时没拒绝"） |

---

## 与讲义的关系

| Part | 讲义 | 最相关的小节 |
|---|---|---|
| A | 4.1、4.2 | 写入的三个过滤器、技能的触发条件与不适用条件 |
| B | 4.4 | 失败三类、候选收集、可行动性 |
| C | 4.1 | 检索三种信号、注入双预算、有界策略 |
| D | 4.3 | 置信度、更新与回路、边界 |
| E | 4.5 | 提议形态、门控、元控制 |
| F | 4.7、4.6 | 八个字段、续作、目标冻结、产出跟踪 |

---

## 做完之后

1. 填完 `kit/writeup.md`；
2. 跑自查五条（见引导第十四节）；
3. 下一个大作业是 `ch05-scale`（规模化与交互）——它会用到这一卷的产物：**模式（profile）的状态管理复用 Part F 的外部化手法**，而**权限预设的来源分层复用 Part E 的门控思路**。
