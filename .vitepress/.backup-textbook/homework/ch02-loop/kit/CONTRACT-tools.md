# 契约 · 工具系统（`tools.mjs`）

> **这份文件是你实现 `kit/src/tools.mjs` 的唯一依据。**
> 它不是需求说明，而是**契约**——它写明你的实现必须保证什么、不必保证什么。
> 判分器 `tests/t4-build.mjs` 逐条检查下面每一条。**读它的时候要逐句读**，因为这一篇训练的仍然是"把契约里的一句话翻译成代码"，而它的条款比模型层多一倍。
>
> 讲义：[`../../../02-最小闭环/2.2-工具系统.md`](../../../02-最小闭环/2.2-工具系统.md)（L3 是施工图，1.4–1.8 是各条设计依据）

---

## 一、行为承诺

**承诺 1：`validateArgs(schema, value, path)` 检查参数是否符合 schema，返回错误信息。**

- 通过时返回空字符串 `''`。
- 违反约束时返回一句**含字段名**的话，且**不抛异常**（校验失败是可预期的失败，讲义 1.5）。
- 要检查的约束共五条：必填缺失、类型不匹配、`enum` 之外的值、数组元素类型（`items`）、**schema 里没有的字段**（未知字段）。
- `value` 不是对象（数组、`null`、数字、字符串）时同样返回错误信息。

**承诺 2：`truncate(text, limit)` 把过长文本截断到上限。**

- 未超限时**原样返回**（不加工、不加说明）。
- 超限时**保留头与尾**，比例约为头 80%、尾 20%。
- 截断处要有一句说明，且说明里必须含**省略了多少个字符**与**原文总长**（讲义 1.6）。

**承诺 3：`resolveInside(workspace, input)` 把模型给的路径解析为工作目录内的绝对路径。**

- 解析结果在工作目录之内时，返回**绝对路径**。
- 解析结果落在工作目录之外时，**抛出 `Error`**（讲义 1.7：最小防线）。
- ★ 判断"在内"必须比较**带分隔符的前缀**：`/work-evil/x` 不能被当作在 `/work` 之内。

**承诺 4：`register(definition)` 注册一个工具，返回卸载函数。**

- 返回值是一个**函数**，调用它之后该工具从 `list()` 中消失。
- 名字与已注册的工具重复时，`register` **抛出 `Error`**（这是编程错误，越早失败越好）。
- 卸载函数可以重复调用，不抛异常。

**承诺 5：`list()` 返回给模型看的工具清单。**

- 每项含 `name`、`description`、`parameters` 三项，**不含实现**（`run`）。
- 输出的每一项都必须能被 JSON 往返：`JSON.parse(JSON.stringify(list()))` 与原值在结构上一致。

**承诺 6：`run(name, rawArguments, ctx)` 是调用工具的唯一入口，它按五步走。**

1. 工具名未注册 → 返回 `{ ok: false, error }`，**不抛异常**。
2. 参数字符串解析失败 → 返回 `{ ok: false, error }`（复用模型层的 `parseArguments`，讲义 5.3 第一条）。
3. 参数不符合 schema → 返回 `{ ok: false, error }`，且错误信息要**能定位到字段**。
4. 工具实现返回 `{ ok: false }` → **原样透传**（不要改写工具自己写的 `error`）。
5. 结果的文本（成功的 `content` 与失败的 `error`）都要经过 `truncate`，上限是 `ctx.maxResultChars`。

**承诺 7：工具实现抛出的异常被 `run` 接住，并标注为 `internal`。**

- 结果是 `{ ok: false, error, internal: true }`。
- ★ `internal` 必须出现：它区分"这个操作没能完成"与"这段代码写错了"（讲义 3.2）。**不要让它伪装成一次普通失败。**

---

## 二、时序承诺

**承诺 8：`validateArgs`、`truncate`、`resolveSideEffect` 都是纯函数。**

同样的输入永远得到同样的输出，不读写任何外部状态。

**承诺 9：`run` 不改变工具集。**

