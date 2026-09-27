# 契约 · 模型层（`llm.mjs`）

> **这份文件是你实现 `kit/src/llm.mjs` 的唯一依据。**
> 它不是需求说明，而是**契约**——它写明你的实现必须保证什么、不必保证什么。
> 判分器 `tests/t2-build.mjs` 逐条检查下面每一条。**读它的时候要逐句读**，因为这一篇训练的就是"把契约里的一句话翻译成代码"。

---

## 一、行为承诺

**承诺 1：`Provider` 接口上不得出现任何厂商专有的概念。**

判据是：把 `Provider` 的实现从一家换成另一家，调用方不需要改任何代码。判分器会用静态检查确认接口成员名与其引用类型里没有厂商字样。

**承诺 2：`chat()` 接受一个请求对象，返回一个响应对象。**

请求含 `messages`（消息数组），响应含 `content`（字符串）、`toolCalls`（数组）、`usage`（对象）。这两个对象的所有字段名都是本系统的命名，不是任何厂商的线上字段名。

**承诺 3：`MockProvider` 按脚本顺序返回。**

构造时给一个脚本数组，每次 `chat()` 消费一项。脚本项有两种：正常响应与错误。

**承诺 4：`parseArguments(raw, toolName)` 把参数字符串解析成对象。**

- 输入是合法 JSON 对象时，返回它。
- 输入不是合法 JSON 时，抛 `LLMError`，`code` 为 `'invalid_tool_arguments'`。
- 输入是合法 JSON 但**不是对象**（数组、`null`、数字、字符串）时，同样抛 `LLMError`，`code` 为 `'invalid_tool_arguments'`。

**承诺 5：错误的 `retryable` 由 `code` 决定。**

`rate_limited`、`overloaded`、`server_error` 为 `true`；其余（含 `unknown`）为 `false`。

**承诺 6：`LLMError` 携带 `retryAfterMs`。**

如果构造时传了它，读出来必须是同一个值；没传时读出 `undefined`。

---

## 二、时序承诺

**承诺 7：`MockProvider` 脚本用尽时抛错，而不是返回空响应。**

第 N 次调用（N 超过脚本长度）时，抛 `LLMError`。**它不能返回一个"内容为空"的成功响应**——因为那会让"脚本写少了"这个测试错误伪装成"模型返回了空内容"。

**承诺 8：`parseArguments` 不修改任何外部状态。**

它是纯函数：同样的输入永远得到同样的结果（成功或抛出同样的错误）。

---

## 三、错误承诺

**承诺 9：所有 `LLMError` 的 `name` 是 `'LLMError'`。**

这样在日志与堆栈里能一眼看出它来自哪一层。

**承诺 10：解析失败的错误信息里必须包含工具名与原始字符串的前若干字符。**

判据是：拿到这条错误信息的人，不需要去别处找就能知道是哪个工具、模型生成了什么。

---

## 四、不变量

**不变量 1：`retryable` 与 `code` 始终一致。**

不存在"`code` 是 `rate_limited` 但 `retryable` 为 `false`"这种状态。判分器会对所有 code 逐个检查。

**不变量 2：`unknown` 永远不可重试。**

这是一条安全性质：面对未知错误时保守处理。

**不变量 3：响应对象可以被 JSON 往返。**

`JSON.parse(JSON.stringify(response))` 得到的对象与原对象在结构上一致。这条保证它日后能被写进日志（第 2.7 篇的会话日志要存它）。

---

## 五、不承诺（这一节同样重要）

**不承诺 1：`parseArguments` 不校验参数是否符合工具的 schema。**

它只保证"是一个对象"。字段是否齐全、类型是否正确，属于工具系统的职责（第 2.2 篇）。

**不承诺 2：`Provider` 不提供能力查询。**

调用方无法问"这个 provider 支不支持并行工具调用"。当前只有一家实现，这个问题还不存在。

**不承诺 3：没有流式。**

`chat()` 一次性返回完整响应。**所以调用方不必判断自己拿到的是"完整响应"还是"增量"** ——这是可替换性的一部分（讲义 A 组第 7 题考的就是这件事）。

**不承诺 4：`retryAfterMs` 没有上限。**

如果传入一个很大的值，它会原样保留。**加不加上限是调用方（重试机制）的事**——但讲义 L9 已经把这个缺失列为已知缺陷。

**不承诺 5：不校验消息序列的合法性。**

比如"`assistant` 消息带 `toolCalls` 但后面没有对应的 `tool` 消息"——这种不合法序列不会被拦住。

---

## 六、交付物

| 交付物 | 说明 |
|---|---|
| `src/llm.mjs` | 实现（导出 `Provider` 不用导出——它是一个概念；导出 `MockProvider`、`LLMError`、`parseArguments`、`RETRYABLE_CODES`） |
| `CONTRACT-NOTES.md` | 一份短报告：**你在实现时发现契约里哪几处最容易读漏**，以及你是怎么判断它们的 |
| 测试通过 | 用 `node tests/t2-build.mjs` 跑 |

**报告的要求**：它不是"总结"，而是**指出契约里最容易被误读的地方**。比如"承诺 4 的第二条与第三条看起来一样，其实分指两种情况"——这类观察才是这份报告要的。**如果你写完实现后觉得"契约写得很清楚、没有歧义"，那多半说明你没有真正逐句读它。**

---

## 七、导出清单（判分器会 import 这些名字）

```js
export class LLMError extends Error { /* code, retryable, retryAfterMs */ }
export function parseArguments(raw, toolName) { /* → object，失败时抛 LLMError */ }
export class MockProvider { /* name, chat(request) */ }
export const RETRYABLE_CODES = [/* 可重试的 code 数组 */]
```

**导出名必须完全一致**——判分器按名字 import。这是"接口即契约"的最直接体现：**名字改了，契约就破了。**
