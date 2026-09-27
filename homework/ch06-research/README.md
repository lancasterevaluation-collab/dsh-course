# 大作业六 · 科研出口

> **从这里开始读**：[`作业引导.md`](作业引导.md)。本文件只是索引。
>
> 覆盖讲义：第 6 卷的 3 篇（`6.1` 到 `6.3`）。
> **与其他五个大作业的差别**：前五个是给系统加能力，**这一个是一次实验**。

---

## 目录结构

```
ch06-research/
├── 作业引导.md                 ← 说明书（十五节；第十四节要求你真的做一次实验）
├── README.md                   ← 本文件
├── kit/
│   ├── CONTRACT.md             ← 接口契约（四个 Part 的完整定义）
│   ├── src/
│   │   ├── stats.mjs           ← Part C：统计（5 个函数）
│   │   └── experiment.mjs      ← Part D：实验设计与报告（4 个函数）
│   ├── problems/               ← Part A/B 的题目与模板
│   ├── answers/                ← 你写答案的位置
│   └── writeup.md              ← 设计说明 + "我的实验"一节
├── tests/                      ← 测试与汇总（不要改）
└── grade/                      ← 判分器、参考答案与负向验证（做完再看）
```

---

## 快速开始

```bash
cd ch06-research
node tests/run.mjs
cp kit/problems/a-problems.template.json kit/answers/a-problems.json
cp kit/problems/b-observations.template.json kit/answers/b-observations.json
node tests/t1-problems.mjs --answers kit/answers/a-problems.json
node tests/t2-observations.mjs --answers kit/answers/b-observations.json
node tests/t3-stats.mjs
node tests/t4-experiment.mjs
```

---

## 四个 Part

| Part | 类型 | 交付物 | 权重 | 主要判据 |
|---|---|---|---|---|
| A | 分析 | `answers/a-problems.json` | 25 | 8 条分界 + 5 条三要素 + 4 条决策影响 |
| B | 分析 | `answers/b-observations.json` | 20 | 6 条观察 + 4 条排除 + 3 条最小反例 |
| C | 构建 | `src/stats.mjs` | **30** | 14 条（含噪声下限、可复现重采样、区间重叠即不显著） |
| D | 构建 | `src/experiment.mjs` | 25 | 13 条（含中性替代、分辨率、四项记录） |

**总分 100。** C 最重：**统计判据决定一个结论能不能被信任**。

---

## 这一卷的特点：判据在核对"结论有没有被噪声解释掉"

- **噪声下限必须用同一配置的多次运行**估计（不是两个方法各自的方差——那会把真实差异算进噪声）；
- **同一种子必须可复现**（判分器连调两次核对）；
- **区间重叠时必须判为不显著**（这是这一卷最重要的一条判据）；
- **样本量随目标差异变小而迅速上升**（20 个任务只能发现约 30 个百分点的差异）；
- **"未检出差异"必须带分辨率**（否则读者无法判断是"确实无效"还是"测不出来"）。

**如果你的统计实现"总能发现显著差异"，先去看 `compare` 里的区间重叠判断。**

---

## 判分与自查

```bash
node tests/run.mjs
node grade/negative-check.mjs
IMPL_TEMPLATE=../grade/{name}.reference.mjs \
A_ANSWERS=grade/a-problems.example.json \
B_ANSWERS=grade/b-observations.example.json \
node tests/run.mjs
```

---

## 起点与验证基线

| 场景 | 结果 |
|---|---|
| 起点（未作答、实现抛错） | **0 / 100** |
| 参考答案 | **100 / 100** |
| 判分器鉴别力 | **4 / 4 类错误被抓住** |

---

## 与讲义的关系

| Part | 讲义 | 最相关的小节 |
|---|---|---|
| A | 6.1 | 三条分界判据、三要素、测量手段的稀缺性 |
| B | 6.3 | 三类落差、转化四步、排除三方式、最小反例 |
| C | 6.2 | 响应的尺度、样本量与分辨率、多重比较 |
| D | 6.2 | 基准的性质、消融的中性替代、可复现四项 |

---

## 做完之后

**做第十四节那件事**：用你在前面大作业里写过的实现跑一个基准与一次消融，把结论与分辨率写进 `writeup.md`。

那是整门课程的最后一个动作：**从做出一个系统，走到能对它的某个决定给出可检验的答案。**