调用一个工具不会让 `list()` 的内容发生变化（注册与卸载只发生在 `register` 与卸载函数里）。

---

## 三、错误承诺

**承诺 10：`run` 对模型的任何输入都不抛异常。**

`rawArguments` 是空串、不是 JSON、是一个数组、或者 `name` 根本不存在——这些都要落成 `{ ok: false }` 的结果。**唯一的 `throw` 属于编程错误**（`register` 的重名、`resolveInside` 的越界）。

---

## 四、不变量

**不变量 1：凡是被写进 `ToolResult` 的文本都经过 `truncate`。**

成功与失败**都要**过这一道（讲义 3.4.2 第 ⑤ 步）。判分器会分别用一条长结果与一条长错误信息验证。

**不变量 2：`sideEffect` 的缺省值是 `'irreversible'`。**

`resolveSideEffect(definition)` 在定义里没有 `sideEffect` 时返回 `'irreversible'`（讲义 3.4.1 的保守默认）。四级取值为 `'readonly'` / `'reversible'` / `'irreversible'` / `'external'`。

**不变量 3：`SIDE_EFFECTS` 恰好是那四级，顺序由 readonly（0 级）到 external（3 级）。**

**不变量 4：`run` 永不抛异常**（与承诺 10 是同一件事，这里作为不变量再写一遍，因为判分器会对多种输入轮着试）。

---

## 五、不承诺（这一节同样重要）

**不承诺 1：`validateArgs` 不检查数值范围。**

`{ type: 'number' }` 接受 `-1` 与 `1e300`。范围约束由工具实现自己查，并返回 `{ ok: false }`。

**不承诺 2：`run` 不强制工具使用 `resolveInside`。**

最小防线是**工具实现的义务**，注册表不会替它检查每一个字符串参数。所以"声明为只读的工具有没有偷偷写文件"这件事，类型系统管不了（讲义 1.8 与 L9 第二条）。

**不承诺 3：没有超时与取消。**

一个卡住的工具会让 `run` 一直不返回。超时需要取消传播，那是第 3 卷的内容。

**不承诺 4：没有作用域与并发控制。**

注册表是这一层的全部状态，它不分会话、不加锁。

**不承诺 5：`object` 类型的字段不递归校验它的内部结构。**

本子集里没有嵌套 `properties`（讲义 3.2），所以路径最多到"顶层字段 + 数组下标"这一层（例如 `tags[1]`）。嵌套参数的对错要在工具实现里自己查。

---

## 六、交付物

| 交付物 | 说明 |
|---|---|
| `src/tools.mjs` | 实现（导出清单见第七节） |
| `CONTRACT-NOTES-tools.md` | 一份短报告：**你在实现时发现契约里哪几处最容易读漏**，以及你是怎么判断它们的 |
| 测试通过 | 用 `node tests/t4-build.mjs` 跑 |

**报告的要求**：与模型层那份相同——**指出契约里最容易被误读的地方**。这一篇的候选至少有三处：承诺 1 的"未知字段"与"必填缺失"看起来都在说"字段不对"；承诺 6 的第 4 步与第 5 步的先后关系（先透传还是先截断）；承诺 7 的 `internal` 与承诺 6 第 5 步的重叠。**如果你写完觉得"没有歧义"，多半说明你没有逐句读它。**

---

## 七、导出清单（判分器会 import 这些名字）

```js
export function validateArgs(schema, value, path = '')  // → string，'' 表示通过
export function truncate(text, limit)                    // → string
export function resolveInside(workspace, input)          // → string，越界时抛 Error
export const SIDE_EFFECTS = [/* 四级，从 readonly 到 external */]
export function resolveSideEffect(definition)            // → SideEffect，缺省 'irreversible'
export class ToolRegistry {                              // register(definition) / list() / run(name, rawArguments, ctx)
}
```

`ToolRegistry` 的实现要 import 模型层的 `parseArguments`：

```js
import { parseArguments } from './llm.mjs'
```

**导出名必须完全一致**——判分器按名字 import。这是"接口即契约"的最直接体现：**名字改了，契约就破了。**
