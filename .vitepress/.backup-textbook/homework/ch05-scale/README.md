# 大作业五 · 规模化与交互

> **从这里开始读**：[`作业引导.md`](作业引导.md)。本文件只是索引。
>
> 覆盖讲义：第 5 卷的 4 篇（`5.1` 到 `5.4`）。
> 前置：大作业三（可靠性）与大作业四（学习进化）。**没有它们也能做**，但 Part C 的能力集校验与 Part F 的边界设计会缺少可对照的写法。

---

## 目录结构

```
ch05-scale/
├── 作业引导.md                 ← 说明书（十五节）
├── README.md                   ← 本文件
├── kit/
│   ├── CONTRACT.md             ← 接口契约（六个 Part 的完整定义）
│   ├── src/
│   │   ├── profile.mjs         ← Part C：模式与预设（4 个函数）
│   │   ├── session.mjs         ← Part D：多会话与并发（4 个函数）
│   │   ├── interaction.mjs     ← Part E：交互与权限（3 个函数）
│   │   └── delegation.mjs      ← Part F：派发与外部工具（4 个函数）
│   ├── problems/               ← Part A/B 的题目与模板
│   ├── answers/                ← 你写答案的位置
│   └── writeup.md              ← 设计说明
├── tests/                      ← 测试与汇总（不要改）
└── grade/                      ← 判分器、参考答案与负向验证（做完再看）
```

---

## 快速开始

```bash
cd ch05-scale
node tests/run.mjs                                   # 起点分数（六个 Part 全 0）
cp kit/problems/a-profile.template.json kit/answers/a-profile.json
cp kit/problems/b-delegation.template.json kit/answers/b-delegation.json
node tests/t1-profile-policy.mjs --answers kit/answers/a-profile.json
node tests/t2-delegation-policy.mjs --answers kit/answers/b-delegation.json
node tests/t3-profile.mjs                            # 每填完一个函数跑一次
```

---

## 六个 Part

| Part | 类型 | 交付物 | 权重 | 主要判据 |
|---|---|---|---|---|
| A | 分析 | `answers/a-profile.json` | 15 | 10 条隐式默认 + 6 组合并 + 4 条后果描述 |
| B | 分析 | `answers/b-delegation.json` | 15 | 6 份派发协议 + 4 条信任边界 |
| C | 构建 | `src/profile.mjs` | 20 | 14 条（含数组整体替换、间接依赖、整体切换） |
| D | 构建 | `src/session.mjs` | 20 | 14 条（含配额顺序、轮转公平、租约超时、先取消后释放） |
| E | 构建 | `src/interaction.mjs` | 15 | 13 条（含拒绝不可被放宽、三信号合取） |
| F | 构建 | `src/delegation.mjs` | 15 | 13 条（含不可提权、未识别错误不重试） |

**总分 100。**

---

## 这一卷的特点：失败只在"多个东西同时跑"时出现

前几卷的判据大多在单份输入上成立；**这一卷的判据会构造两份或更多的输入**，并核对它们**互不影响**：

- Part C：两个模式切换后**没有残留**；
- Part D：两条会话**并发与单跑结果一致**、一条异常**不终止另一条**、两条会话争抢同一工作区时**只有一条拿到写租约**；
- Part E：多个授权来源同时生效时，**返回的是优先级最高的那个结论**；
- Part F：两个外部工具的错误**各自被归一化**，未识别的那个**不进入重试**。

如果你的实现在单份输入下正确、在两份输入下出错，那多半是**共享了不该共享的可变状态**。

---

## 判分与自查

```bash
node tests/run.mjs
node grade/negative-check.mjs
IMPL_TEMPLATE=../grade/{name}.reference.mjs \
A_ANSWERS=grade/a-profile.example.json \
B_ANSWERS=grade/b-delegation.example.json \
node tests/run.mjs          # 参考答案应当满分
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
| A | 5.1、5.3 | 覆盖顺序与合并规则、消灭隐式默认、呈现的三条规则 |
| B | 5.4 | 派发协议四要素、信任边界四维度 |
| C | 5.1 | 启动校验、切换与会话 |
| D | 5.2 | 配额、调度、租约、回收 |
| E | 5.3 | 请求结构、权限预设、来源分层 |
| F | 5.4 | 子 agent 与继承、结果回收、外部接入 |

---

## 做完之后

1. 填完 `kit/writeup.md`；
2. 跑自查五条（见引导第十四节）；
3. 最后一个大作业是 `ch06-research`（科研出口）——**它不是构建题**，而是把前五个大作业的产物变成一次可复现的实验：一个基准、一次消融、一份报告。
