/**
 * BoundedMemory —— 你要实现的东西。
 *
 * ★ 唯一的依据是 ../CONTRACT.md。测试只考它写了的，而它写了的都会被考。
 *
 * ─────────────────────────────────────────────────────────────
 *  阅读顺序建议（这是引导，不是规则）：
 *
 *   1. 先读契约的【二、行为承诺】——那是最直观的一层，谁都看得懂。
 *   2. 再读【四、错误承诺】——注意它要求"错误类型必须能被 instanceof 判断"。
 *      这一条会改变你的实现方式（不能用 `throw new Error('xxx')`）。
 *   3. 再读【五、不变量】——特别是 4 与 5 的区别：
 *        "数组是副本" 与 "数组的元素也是副本" 是两件事。
 *   4. 最后读【三、时序承诺】——这里藏着两个最容易写错的地方：
 *        · remove 之后容量要释放
 *        · merge 在满仓时不能失败（它只会让容量更宽松）
 *
 *  然后读【六、不属于承诺的部分】——它会告诉你哪些地方"不必纠结"。
 * ─────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────
//  错误类（已经给你了——因为契约规定了它们的字段，自己写容易漏）
//
//  ★ 为什么它们是【类】而不是带 name 字段的 Error：
//    因为契约要求调用方能可靠地区分错误类型，
//    而 `instanceof` 是唯一可靠的方式。
// ─────────────────────────────────────────────────────────────

/** 达到容量上限时抛出。 */
export class CapacityError extends Error {
  /**
   * @param {number} limit 容量上限
   * @param {number} current 当前条数
   */
  constructor(limit, current) {
    super(`已达容量上限 ${limit}（当前 ${current}）`)
    this.name = 'CapacityError'
    this.limit = limit
    this.current = current
  }
}

/** id 重复时抛出。 */
export class DuplicateError extends Error {
  /** @param {string} id 重复的 id */
  constructor(id) {
    super(`id 已存在：${id}`)
    this.name = 'DuplicateError'
    this.id = id
  }
}

/** 引用的条目不存在时抛出（merge 用）。 */
export class NotFoundError extends Error {
  /** @param {string} id 找不到的 id */
  constructor(id) {
    super(`找不到条目：${id}`)
    this.name = 'NotFoundError'
    this.id = id
  }
}

// ─────────────────────────────────────────────────────────────
//  你要实现的部分
// ─────────────────────────────────────────────────────────────

/**
 * 一个有容量硬上限的记忆容器。
 *
 * ★ 契约里最容易被忽略的一句：**写满时失败，而不是丢弃最旧的。**
 *   "丢弃最旧的"是更自然的实现——但那样使用者永远不知道自己丢了什么。
 */
export class BoundedMemory {
  /**
   * @param {number} [limit] 容量上限（默认 12）
   */
  constructor(limit = 12) {
    // ★TODO① 初始化你的状态。
    //
    // 想一想：你需要记住什么？
    //   · 条目本身（怎么保证 id 唯一？）
    //   · 上限
    //
    // 提示：契约【六】说了"存储顺序不构成承诺"——
    //   所以你可以自由选择内部结构（数组 / Map / 其他）。
    throw new Error('TODO①：实现构造函数')
  }

  /**
   * 添加一条记忆。
   * @param {{ id: string, text: string, createdAt?: number }} entry 要添加的条目
   * @returns {{ id: string, text: string, createdAt: number }} 添加后的条目
   */
  add(entry) {
    // ★TODO② 实现 add。
    //
    // 契约要求它处理【三种】失败，而它们的顺序本身就是一个决定：
    //   · text 为空        → TypeError        （参数问题，最先检查最合理）
    //   · id 已存在        → DuplicateError
    //   · 已达上限         → CapacityError    （★ 不是丢弃最旧的！）
    //
    // 问自己：如果同时"id 重复"且"已达上限"，应该抛哪一个？
    //   契约没有规定顺序——所以你要做一个选择，并能在报告里说明理由。
    throw new Error('TODO②：实现 add')
  }

  /**
   * 取一条。
   * @param {string} id 条目 id
   * @returns {object|undefined} 找到则返回【副本】，否则 undefined
   */
  get(id) {
    // ★TODO③ 实现 get。
    //
    // 注意契约【五】的不变量 5：返回的应当是【副本】。
    // 直接返回内部对象会让调用方改坏你的状态——
    // 而那个 bug 只在调用方修改返回值时才出现，很难发现。
    throw new Error('TODO③：实现 get')
  }

  /**
   * 删除一条。
   * @param {string} id 条目 id
   * @returns {boolean} 删掉了返回 true；不存在返回 false（★ 不抛错）
   */
  remove(id) {
    // ★TODO④ 实现 remove。
    //
    // 契约【三】的时序承诺里有一条：**remove 后容量立即释放**。
    // 如果你的实现用"已用计数"而不是"实际长度"，这里很容易漏。
    throw new Error('TODO④：实现 remove')
  }

  /**
   * 把多条合并成一条。
   * @param {string[]} ids 要被合并的 id 列表
   * @param {string} text 合并后的文本
   * @returns {object} 新条目（带 mergedFrom）
   */
  merge(ids, text) {
    // ★TODO⑤ 实现 merge。
    //
    // 三个要注意的地方：
    //   · text 为空 → TypeError
    //   · ids 里有不存在的 → NotFoundError（带那个 id）
    //   · ★ 满仓时 merge 不能失败——它只会让容量更宽松（N 条变 1 条）
    //
    // 最后一条是【三、时序承诺】里明写的。多数实现会先检查容量——
    // 而那会让满仓时的合并失败，与契约冲突。
    throw new Error('TODO⑤：实现 merge')
  }

  /**
   * 返回当前全部条目。
   * @returns {object[]} 副本（数组是副本，元素【也】是副本）
   */
  list() {
    // ★TODO⑥ 实现 list。
    //
    // 契约【五】的不变量 4 与 5 是两件事：
    //   4：返回的【数组】不是内部状态
    //   5：数组里的【每个元素】也是副本
    //
    // 只做 4 是最常见的半成品——`return [...this.#entries]` 只复制了数组，
    // 元素仍然指向内部对象。
    throw new Error('TODO⑥：实现 list')
  }

  /**
   * 当前条目数。
   * @returns {number} 条数
   */
  size() {
    // ★TODO⑦ 实现 size。
    throw new Error('TODO⑦：实现 size')
  }
}
