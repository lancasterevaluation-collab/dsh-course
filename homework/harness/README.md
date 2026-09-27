# 主线：一个能跑的最小 harness

这是**六个大作业共用的一条主线**。每一卷的作业都在这条线的基础上加一层能力，而它自己也保持可运行——你随时可以在这里跑一次真实任务，看当前这层能力在端到端流程里的表现。

## 模块表

模块按卷分层。每个模块的**契约**（它必须保证什么、不必保证什么）写在对应工作区的 `kit/CONTRACT.md` 里。

| 卷 | 模块 | 职责 | 契约来源 |
|---|---|---|---|
| 第 2 卷 | `lib/llm.mjs` | provider 抽象、消息结构、错误分类与参数解析 | `ch02-loop/kit/CONTRACT.md` |
| 第 2 卷 | `lib/tools.mjs` | 工具契约、注册表、参数校验、结果截断、路径防线 | `ch02-loop/kit/CONTRACT-tools.md` |
| 第 3 卷 | `lib/context.mjs` | 上下文压缩与溢出处置 | `ch03-reliability/kit/CONTRACT.md` |
| 第 3 卷 | `lib/metrics.mjs` | 用量、延迟与成本的可观测 | 同上 |
| 第 3 卷 | `lib/persist.mjs` | 持久化与恢复 | 同上 |
| 第 3 卷 | `lib/proc.mjs` | 子进程与后台作业 | 同上 |
| 第 4 卷 | `lib/memory.mjs` | 有界记忆与检索 | `ch04-evolution/kit/CONTRACT.md` |
| 第 4 卷 | `lib/user-model.mjs` | 用户特征的置信度与更新 | 同上 |
| 第 4 卷 | `lib/evolution.mjs` | 提议、门控与回滚 | 同上 |
| 第 4 卷 | `lib/longhorizon.mjs` | 任务状态外部化与续作 | 同上 |
| 第 5 卷 | `lib/profile.mjs` | 模式与预设的装配 | `ch05-scale/kit/CONTRACT.md` |
| 第 5 卷 | `lib/session-registry.mjs` | 多会话的注册、配额与调度 | 同上 |
| 第 5 卷 | `lib/interaction.mjs` | 审批请求与权限判定 | 同上 |
| 第 5 卷 | `lib/delegation.mjs` | 派发协议、继承与回收 | 同上 |
| 第 6 卷 | `lib/stats.mjs` | 统计判据（噪声、区间、样本量） | `ch06-research/kit/CONTRACT.md` |
| 第 6 卷 | `lib/experiment.mjs` | 实验设计与报告 | 同上 |

## 缺口：第 2 卷内核的后半

主线目前缺 5 个模块——它们是讲义 2.3 到 2.7 的产物，现有工作区里还没有对应的起点与判分器。

| 待补模块 | 对应讲义 | 缺了它会怎样 |
|---|---|---|
| `lib/container.mjs` | 2.3 容器与依赖注入 | 模块无法被统一持有与撤销 |
| `lib/events.mjs` | 2.4 事件与扩展点 | 行为没有挂载点 |
| `lib/scope.mjs` | 2.5 作用域与隔离 | 多会话无法隔离 |
| `lib/compose.mjs` | 2.6 装配与配置组合 | 配置无法分层与复现 |
| `lib/session.mjs` | 2.7 会话日志与循环 | 没有端到端入口，其余模块无法被串起来 |

这 5 个模块补齐之前，`run.mjs` 只能跑通"模型层加工具"这一段。

## 怎么运行

跑一次任务（需要先补上 `lib/session.mjs` 与 `run.mjs` 的接线）。

```powershell
cd D:\dsh-course\homework
node harness/run.mjs "读一下 harness/README.md 并总结它的模块表"
```

单独试一个模块（不需要完整主线）。

```powershell
cd D:\dsh-course\homework\harness
node -e "import('./lib/tools.mjs').then(m => console.log(Object.keys(m)))"
```

## 与工作区的关系

- **这里的是完整参考实现**：每一卷的 `grade/*.reference.mjs` 是它的同源副本，因此"参考实现拿满分"这条基线与主线保持一致。
- **工作区的 `kit/` 是它的残缺版**：去掉该卷能力之后的快照，你要把它补回能跑的状态。
- **改了主线也要同步 `grade/`**：两者一旦分叉，"参考 100 分"这条基线就不再成立。

**要点小结**

- 主线在 `homework/harness/`，六个工作区是它在六个阶段的检查点。
- 模块按卷分层，每个模块的契约在同名工作区的 `kit/CONTRACT.md` 里。
- 现有 16 个模块已可导入；缺 5 个内核模块（2.3 到 2.7）。
- 主线与 `grade/` 同源，改动必须同步，否则基线失效。
