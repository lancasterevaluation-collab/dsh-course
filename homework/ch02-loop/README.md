# 第 2 卷 · 最小闭环 · 工作区索引

> | | |
> |---|---|
> | **对应讲义** | [`../../02-最小闭环/`](../../02-最小闭环/)（2.1–2.7，共 7 篇） |
> | **作业引导** | [`作业引导.md`](作业引导.md) —— **从这里开始**，它说明每一步该做什么、做完该看到什么 |
> | **你改的地方** | `kit/`（只有这里） |
> | **判分器** | `tests/`（不要改） |
> | **参考答案与解析** | `grade/`（不要改，建议做完再看） |
> | **本卷目标** | 做出一个能对话、能用工具、能装配自己、能记录历史的系统 |
> | **当前进度** | 2.1–2.7 的讲义已全部写完；2.1 与 2.2 的作业（作答、构建题、判分器）已就绪；2.3–2.7 的作答模板与判分器待建 |

这份文件是工作区索引。**"我现在该做什么、为什么这一步必要、卡住了说明什么"写在 [`作业引导.md`](作业引导.md) 里**，两者分开是因为更新频率不同——索引随目录结构变，引导随教学意图变。

---

## 一、工作区布局

```
  ch02-loop/
  ├── 作业引导.md            ← 唯一的"我现在该做什么"入口
  ├── README.md              ← 你在读的这份（目录、跑法、判分项、进度）
  ├── kit/                   ← 你的工作区（只改这里）
  │   ├── answers/           作答（每篇一份）
  │   ├── problems/          题面与作答模板
  │   ├── src/               构建题的实现（llm.mjs、tools.mjs、echo-demo.mjs…）
  │   ├── CONTRACT.md        2.1 构建题的契约（依据，不许改）
  │   ├── CONTRACT-tools.md  2.2 构建题的契约
  │   └── writeup.md         推理报告
  ├── tests/                 ← 判分器（不要改）
  │   ├── run.mjs            总入口
  │   ├── t1-llm.mjs         2.1 客观题
  │   ├── t2-build.mjs       2.1 构建题
  │   ├── t3-tools.mjs       2.2 客观题
  │   └── t4-build.mjs       2.2 构建题
  └── grade/                 ← 参考答案与解析
      ├── a1.example.json / a2.example.json
      ├── llm.reference.mjs / tools.reference.mjs
      └── negative-check.mjs / negative-check-tools.mjs
```

判分器与工作区分开是刻意的：判分器不许改是评分可信的前提，工作区必须改是学习发生的前提。

---

## 二、怎么跑判分

```powershell
cd D:\dsh-course\homework\ch02-loop

node tests/run.mjs                       # 全部，折算总分
node tests/run.mjs --only t3             # 只跑某一项（前缀匹配）
node tests/run.mjs --verbose             # 打印单项的完整输出

node tests/t1-llm.mjs   --answers kit/answers/a1-llm.json --verbose
node tests/t3-tools.mjs --answers kit/answers/a2-tools.json --verbose
node tests/run.mjs --answers-a2 kit/answers/a2-tools.json   # 指定 2.2 的答卷

node tests/t2-build.mjs                  # 2.1 构建题
node tests/t4-build.mjs                  # 2.2 构建题

# 换参考答案跑（确认判分器是好的）
$env:IMPL='../grade/llm.reference.mjs'; node tests/t2-build.mjs; Remove-Item Env:\IMPL
$env:IMPL_TOOLS='../grade/tools.reference.mjs'; node tests/t4-build.mjs; Remove-Item Env:\IMPL_TOOLS

node grade/negative-check.mjs            # 2.1 判分器的鉴别力
node grade/negative-check-tools.mjs      # 2.2 判分器的鉴别力
node kit/src/echo-demo.mjs               # 零改动注册（第二层验证）
```

`IMPL` 与 `IMPL_TOOLS` 的基准目录都是 `tests/`，所以路径写成 `../grade/...`。两个变量名不同，因为它们指向不同的文件。

---

## 三、判分项与权重

| 判分项 | 本卷权重 | 满分口径 | 对应讲义 |
|---|---|---|---|
| `t1` 2.1 客观题 | 24 | 80（接口宽度 36、错误分类 24、术语 20） | 2.1 |
| `t2` 2.1 构建题 | 6 | 160（十六条契约用例，每例跑三十次） | 2.1 |
| `t3` 2.2 客观题 | 24 | 80（给模型看的那部分 36、副作用等级 24、术语 20） | 2.2 |
| `t4` 2.2 构建题 | 6 | 278（十六例组加静态检查，每例跑三十次） | 2.2 |
| `t5`–`t10` 2.3–2.7 | 剩余 40 | 待建 | 2.3–2.7 |

总入口先把每一项归一到百分制，再按上表权重折算，因此单项判分器的满分不同不影响它在总分的占比。判分器会把尚未建立的项如实列出，不会当成通过。

---

## 四、当前进度

| 讲义 | 产物 | 判分项 | 状态 |
|---|---|---|---|
| 2.1 模型层 | `answers/a1-llm.json` ＋ `src/llm.mjs` | t1、t2 | 讲义与作业就绪 |
| 2.2 工具系统 | `answers/a2-tools.json` ＋ `src/tools.mjs` | t3、t4 | 讲义与作业就绪 |
| 2.3 容器与依赖注入 | `answers/a3-container.json` ＋ `src/context.mjs` | t5、t6 | 讲义已写；作答模板与判分器待建 |
| 2.4 事件与扩展点 | `answers/a4-events.json` | t7 | 讲义已写；作答模板与判分器待建 |
| 2.5 作用域与隔离 | `answers/a5-scope.json` | t8 | 讲义已写；作答模板与判分器待建 |
| 2.6 装配与配置组合 | `answers/a6-config.json` | t9 | 讲义已写；作答模板与判分器待建 |
| 2.7 会话日志与循环 | `answers/a7-session.json` ＋ `src/session.mjs` | t10 | 讲义已写；作答模板与判分器待建 |

---

## 五、与讲义的对应

| 讲义 | 对应的作答与产物 | 做完之后你会知道 |
|---|---|---|
| [2.1 模型层](../../02-最小闭环/2.1-模型层.md) | `answers/a1-llm.json` ＋ `src/llm.mjs` | 接口够不够窄、错误该怎么按"遇到它该怎么办"分类 |
| [2.2 工具系统](../../02-最小闭环/2.2-工具系统.md) | `answers/a2-tools.json` ＋ `src/tools.mjs` | 给模型看的那部分写得好不好、一个操作有多危险 |
| [2.3 容器与依赖注入](../../02-最小闭环/2.3-容器与依赖注入.md) | `answers/a3-container.json` ＋ `src/context.mjs` | 谁持有零件、谁负责撤销、什么时候可以调用 |
| 2.4 事件与扩展点 | `answers/a4-events.json` | 行为该挂在哪里、短路与顺序怎么约定 |
| 2.5 作用域与隔离 | `answers/a5-scope.json` | 同一进程里两组部件如何各见不同世界 |
| 2.6 装配与配置组合 | `answers/a6-config.json` | 配置的分层与覆盖语义 |
| 2.7 会话日志与循环 | `answers/a7-session.json` ＋ `src/session.mjs` | 为什么"模型可见的必须可重建"是产品要求 |

建议"读一篇讲义，做一份对应的作答"，因为这一卷的七篇之间有依赖顺序（模型层最独立，会话日志依赖前面全部），跳着读会让后面的依赖关系变得难以理解。
