// 测试基础设施：加载被测实现、逐条判据计分、统一的输出格式。
//
// 被测实现通过 IMPL 环境变量指定（相对本目录或绝对路径）；默认是 kit/src/<name>.mjs。
import { dirname, join, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * 加载被测实现。
 * @param {string} name 模块名（context / proc / persist / metrics）
 * @returns {Promise<Record<string, Function>>}
 */
export async function loadImpl(name) {
  // 优先级：IMPL（单个文件）> IMPL_TEMPLATE（含 {name} 占位，用于一次覆盖多个模块）> 默认起点
  const tpl = process.env.IMPL_TEMPLATE
  const p = process.env.IMPL
    ?? (tpl ? tpl.replace('{name}', name) : join(HERE, '..', 'kit', 'src', `${name}.mjs`))
  const url = p.startsWith('file:') ? p : pathToFileURL(isAbsolute(p) ? p : join(HERE, p)).href
  const mod = await import(url)
  return mod
}

/**
 * 创建一个测试套件。
 * @param {string} title
 * @param {{ weight: number }} opts
 */
export function createSuite(title, opts = {}) {
  const weight = opts.weight ?? 10
  const checks = []
  const suite = {
    /** 注册一条判据。fn 抛错即判不通过；返回 false 也判不通过。 */
    check(label, fn) { checks.push({ label, fn }) },
    /** 运行全部判据并打印。 */
    async run() {
      const rows = []
      for (const c of checks) {
        let ok = false
        let detail = ''
        try {
          const r = await c.fn()
          ok = r === undefined ? true : Boolean(r)
        } catch (e) {
          ok = false
          detail = e?.message ?? String(e)
        }
        rows.push({ ok, label: c.label, detail })
      }
      const passed = rows.filter((r) => r.ok).length
      const score = checks.length === 0 ? 0 : Math.round((passed / checks.length) * weight * 100) / 100
      console.log(`\n=== ${title} ===`)
      for (const r of rows) {
        console.log(`${r.ok ? ' 通过 ' : ' 不通过'}  ${r.label}${r.detail ? `  ← ${r.detail}` : ''}`)
      }
      console.log(`小计：${passed}/${checks.length}　得分 ${score}/${weight}`)
      return { title, passed, total: checks.length, score, weight }
    },
  }
  return suite
}

/** 断言。抛错即为判据不通过，错误信息会显示在明细里。 */
export const assert = {
  ok(cond, msg) { if (!cond) throw new Error(msg ?? '断言失败') },
  eq(actual, expected, msg) {
    if (actual !== expected) throw new Error(`${msg ?? '值不相等'}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  },
  near(actual, expected, tol, msg) {
    if (Math.abs(actual - expected) > tol) throw new Error(`${msg ?? '值超出容差'}：期望 ${expected}±${tol}，实际 ${actual}`)
  },
  deepEq(actual, expected, msg) {
    // 与 key 顺序无关的比较：学生实现里字段的书写顺序不应影响判据。
    const a = JSON.stringify(stable(actual))
    const b = JSON.stringify(stable(expected))
    if (a !== b) throw new Error(`${msg ?? '结构不相等'}：期望 ${b}，实际 ${a}`)
  },
  throws(fn, keyword, msg) {
    let threw = null
    try { fn() } catch (e) { threw = e }
    if (!threw) throw new Error(`${msg ?? '期望抛错但没有'}`)
    if (keyword && !String(threw.message).includes(keyword)) {
      throw new Error(`${msg ?? '错误信息不含关键词'}：期望含「${keyword}」，实际「${threw.message}」`)
    }
  },
}

/** 汇总多个套件的结果。 */
export function report(results) {
  const total = results.reduce((n, r) => n + r.score, 0)
  const max = results.reduce((n, r) => n + r.weight, 0)
  console.log('\n════════════════════════════════════')
  for (const r of results) console.log(`${r.title.padEnd(28, ' ')} ${String(r.score).padStart(6)} / ${r.weight}`)
  console.log('────────────────────────────────────')
  console.log(`${'总分'.padEnd(28, ' ')} ${String(Math.round(total * 100) / 100).padStart(6)} / ${max}`)
  return { total, max }
}

/** 稳定序列化：递归排序对象的键，用于与书写顺序无关的结构比较。 @param {unknown} v */
function stable(v) {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((o, k) => { o[k] = stable(v[k]); return o }, {})
  }
  return v
}

/** 简短哈希（测试里用于生成唯一内容）。 @param {string} s */
export function shortHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}
