# 答案位置

这个目录放你的分析题答案（Part A（模式与审批的分析）与 Part B（派发协议与信任边界））。

## 怎么开始

```bash
cp ../problems/a-profile.template.json a-profile.json
cp ../problems/b-delegation.template.json b-delegation.json
```

然后按 `../problems/*.questions.md` 里的题目填写。

## 检查

```bash
cd ../..
node tests/t1-profile-policy.mjs --answers kit/answers/a-profile.json
node tests/t2-delegation-policy.mjs --answers kit/answers/b-delegation.json
```

## 三个常见问题

**每一项的 `reason` 能不能只写结论？** 不能。判分器对 `reason` 做**关键词包含检查**（`verdict` 与 `action` 的一致性：`environment-dependent` 必须配 `move-to-generation`）——这是为了让"理由"真的指向依据，而不是重复答案。

**Part A 的后果描述为什么会被正则检查？** 因为"面向人的后果描述"是本作业里少数**可以机械检查的写作质量**。它的三条要求（不含反引号、不含命令名、含可恢复性）对应的正是讲义 5.3 的 1.2 里那三条规则。**Part B 为什么要求 `context.notGive` 非空？** 因为它让子 agent 知道自己看不到全貌，从而不做超越范围的改动（讲义 5.4 的 1.2）。

**填错了会不会影响后面的 Part？** 不会。六个 Part 的判据互相独立，而分析题与构建题的评分也不相干。**先做哪个都可以**——但建议先做 A/B，因为它们只要思考、不需要调试。
