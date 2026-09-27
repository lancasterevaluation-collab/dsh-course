# 2.1 模型层 · 客观题题面

> **这份文件只给题面，不给答案。** 作答写到 `kit/answers/a1-llm.json`（从 `a1-llm.template.json` 复制）。
> 判分：`node tests/t1-llm.mjs --answers kit/answers/a1-llm.json [--verbose]`
>
> **为什么题面单独放一份**：判分器按题号比对，而参考答案（`grade/a1.example.json`）里的理由**就是答案**。把题面写在参考答案里，等于让人在读到题目的同时读到答案。

---

## A 组 · 接口宽度判断（12 题 × 3 分）

下面是一个 provider 接口上的 12 个成员（单独看每一行）。**逐个判断它会不会破坏可替换性**，填 `safe` 或 `breaking`。

判据来自讲义 1.3 与 1.4：**这个成员里有没有出现某个具体实现（某家厂商）的概念？** 注意三类情形——本系统的通用概念是安全的；厂商专有概念会破坏；**还有一个成员不带任何厂商色彩，但它改变了返回值的形态**（讲义 L2 第 7 条与 L12 练习 1 讲的都是它）。

| 题号 | 接口成员 |
|---|---|
| A1 | `chat(request: LLMRequest): Promise<LLMResponse>` |
| A2 | `chat(body: DeepSeekRequestBody): Promise<LLMResponse>` |
| A3 | `temperature?: number` |
| A4 | `openaiApiKey: string` |
| A5 | `tools?: readonly ToolSpec[]` |
| A6 | `toolChoice?: { type: 'function'; function: { name: string } }` |
| A7 | `stream?: boolean` |
| A8 | `maxTokens?: number` |
| A9 | `reasoningEffort?: 'low' \| 'high'` |
| A10 | `messages: readonly ChatMessage[]` |
| A11 | `cacheControl?: { type: 'ephemeral' }` |
| A12 | `signal?: AbortSignal` |

**每一题在 `_逐题理由` 里写一句判断依据**——不写理由的答案，判分器仍然给分，但这一组的价值在于理由（README 第二节 2.3 讲的"遇到两种答案都说得通时，改问它让调用方多做了什么"）。

---

## B 组 · 错误分类（8 题 × 3 分）

下面 8 个错误场景。**按"第 9 步的重试遇到它该做什么"分类**，填 `retry` / `retry_wait` / `no_retry`。

| 题号 | 场景 |
|---|---|
| B1 | HTTP 429，响应头含 `Retry-After: 30` |
| B2 | HTTP 429，响应头没有 `Retry-After` |
| B3 | HTTP 500，响应体是对方的内部异常信息 |
| B4 | HTTP 400，错误信息说 `max_tokens` 超过上限 |
| B5 | HTTP 401 |
| B6 | TCP 握手阶段超时（连接建立不起来） |
| B7 | HTTP 503，响应体标明服务过载 |
| B8 | 工具参数的 JSON 被截断（`parseArguments` 失败） |

★ **最容易混的是"可不可重试"与"该等多久"。** `retry` 与 `retry_wait` 都是可重试，区别只在等待策略——依据是"对方有没有给出明确的等待时长"（讲义 L2 第 10 条、5.3 第三条）。

---

## C 组 · 术语（10 题 × 2 分）

每题写**术语名**（允许常见同义写法，大致的写法见下文提示）。

| 题号 | 描述 |
|---|---|
| C1 | 真正会去调模型的那个东西，职责是把内部结构翻译成厂商线格式、再翻译回来 |
| C2 | 实际在网络上传输的那份 JSON 的结构 |
| C3 | 一条消息在对话里的位置（system / user / assistant / tool） |
| C4 | 模型返回的"我想调用某个工具"的请求，它的参数是一个字符串 |
| C5 | 把不同性质的失败区分开，依据是"遇到它该怎么办" |
| C6 | 换一个实现，调用方不需要改 |
| C7 | 做一次与做多次的结果相同 |
| C8 | 在数据进入系统的地方做转换与校验 |
| C9 | 一种分类方式：让分类携带处理方式，而不只是描述现象 |
| C10 | 面对一个从未见过的错误时，那个"承认不知道并保守处理"的分类 |

---

## D 组 · 构建题（20 分）

不在这里作答。见 `kit/CONTRACT.md` 与 `kit/src/llm.mjs`，判分器是 `tests/t2-build.mjs`。

```powershell
node tests/t2-build.mjs                                        # 用你的实现
$env:IMPL='../grade/llm.reference.mjs'; node tests/t2-build.mjs # 用参考答案
node grade/negative-check.mjs                                  # 判分器有没有鉴别力
```
