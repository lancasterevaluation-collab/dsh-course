/**
 * 契约测试。
 *
 * ★ 关键设计：**每个用例跑 30 次，每次用不同的随机操作序列。**
 *   这不是为了测"非确定性"（这个模块是确定性的），
 *   而是为了覆盖更多【输入组合】——因为契约里的不变量
 *   必须在任意操作序列下都成立。
 *
 * 运行：node tests/t5-build.mjs（或用总入口 node tests/run.mjs 跑全章）
 */

// ★ 用动态 import，这样可以用 IMPL 指定实现文件来验证参考答案：
//     IMPL=../grade/memory.reference.mjs node tests/t5-build.mjs
//   默认测的是 kit 里学生要实现的那个文件。
const IMPL = process.env.IMPL ?? '../kit/src/memory.mjs'
const { BoundedMemory, CapacityError, DuplicateError, NotFoundError } = await import(new URL(IMPL, import.meta.url).href)
import { makeRandom } from '../../../tools/harness-tester/faults.mjs'
import { scoreReport, renderReport } from '../../../tools/harness-tester/report.mjs'

const RUNS = Number(process.env.RUNS ?? 30)
const SEED = Number(process.env.SEED ?? 20260101)

const ok = () => ({ ok: true })
const bad = (reason) => ({ ok: false, reason })

// ─────────────────────────────────────────────────────────────
//  用例
// ─────────────────────────────────────────────────────────────

const cases = [
  {
    name: 'A · 基本行为（add / get / size / list / remove）',
    run() {
      const m = new BoundedMemory(5)
      m.add({ id: 'a', text: '第一条' })
      m.add({ id: 'b', text: '第二条' })
      if (m.size() !== 2) return bad(`size 应为 2，实际 ${m.size()}`)
      if (m.get('a')?.text !== '第一条') return bad('get 取不到刚添加的条目')
      if (m.get('nope') !== undefined) return bad('get 不存在的 id 应当返回 undefined')
      if (m.list().length !== 2) return bad(`list 应有 2 项，实际 ${m.list().length}`)
      if (m.remove('a') !== true) return bad('remove 已存在的 id 应返回 true')
      if (m.size() !== 1) return bad('remove 之后 size 没有减少')
      return ok()
    },
  },

  {
    name: 'B · ★ 满仓时【失败】而不是丢弃最旧的',
    run() {
      const m = new BoundedMemory(3)
      m.add({ id: 'a', text: 'x' })
      m.add({ id: 'b', text: 'y' })
      m.add({ id: 'c', text: 'z' })

      try {
        m.add({ id: 'd', text: 'w' })
        return bad('满仓时 add 没有失败——契约要求它抛 CapacityError')
      } catch (e) {
        if (!(e instanceof CapacityError)) return bad(`抛的不是 CapacityError，而是 ${e.constructor?.name ?? typeof e}`)
        if (e.limit !== 3 || e.current !== 3) return bad(`CapacityError 的字段不对：limit=${e.limit} current=${e.current}`)
        // ★ 这两条才是本用例的重点：失败不能有副作用
        if (m.size() !== 3) return bad(`失败后 size 变成 ${m.size()}——它丢弃了条目`)
        if (m.get('a') === undefined) return bad('最旧的条目被丢弃了——契约要求"写满即失败"而非"丢最旧"')
        return ok()
      }
    },
  },

  {
    name: 'C · remove 后容量立即释放',
    run() {
      const m = new BoundedMemory(2)
      m.add({ id: 'a', text: 'x' })
      m.add({ id: 'b', text: 'y' })
      m.remove('a')
      try {
        m.add({ id: 'c', text: 'z' })
      } catch (e) {
        return bad(`remove 之后容量没有释放：${e.constructor?.name}`)
      }
      return m.size() === 2 ? ok() : bad(`size 应为 2，实际 ${m.size()}`)
    },
  },

  {
    name: 'D · ★ merge 在满仓时【不能】失败',
    run() {
      const m = new BoundedMemory(2)
      m.add({ id: 'a', text: 'x' })
      m.add({ id: 'b', text: 'y' })
      // 契约【三】：合并 N 条为 1 条 → 容量减少 N−1，所以满仓时合并应当成功
      let merged
      try {
        merged = m.merge(['a', 'b'], '合并后')
      } catch (e) {
        return bad(`满仓时 merge 失败了：${e.constructor?.name}——契约说它只会让容量更宽松`)
      }
      if (m.size() !== 1) return bad(`merge 后 size 应为 1，实际 ${m.size()}`)
      if (merged?.mergedFrom !== 2) return bad(`merge 产生的条目应带 mergedFrom: 2，实际 ${merged?.mergedFrom}`)
      if (m.get('a') !== undefined || m.get('b') !== undefined) return bad('被合并的旧条目没有被移除')
      return ok()
    },
  },

  {
    name: 'E · 错误类型必须能被 instanceof 判断',
    run() {
      const m = new BoundedMemory(5)
      m.add({ id: 'a', text: 'x' })

      // 重复 id
      try {
        m.add({ id: 'a', text: 'y' })
        return bad('重复 id 没有抛错')
      } catch (e) {
        if (!(e instanceof DuplicateError)) return bad(`重复 id 抛的是 ${e.constructor?.name}，不是 DuplicateError`)
        if (e.id !== 'a') return bad('DuplicateError 没有带 id 字段')
      }

      // 空 text
      try {
        m.add({ id: 'b', text: '' })
        return bad('空 text 没有抛错')
      } catch (e) {
        if (!(e instanceof TypeError)) return bad(`空 text 抛的是 ${e.constructor?.name}，不是 TypeError`)
      }

      // merge 引用不存在的 id
      try {
        m.merge(['a', 'nope'], '合并')
        return bad('merge 引用不存在的 id 没有抛错')
      } catch (e) {
        if (!(e instanceof NotFoundError)) return bad(`merge 抛的是 ${e.constructor?.name}，不是 NotFoundError`)
        if (e.id !== 'nope') return bad(`NotFoundError 应当带 'nope'，实际 ${e.id}`)
      }
      return ok()
    },
  },

  {
    name: 'F · ★ 不变量：任意操作序列下 size ≤ limit',
    run(rand) {
      const limit = 2 + Math.floor(rand() * 5)
      const m = new BoundedMemory(limit)

      for (let i = 0; i < 300; i++) {
        const op = rand()
        try {
          if (op < 0.5) {
            m.add({ id: `id${Math.floor(rand() * 20)}`, text: `t${i}` })
          } else if (op < 0.7) {
            m.remove(`id${Math.floor(rand() * 20)}`)
          } else if (op < 0.85) {
            const ids = m.list().slice(0, 3).map((e) => e.id)
            if (ids.length >= 2) m.merge(ids, `合并${i}`)
          } else {
            m.list()
          }
        } catch (e) {
          // 允许的失败：容量满、id 重复、找不到
          if (!(e instanceof CapacityError || e instanceof DuplicateError || e instanceof NotFoundError)) {
            return bad(`第 ${i} 步抛出了非预期的错误：${e.constructor?.name}: ${e.message}`)
          }
        }
        // ★ 每一步之后都检查不变量
        if (m.size() > limit) return bad(`第 ${i} 步后不变量被破坏：size=${m.size()} > limit=${limit}`)
      }
      return ok()
    },
  },

  {
    name: 'G · ★ list 返回的是【深】副本',
    run() {
      const m = new BoundedMemory(5)
      m.add({ id: 'a', text: '原始' })

      // 不变量 4：数组本身是副本
      const arr = m.list()
      arr.push({ id: 'fake', text: '伪造' })
      if (m.size() !== 1) return bad('修改返回的数组影响了内部状态')

      // 不变量 5：数组的元素也是副本
      const el = m.list()[0]
      el.text = '被改过了'
      if (m.get('a')?.text !== '原始') return bad('修改返回的元素影响了内部状态（只复制了数组，没复制元素）')

      // get 也应当是副本
      const got = m.get('a')
      got.text = '也被改了'
      if (m.get('a')?.text !== '原始') return bad('修改 get 返回的对象影响了内部状态')
      return ok()
    },
  },

  {
    name: 'H · remove 幂等（不存在时不抛错）',
    run() {
      const m = new BoundedMemory(3)
      m.add({ id: 'a', text: 'x' })
      if (m.remove('a') !== true) return bad('第一次 remove 应返回 true')
      let second
      try {
        second = m.remove('a')
      } catch (e) {
        return bad(`第二次 remove 抛错了：${e.constructor?.name}——契约要求它返回 false`)
      }
      if (second !== false) return bad(`第二次 remove 应返回 false，实际 ${second}`)
      return ok()
    },
  },
]

