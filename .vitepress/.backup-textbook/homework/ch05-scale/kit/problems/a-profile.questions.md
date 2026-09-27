# Part A · 模式与审批的分析（题目）

> 对应讲义：`5.1 模式与预设`、`5.3 交互与权限`。作答方式见 `../../../作业引导.md` 第六节。
>
> 把答案写进 `kit/answers/a-profile.json`（从 `a-profile.template.json` 复制）。

---

## 第一组：隐式默认排查（10 项）

对每一项给出三样：

- `verdict`：`reproducible`（显式写在某一层，跨机器跨版本一致）或 `environment-dependent`（由代码常量或环境推断决定）；
- `reason`：依据（写明是哪一层写的，还是由代码/环境决定）；
- `action`：`keep`（保留）、`make-explicit`（在声明里写出来）、`move-to-generation`（移到部署脚本的生成阶段）。

**一条硬性约束**：`verdict === 'environment-dependent'` 的项，`action` **不得是 `keep`**——由**环境推断**（进程环境、机器规格）的决定 `move-to-generation`，由**代码内建默认**的决定 `make-explicit`。两者的差别是：前者的取值取决于运行环境，后者取决于代码版本。

---

**d1.** 项目级配置里显式写着 `concurrency: 8`。

**d2.** 并发数由代码读 `os.cpus().length` 决定。

**d3.** 用户级配置里显式写着 `timeoutMs: 60000`。

**d4.** 工作目录由 `process.cwd()` 决定。

**d5.** `maxTokens: 4096` 是插件的内建默认，**没有任何一层写出它**。

**d6.** 代理地址读 `process.env.HTTP_PROXY`。

**d7.** 项目级配置里显式写着 `model: 'deepseek-chat'`。

**d8.** `retry.maxAttempts: 3` 是插件的内建默认，**没有写出**。

**d9.** 用户级配置里显式写着 `shell: '/bin/bash'`。

**d10.** 缓存目录由 `os.tmpdir()` 决定。

---

## 第二组：合并结果（6 组）

对每组给出**合并后的有效值**与**每个键来自哪一层**。

- 对象深合并（一层）；**数组整体替换**。
- 嵌套值的来源用**点路径**（例如 `retry.n`）。

**g1.** 内建 `{ concurrency: 4 }` ← 用户级 `{ concurrency: 8 }`

**g2.** 内建 `{ timeoutMs: 30000 }` ← 项目级 `{ timeoutMs: 60000 }`

**g3.** 内建 `{ tools: ['a', 'b'] }` ← 用户级 `{ tools: ['c'] }`

**g4.** 内建 `{ retry: { n: 3, backoff: 1000 } }` ← 用户级 `{ retry: { n: 5 } }`

**g5.** 内建 `{ a: 1, b: 2 }` ← 项目级 `{ b: 3 }` ← 运行参数 `{ a: 9 }`

**g6.** 内建 `{ tags: ['x'] }` ← 项目级 `{ tags: ['y', 'z'] }` ← 运行参数 `{ tags: [] }`

---

## 第三组：审批呈现（4 条）

对每条给出 `text`（改写后的后果描述）与 `risk`（风险档位）。

**三条硬性检查**：不含反引号、不含 `rm`/`mv`/`cp`/`chmod`/`curl`/`git push`、含「可恢复」或「不可恢复」之一。

**c1.** 草稿："执行 `rm -rf build/`"

**c2.** 草稿："运行 `npm install left-pad`"

**c3.** 草稿："读取 `src/index.ts`"

**c4.** 草稿："执行模型生成的命令"

---

## 判据与答案表（作答之后再看）

| 判据 | 权重 |
|---|---|
| 10 条排查正确（verdict 与 action） | 7 |
| 6 组合并结果与来源正确 | 5 |
| 4 条后果描述通过三条检查且风险正确 | 3 |

| id | verdict | action | 依据 |
|---|---|---|---|
| d1 | reproducible | keep | 项目级显式写出 |
| d2 | environment-dependent | move-to-generation | 代码按机器推断 |
| d3 | reproducible | keep | 用户级显式写出 |
| d4 | environment-dependent | move-to-generation | 由运行位置决定 |
| d5 | environment-dependent | make-explicit | 内建默认会随版本变；写出来才可审查 |
| d6 | environment-dependent | move-to-generation | 读环境变量 |
| d7 | reproducible | keep | 项目级显式写出 |
| d8 | environment-dependent | make-explicit | 内建默认 |
| d9 | reproducible | keep | 用户级显式写出 |
| d10 | environment-dependent | move-to-generation | 由运行环境决定 |

| 组 | 有效值 | 来源 |
|---|---|---|
| g1 | `{ concurrency: 8 }` | concurrency: 用户级 |
| g2 | `{ timeoutMs: 60000 }` | timeoutMs: 项目级 |
| g3 | `{ tools: ['c'] }` | tools: 用户级（**数组整体替换**） |
| g4 | `{ retry: { n: 5, backoff: 1000 } }` | retry.n: 用户级；retry.backoff: 内建 |
| g5 | `{ a: 9, b: 3 }` | a: 运行参数；b: 项目级 |
| g6 | `{ tags: [] }` | tags: 运行参数（**空数组也是一次整体替换**） |

| id | risk | 改写示例 |
|---|---|---|
| c1 | high | 删除构建产物目录，内容不可恢复 |
| c2 | high | 引入一个外部依赖，影响供应链，不可恢复 |
| c3 | low | 读取一个源文件，不产生改动，可恢复 |
| c4 | critical | 执行运行时生成的命令，影响范围无法预判，可能不可恢复 |
