# 答案位置

这个目录放你的分析题答案（Part A 与 Part B）。

## 怎么开始

```bash
cp ../problems/a-retry.template.json a-retry.json
cp ../problems/b-guard.template.json b-guard.json
```

然后按 `../problems/*.questions.md` 里的题目填写。

## 检查

```bash
cd ../..
node tests/t1-retry.mjs --answers kit/answers/a-retry.json
node tests/t2-guard.mjs --answers kit/answers/b-guard.json
```

## 三个常见问题

**每一项的 `reason` 能不能只写结论？** 不能。判分器对 `reason` 做**关键词包含检查**（是否提到类型、状态、幂等、副作用、限流、超时之一）——这是为了让"理由"真的指向依据，而不是重复答案。

**Part B 的 `consequence` 为什么会被正则检查？** 因为"面向人的后果描述"是本作业里少数**可以机械检查的写作质量**。它的三条要求（不含反引号、不含命令名、含可恢复性）对应的正是讲义 3.2 的 1.2 里那三条规则。

**填错了会不会影响后面的 Part？** 不会。六个 Part 的判据互相独立，而分析题与构建题的评分也不相干。**先做哪个都可以**——但建议先做 A/B，因为它们只要思考、不需要调试。