// ─────────────────────────────────────────────────────────────
//  运行（复用 harness-tester 的算分与报告）
// ─────────────────────────────────────────────────────────────

/**
 * 逐用例权重。
 * ★ 契约里的不同条款重要性不同——"满仓时失败"比"remove 幂等"重要得多。
 *   等分会让一个实现"丢掉了最旧的"却只损失 12.5 分。
 */
const WEIGHTS = {
  A: 10, // 基本行为
  B: 20, // ★ 满仓失败（契约的核心立场）
  C: 10, // 容量释放
  D: 15, // ★ merge 满仓
  E: 15, // 错误类型可 instanceof
  F: 15, // ★ 不变量（随机序列）
  G: 10, // 深副本
  H: 5,  // remove 幂等
}

const results = []

for (const c of cases) {
  let pass = 0
  const reasons = new Map()

  for (let i = 0; i < RUNS; i++) {
    const rand = makeRandom(SEED + i)
    let r
    try {
      r = c.run(rand)
    } catch (e) {
      r = bad(`实现抛出了异常：${e.constructor?.name}: ${e.message}`)
    }
    if (r?.ok) pass++
    else {
      const key = String(r?.reason ?? '未知原因').replace(/\b\d+\b/g, '<n>')
      reasons.set(key, (reasons.get(key) ?? 0) + 1)
    }
  }

  results.push({
    case: c.name,
    weight: WEIGHTS[c.name[0]] ?? 10,
    runs: RUNS,
    pass,
    rate: pass / RUNS,
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  })
}

const scored = scoreReport({ suite: 'BoundedMemory · 契约测试', runs: RUNS, results })
console.log(renderReport(scored, { verbose: true }))
console.log(`（每个用例跑 ${RUNS} 次，种子 ${SEED}；可用 RUNS=100 SEED=1 node tests/t5-build.mjs 调整）`)
console.log('')
process.exit(scored.percentage >= 80 ? 0 : 1)
