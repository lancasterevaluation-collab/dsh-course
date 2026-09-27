# kit —— 你的工作区

**唯一需要动手的地方是 `src/memory.mjs`。**

```
homework/1.4-build/
├── 作业说明.md          ← 先读它（分值、约束、荣誉守则都在里面）
├── kit/                 ← ★ 你在这里工作
│   ├── README.md        ← 你正在读的
│   ├── CONTRACT.md      ← ★★ 你的【唯一依据】——最该读的文件
│   └── src/
│       └── memory.mjs   ← 唯一要改的文件（有 7 处 TODO）
├── tests/
│   └── run.mjs          ← 判分器（★ 不要改）
└── grade/               ← 参考答案与验证工具（做完再看）
    ├── memory.reference.mjs
    └── negative-check.mjs
```

## 现在就能做的三件事

```powershell
# 1) 读契约——它决定了 100 分里所有的分
Get-Content CONTRACT.md

# 2) 看骨架（7 处 TODO，每处都有提示）
Get-Content src/memory.mjs

# 3) 跑一次，看基线（应该是 0/100）
node ../tests/run.mjs
```

## 判分怎么跑

```powershell
node ../tests/run.mjs                 # 现在跑（改完 src/memory.mjs 后再跑）
$env:RUNS=100; node ../tests/run.mjs  # 跑 100 次（更严格）
```

**判分跑 30 次，每次用不同的随机操作序列**——因为契约里的不变量要在**任意**操作序列下成立。

**扣分是乘性的**：90% 的成功率不是 90 分，而是 81 分（$0.9^2$）。**理由是：一个偶发失败在生产环境里就是事故。**

## 三条纪律

**一、不要改 `tests/run.mjs`。** 它是判分器。如果你想"改测试让它通过"，那等于放弃这道题的全部价值。

**二、不要改 `CONTRACT.md`。** 它是依据，不是可以协商的对象。

**三、先自己读契约再写代码。** 骨架里的提示会告诉你去读契约的哪一节——**但提示不会告诉你那一节说了什么**。这个差别是故意的。

## 做完之后

```powershell
node ../tests/run.mjs                                       # 你的实现
node ../grade/negative-check.mjs                            # 测试的鉴别力（应 4/4）
$env:IMPL='../grade/memory.reference.mjs'; node ../tests/run.mjs   # 参考答案（应 100/100）
```

**第三个命令值得跑**：它告诉你"一份满分的实现长什么样"，也告诉你**测试确实能给满分**（而不是无论怎么写都不给分）。
