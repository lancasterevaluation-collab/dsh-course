# 答案位置

这个目录放你的分析题答案（Part A（写入与触发策略）与 Part B（诊断与可行动性））。

## 怎么开始

```bash
cp ../problems/a-memory.template.json a-memory.json
cp ../problems/b-diagnosis.template.json b-diagnosis.json
```

然后按 `../problems/*.questions.md` 里的题目填写。

## 检查

```bash
cd ../..
node tests/t1-memory-policy.mjs --answers kit/answers/a-memory.json
node tests/t2-diagnosis.mjs --answers kit/answers/b-diagnosis.json
```

## 三个常见问题

**每一项的 `reason` 能不能只写结论？** 不能。判分器对 `reason` 做**关键词包含检查**（是否提到跨会话、可验证、临时之一）——这是为了让"理由"真的指向依据，而不是重复答案。

**Part A 的 `description` 为什么不能以「关于」「本技能」开头？** 因为那说明写的是主题而不是触发条件——而触发条件才是技能被匹配到的入口（讲义 4.2 的 1.2）。**Part B 的 `rewritten` 为什么不能出现「模型能力」与「用户表达」？** 因为那两句正是不可行动结论的原型（讲义 4.4 的 1.4）。

**填错了会不会影响后面的 Part？** 不会。六个 Part 的判据互相独立，而分析题与构建题的评分也不相干。**先做哪个都可以**——但建议先做 A/B，因为它们只要思考、不需要调试。
