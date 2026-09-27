# scripts —— 你的脚本放这里（骨架已经给你了）

`check.mjs` 是一个**搭好架子、写满引导注释的骨架**。你不需要从零写，只需要填三处标着 `★TODO★` 的地方：

| 位置 | 要做什么 |
|---|---|
| ★TODO 1★ | 选一条新规则，并回答"它被破坏时症状多久出现""什么情况下会误报" |
| ★TODO 2★ | 实现这条规则（参照文件里已经写好的**示例规则 A：依赖方向**） |
| ★TODO 3★ | 取消一行注释，让你的规则真正跑起来 |

## 立刻可以做的三件事

```powershell
# 1) 看骨架在正常状态下的输出（应为 PASS、退出码 0）
node check.mjs --repo D:\dsh-mini

# 2) 看示例规则能不能报警——这一步你必须亲自做一次
Copy-Item -Recurse D:\dsh-mini D:\dsh-mini-violate-test
Add-Content -Path D:\dsh-mini-violate-test\src\kernel\retry.ts -Value "import { Context } from '../framework/context.ts'"
node check.mjs --repo D:\dsh-mini-violate-test
Remove-Item -Recurse -Force D:\dsh-mini-violate-test

# 3) 再试一次类型导入，看会不会触发
#    import type { Context } from '../framework/context.ts'
#    如果没触发，说明你的检查做了正确的区分
```

## 为什么骨架用 Node 而不是 PowerShell

这不是随手选的，而是一个真实的工程判断，文件头部注释里有完整说明。三条理由：

1. **Windows 默认禁止运行 `.ps1`**（执行策略），每次都得加 `-ExecutionPolicy Bypass`。
2. **Windows PowerShell 5.1 会把 UTF-8 无 BOM 的文件按 ANSI 读**，于是中文注释变成乱码并导致语法错误——我实测过，一个完全正确的 `.ps1` 因为这一条而无法运行。
3. **dsh-mini 本身就是 Node 项目**，Node 一定可用，且默认按 UTF-8 读文件。

这正是 3.2 讲的**偶然复杂度**：选 PowerShell 没有让脚本更难写，但让它更难被**跑起来**。

## 填完之后

把这两样填进 `../answers.json` 的 `task3`：

```json
"scriptPath": "scripts/check.mjs",
"selfTestOutput": "<把"抓到人为违规"那次运行的实际输出粘在这里，里面要有 FAIL 与违规文件名>"
```

**为什么要求"必须报警过"**：一个从未报过警的检查脚本，它的"正确"是无法区分的——它可能真的没问题，也可能根本没在看。这和你以后在 CI 里加检查时遇到的是同一个问题：**加一个永远绿的检查，比不加更糟**，因为它会让人以为有保障。
