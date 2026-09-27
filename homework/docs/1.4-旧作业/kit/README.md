# kit —— 你的作业环境

这是你**唯一需要动手的地方**。作业文档在上一级（`../作业引导.md`），判分材料在另一侧的 `../grade/`，都不要改。

```
homework/1.4/
├── 作业引导.md        ← 先读它
├── kit/               ← ★ 你在这里工作
│   ├── README.md      ← 你正在读的文件
│   ├── answers.json   ← 30 道客观题的答卷（A/B/C 三组）
│   ├── writeup.md     ← 分析题的报告 + 自评 rubric（D 组，28 分）
│   └── tools/
│       └── check.mjs  ← 判分入口
└── grade/             ← 判分材料，不要改
    ├── check-answers.mjs     判分器
    ├── answers.example.json  参考答案
    └── 答案解析.md           ★ 30 题逐题详解（含面试完整答法）
```

## 现在就能做的三件事

```powershell
# 1) 看答卷长什么样（此时全是 null）
Get-Content answers.json

# 2) 跑一次判分，看基线（应该是 0/72）
node tools/check.mjs

# 3) 看看作业对象
rg -n "export interface Tool" D:\dsh-mini\src\kernel\tools.ts
```

## 三组题的填法

| 组 | 填什么 | 选项 |
|---|---|---|
| **A**（12 题，36 分） | 破坏性判断 | `breaking` 或 `safe` |
| **B**（8 题，16 分） | 承诺分类 | `behavior` / `timing` / `error` / `ownership` |
| **C**（10 题，20 分） | 术语 | 中文即可（判分器做同义匹配） |

`answers.json` 里每组旁边都有 `_这组考什么` 提示。**先读提示再填**，能省掉试错。

## 判分与自评

```
node tools/check.mjs              # 判分（72 分制）
node tools/check.mjs --verbose    # 判分并列出每道错题的标准答案
```

**判分器只判 72 分**。剩下 28 分是分析题（D 组），写在 `writeup.md` 里，按那里的 rubric 自评。

**为什么分开**：客观题有唯一答案，能自动判；分析题没有唯一答案，它的评分标准是"你的推理能不能被追问住"——那只有读了你的推理才能评。

## 一份值得单独用的材料

`../grade/答案解析.md` 里有 **30 道题的逐题详解**：每题都给了"为什么""**可以直接照说的完整答法**""常见误区""追问应对"。

**用法不是对答案，而是练口述。** 面试失分很少是"不知道"，而是"知道但说不清"——那份文档里的"完整答法"就是照着这个写的。

## 一条纪律

**不要修改 `D:\dsh-mini` 的任何文件**。这份作业是分析型的：你要读它、判断它、给它挑毛病，但不改它。做完之后可以确认：

```powershell
git -C D:\dsh-mini status --short   # 期望：无输出
```
