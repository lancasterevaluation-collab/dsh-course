/**
 * 参考答案：BoundedMemory 的实现。
 *
 * ★ 这份实现的每一处都对应契约里的一条要求——注释里标出了是哪一条。
 *   它的用途有两个：
 *     ① 验证测试本身（跑它应当得满分——否则是测试有问题）；
 *     ② 作为"合格实现长什么样"的参照。
 *
 * 验证：IMPL=../grade/memory.reference.mjs node tests/t5-build.mjs
 */

export class CapacityError extends Error {
  constructor(limit, current) {
    super(`已达容量上限 ${limit}（当前 ${current}）`)
    this.name = 'CapacityError'
    this.limit = limit
    this.current = current
  }
}

export class DuplicateError extends Error {
  constructor(id) {
    super(`id 已存在：${id}`)
    this.name = 'DuplicateError'
    this.id = id
  }
}

export class NotFoundError extends Error {
  constructor(id) {
    super(`找不到条目：${id}`)
    this.name = 'NotFoundError'
    this.id = id
  }
}

export class BoundedMemory {
  /** @param {number} [limit] 容量上限 */
  constructor(limit = 12) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError(`limit 必须是不小于 1 的整数，收到 ${limit}`)
    // 用 Map 存：它天然保证 id 唯一，且删除是 O(1)
    // （契约【六】明确说"存储顺序不构成承诺"，所以用 Map 是允许的）
    this.#entries = new Map()
    this.#limit = limit
  }

  #entries
  #limit

  add(entry) {
    // ★ 契约【四】规定的三种失败，顺序也是刻意选的：
    //   text 为空 → TypeError（参数问题，最先检查）
    //   id 重复  → DuplicateError
    //   满仓      → CapacityError（★ 不是丢弃最旧的）
    if (!entry || typeof entry.text !== 'string' || entry.text.length === 0) {
      throw new TypeError('text 必须是非空字符串')
    }
    const id = String(entry.id ?? '')
    if (id.length === 0) throw new TypeError('id 必须是非空字符串')
    if (this.#entries.has(id)) throw new DuplicateError(id)
    if (this.#entries.size >= this.#limit) throw new CapacityError(this.#limit, this.#entries.size)

    const e = Object.freeze({
      id,
      text: entry.text,
      createdAt: entry.createdAt ?? Date.now(),
    })
    this.#entries.set(id, e)
    return { ...e }
  }

  get(id) {
    const e = this.#entries.get(id)
    // ★ 契约【五】不变量 5：返回【副本】，不是内部对象
    return e ? { ...e } : undefined
  }

  remove(id) {
    // ★ 契约【二】：不存在时返回 false，不抛错（幂等）
    return this.#entries.delete(id)
  }

  merge(ids, text) {
    if (typeof text !== 'string' || text.length === 0) throw new TypeError('text 必须是非空字符串')
    if (!Array.isArray(ids) || ids.length < 2) throw new TypeError('ids 必须是至少两个元素的数组')

    // ★ 先检查全部 id 存在，再动手——否则半途失败会留下不一致的状态
    for (const id of ids) {
      if (!this.#entries.has(id)) throw new NotFoundError(id)
    }

    // ★ 契约【三】：merge 只会让容量更宽松（N 条变 1 条），
    //   所以这里【不检查容量】——先检查容量会让满仓时的合并失败，与契约冲突。
    const merged = Object.freeze({
      id: `${ids[0]}+merge+${Date.now()}`,
      text,
      createdAt: Date.now(),
      mergedFrom: ids.length,
    })

    for (const id of ids) this.#entries.delete(id)
    this.#entries.set(merged.id, merged)
    return { ...merged }
  }

  list() {
    // ★ 契约【五】不变量 4 与 5 是两件事：
    //   数组要是副本，元素【也】要是副本。
    //   `[...this.#entries.values()]` 只做到了前者。
    return [...this.#entries.values()].map((e) => ({ ...e }))
  }

  size() {
    return this.#entries.size
  }
}
