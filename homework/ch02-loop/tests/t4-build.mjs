/**
 * 2.2 构建题判分：按契约逐条检查 tools.mjs。
 *
 * 对应 CS336 的 tests/：判分器不是评分表，而是一组能被反复运行的检查。
 * 每个用例对应 CONTRACT-tools.md 里的一条承诺或不变量，注释里标出编号。
 *
 * 用法：
 *   node tests/t4-build.mjs                                    用 kit/src/tools.mjs
 *   $env:IMPL_TOOLS='../grade/tools.reference.mjs'             用参考答案（PowerShell）
 *   node tests/t4-build.mjs --verbose                          打印每个用例的细节
 *
 * ★ IMPL 是相对【本文件】解析的，所以引用 kit 里要用 ../kit/src/tools.mjs。
 * ★ 这一项依赖 2.1：注册表用的是模型层的 parseArguments。若它还是骨架，
 *   与"参数已解析成功"相关的用例会失败——那是正确的结果（2.1 是前置）。
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

const IMPL = process.env.IMPL ?? '../kit/src/tools.mjs'
const VERBOSE = process.argv.includes('--verbose')

const mod = await import(new URL(IMPL, import.meta.url).href)
const { validateArgs, truncate, resolveInside, SIDE_EFFECTS, resolveSideEffect, ToolRegistry } = mod

const CTX = { workspace: process.cwd(), maxResultChars: 2000 }

/** 一个最小的工具定义。参数用对象展开覆盖，便于单个用例改一处。 */
function tool(over = {}) {
  return {
    name: 'echo',
    description: '把 text 原样返回。用来确认工具系统的工作方式。',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: '要回显的文本' } },
      required: ['text'],
    },
    sideEffect: 'readonly',
    run: ({ text }) => ({ ok: true, content: text }),
    ...over,
  }
}

/** 一个带数组与枚举参数的工具，用于校验器与路径定位的用例。 */
const ARRAY_SCHEMA = {
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      description: '标签列表',
      items: { type: 'string', description: '一个标签' },
    },
    mode: { type: 'string', description: '读取模式', enum: ['head', 'tail'] },
  },
  required: ['tags'],
}

/** 用例表：每项 { 名称, 权重, 契约条款, 检查函数 }。检查函数返回 '' 表示通过。 */
const CASES = [
  // ── A 组：校验器 ────────────────────────────────────────
  {
    name: 'A1 · 合法参数返回空字符串',
    weight: 8,
    clause: '承诺 1',
    run: () => {
      const got = validateArgs(ARRAY_SCHEMA, { tags: ['a'], mode: 'head' })
      return got === '' ? '' : `期望 ''，得到 ${JSON.stringify(got)}`
    },
  },
  {
    name: 'A2 · 缺必填参数：错误信息含字段名',
    weight: 10,
    clause: '承诺 1',
    run: () => {
      const got = validateArgs(ARRAY_SCHEMA, { mode: 'head' })
      if (!got) return '没有报错'
      return got.includes('tags') ? '' : `错误信息里没有字段名：${got}`
    },
  },
  {
    name: 'A3 · ★ 类型不匹配被拒',
    weight: 10,
    clause: '承诺 1',
    run: () => {
      const got = validateArgs(ARRAY_SCHEMA, { tags: 'a' })
      if (!got) return 'tags 是字符串而不是数组，却没有被拒'
      return got.includes('tags') ? '' : `错误信息里没有字段名：${got}`
    },
  },
  {
    name: 'A4 · enum 之外的值被拒',
    weight: 8,
    clause: '承诺 1',
    run: () => {
      const got = validateArgs(ARRAY_SCHEMA, { tags: [], mode: 'middle' })
      if (!got) return 'mode 不在 enum 里，却没有被拒'
      return got.includes('mode') ? '' : `错误信息里没有字段名：${got}`
    },
  },
  {
    name: 'A5 · ★ 未知字段被拒',
    weight: 12,
    clause: '承诺 1（最容易漏的一条）',
    run: () => {
      const got = validateArgs(ARRAY_SCHEMA, { tags: [], extra: 1 })
      if (!got) return 'schema 里没有 extra，却没有被拒'
      return got.includes('extra') ? '' : `错误信息里没有字段名：${got}`
    },
  },
  {
    name: 'A6 · 值不是对象时被拒',
    weight: 10,
    clause: '承诺 1',
    run: () => {
      const bad = [[], null, 42, 'abc']
      const failed = []
      for (const v of bad) {
        const got = validateArgs(ARRAY_SCHEMA, v)
        // ★ 这里只要求"返回错误信息"，不要求抛异常——校验失败是可预期的失败。
        if (!got || typeof got !== 'string') failed.push(JSON.stringify(v))
      }
      return failed.length ? `这些输入没有被拒：${failed.join('、')}` : ''
    },
  },
  {
    name: 'A7 · 数组元素类型不匹配被拒',
    weight: 8,
    clause: '承诺 1（items）',
    run: () => {
      const got = validateArgs(ARRAY_SCHEMA, { tags: ['ok', 42] })
      if (!got) return '数组里混入了数字，却没有被拒'
      return got.includes('tags') ? '' : `错误信息里没有定位：${got}`
    },
  },
  {
    name: 'A8 · ★ 数组下标的定位写成 tags[1]',
    weight: 12,
    clause: '承诺 1（能定位到字段）',
    run: () => {
      const got = validateArgs(ARRAY_SCHEMA, { tags: ['ok', 42] })
      if (!got) return '没有被拒'
      return got.includes('tags[1]') ? '' : `期望含 tags[1]，得到：${got}`
    },
  },

  // ── B 组：截断与最小防线 ────────────────────────────────
  {
    name: 'B1 · 未超限时原样返回',
    weight: 6,
    clause: '承诺 2',
    run: () => {
      const got = truncate('短文本', 100)
      return got === '短文本' ? '' : `期望原样返回，得到 ${JSON.stringify(got)}`
    },
  },
  {
    name: 'B2 · ★ 超限时保留头【与】尾',
    weight: 12,
    clause: '承诺 2（反直觉的一条）',
    run: () => {
      const text = 'HEAD-' + 'x'.repeat(2000) + '-TAIL'
      const got = truncate(text, 200)
      if (!got.includes('HEAD-')) return '开头的部分丢了'
      if (!got.includes('-TAIL')) return '结尾的部分丢了（只留头会丢掉结论）'
      return ''
    },
  },
  {
    name: 'B3 · 截断说明里含省略数与总长',
    weight: 8,
    clause: '承诺 2',
    run: () => {
      const text = 'y'.repeat(1000)
      const got = truncate(text, 400)
      if (!got.includes('600')) return `说明里没有"省略了多少"（应为 600）：${JSON.stringify(got.slice(0, 120))}`
      if (!got.includes('1000')) return `说明里没有"原文总长"（应为 1000）：${JSON.stringify(got.slice(0, 120))}`
      return ''
    },
  },
  {
    name: 'B4 · resolveInside 返回工作目录内的绝对路径',
    weight: 6,
    clause: '承诺 3',
    run: () => {
      const base = join(tmpdir(), 'work')
      const got = resolveInside(base, 'src/index.ts')
      if (typeof got !== 'string') return `返回值不是字符串，而是 ${typeof got}`
      if (!got.startsWith(base)) return `结果不在工作目录内：${got}`
      return ''
    },
  },
  {
    name: 'B5 · ★ 越界路径抛错',
    weight: 10,
    clause: '承诺 3',
    run: () => {
      const base = join(tmpdir(), 'work')
      try {
        const got = resolveInside(base, '../outside/secret.txt')
        return `没有抛错，而是返回了 ${got}`
      } catch (e) {
        return e instanceof Error ? '' : `抛的不是 Error，而是 ${typeof e}`
      }
    },
  },
  {
    name: 'B6 · ★ 前缀比较必须带分隔符（work-evil 不算 inside）',
    weight: 12,
    clause: '承诺 3（最容易写错的一行）',
    run: () => {
      const base = join(tmpdir(), 'work')
      try {
        const got = resolveInside(base, '../work-evil/x')
        return `没有抛错——它把 ${got} 当成了工作目录内的路径`
      } catch {
        return ''
      }
    },
  },

  // ── C 组：注册表 ────────────────────────────────────────
  {
    name: 'C1 · register 返回函数，list 里出现新工具',
    weight: 8,
    clause: '承诺 4、5',
    run: () => {
      const r = new ToolRegistry()
      const off = r.register(tool())
      if (typeof off !== 'function') return `register 返回的是 ${typeof off}，不是函数`
      const names = r.list().map((t) => t.name)
      return names.includes('echo') ? '' : `list() 里没有 echo：${JSON.stringify(names)}`
    },
  },
  {
    name: 'C2 · 调用卸载函数后工具从 list 消失',
    weight: 8,
    clause: '承诺 4',
    run: () => {
      const r = new ToolRegistry()
      const off = r.register(tool())
      off()
      return r.list().length === 0 ? '' : `卸载后 list() 还有 ${r.list().length} 项`
    },
  },
  {
    name: 'C3 · 卸载函数可以重复调用（不抛）',
    weight: 6,
    clause: '承诺 4',
    run: () => {
      const r = new ToolRegistry()
      const off = r.register(tool())
      off()
      try {
        off()
        return ''
      } catch (e) {
        return `第二次调用卸载函数抛错了：${e?.message ?? e}`
      }
    },
  },
  {
    name: 'C4 · 重名注册抛错',
    weight: 8,
    clause: '承诺 4',
    run: () => {
      const r = new ToolRegistry()
      r.register(tool())
      try {
        r.register(tool())
        return '重复注册同一个名字，却没有抛错'
      } catch (e) {
        return e instanceof Error ? '' : `抛的不是 Error，而是 ${typeof e}`
      }
    },
  },
  {
    name: 'C5 · ★ list() 可 JSON 往返，且不含实现',
    weight: 10,
    clause: '承诺 5、不变量 1',
    run: () => {
      const r = new ToolRegistry()
      r.register(tool())
      const listed = r.list()
      if (typeof listed?.[0]?.run === 'function') return 'list() 把实现（run）也返回了——它不可序列化'
      const back = JSON.parse(JSON.stringify(listed))
      if (JSON.stringify(back) !== JSON.stringify(listed)) return 'JSON 往返之后结构变了'
      return back[0]?.name === 'echo' ? '' : '往返之后 name 丢了'
    },
  },
  {
    name: 'C6 · 未注册的工具名返回 ok:false（不抛）',
    weight: 10,
    clause: '承诺 6 第 1 步、承诺 10',
    run: async () => {
      const r = new ToolRegistry()
      let got
      try {
        got = await r.run('nope', '{}', CTX)
      } catch (e) {
        return `抛错了（应当返回失败结果）：${e?.message ?? e}`
      }
      if (got?.ok !== false) return `期望 ok:false，得到 ${JSON.stringify(got)}`
      return typeof got.error === 'string' && got.error.length > 0 ? '' : '没有给出错误信息'
    },
  },
  {
    name: 'C7 · 参数不是合法 JSON 时返回 ok:false（不抛）',
    weight: 10,
    clause: '承诺 6 第 2 步',
    run: async () => {
      const r = new ToolRegistry()
      r.register(tool())
      let got
      try {
        got = await r.run('echo', '{"text":', CTX)
      } catch (e) {
        return `抛错了：${e?.message ?? e}`
      }
      return got?.ok === false ? '' : `期望 ok:false，得到 ${JSON.stringify(got)}`
    },
  },
  {
    name: 'C8 · 参数不合 schema 时错误信息能定位字段',
    weight: 10,
    clause: '承诺 6 第 3 步',
    run: async () => {
      const r = new ToolRegistry()
      r.register(tool())
      const got = await r.run('echo', '{"text":1}', CTX)
      if (got?.ok !== false) return `期望 ok:false，得到 ${JSON.stringify(got)}`
      return String(got.error).includes('text') ? '' : `错误信息里没有字段名：${got.error}`
    },
  },
  {
    name: 'C9 · 工具返回 ok:false 时原样透传它的 error',
    weight: 10,
    clause: '承诺 6 第 4 步',
    run: async () => {
      const r = new ToolRegistry()
      r.register(tool({ run: () => ({ ok: false, error: '文件不存在：a.txt' }) }))
      const got = await r.run('echo', '{"text":"x"}', CTX)
      if (got?.ok !== false) return `期望 ok:false，得到 ${JSON.stringify(got)}`
      if (!String(got.error).includes('文件不存在：a.txt')) return `工具的 error 被改写了：${got.error}`
      if (got.internal) return '把一次普通失败标成了 internal'
      return ''
    },
  },
  {
    name: 'C10 · ★ 工具实现抛异常时结果是 ok:false 且带 internal',
    weight: 14,
    clause: '承诺 7（与普通失败的区别）',
    run: async () => {
      const r = new ToolRegistry()
      r.register(tool({ run: () => { throw new Error('Cannot read properties of undefined') } }))
      let got
      try {
        got = await r.run('echo', '{"text":"x"}', CTX)
      } catch (e) {
        return `run 把异常漏出去了：${e?.message ?? e}`
      }
      if (got?.ok !== false) return `期望 ok:false，得到 ${JSON.stringify(got)}`
      return got.internal === true ? '' : '没有标 internal——"写错了"被伪装成了一次普通失败'
    },
  },
  {
    name: 'C11 · ★ 长结果被截断（成功路径）',
    weight: 10,
    clause: '不变量 1',
    run: async () => {
      const r = new ToolRegistry()
      const long = 'HEAD-' + 'x'.repeat(5000) + '-TAIL'
      r.register(tool({ run: () => ({ ok: true, content: long }) }))
      const got = await r.run('echo', '{"text":"x"}', CTX)
      if (got?.ok !== true) return `期望成功，得到 ${JSON.stringify(got)}`
      if (got.content.length >= long.length) return `结果没有被截断（${got.content.length} 字符）`
      if (!got.content.includes('HEAD-')) return '截断把开头丢了'
      return got.content.includes('-TAIL') ? '' : '截断把结尾丢了'
    },
  },
  {
    name: 'C12 · ★ 长错误信息也被截断（失败路径）',
    weight: 12,
    clause: '不变量 1（最容易漏的一半）',
    run: async () => {
      const r = new ToolRegistry()
      const longErr = '错误开始' + 'x'.repeat(5000) + '错误结尾'
      r.register(tool({ run: () => ({ ok: false, error: longErr }) }))
      const got = await r.run('echo', '{"text":"x"}', CTX)
      if (got?.ok !== false) return `期望 ok:false，得到 ${JSON.stringify(got)}`
      if (got.error.length >= longErr.length) return `失败的文本没有被截断（${got.error.length} 字符）`
      return got.error.includes('错误结尾') ? '' : '截断把结尾丢了'
    },
  },
  {
    name: 'C13 · run 不改变工具集',
    weight: 6,
    clause: '承诺 9',
    run: async () => {
      const r = new ToolRegistry()
      r.register(tool())
      const before = JSON.stringify(r.list())
      await r.run('echo', '{"text":"x"}', CTX)
      await r.run('nope', '{}', CTX)
      return JSON.stringify(r.list()) === before ? '' : 'run 之后 list() 变了'
    },
  },
  {
    name: 'C14 · 未声明 sideEffect 时缺省为 irreversible',
    weight: 8,
    clause: '不变量 2',
    run: () => {
      const bare = tool()
      delete bare.sideEffect
      const got = resolveSideEffect(bare)
      return got === 'irreversible' ? '' : `缺省值是 ${JSON.stringify(got)}，应当是 'irreversible'`
    },
  },
  {
    name: 'C15 · SIDE_EFFECTS 是四级且顺序正确',
    weight: 6,
    clause: '不变量 3',
    run: () => {
      const want = ['readonly', 'reversible', 'irreversible', 'external']
      if (!Array.isArray(SIDE_EFFECTS)) return `SIDE_EFFECTS 不是数组，而是 ${typeof SIDE_EFFECTS}`
      return JSON.stringify(SIDE_EFFECTS) === JSON.stringify(want)
        ? ''
        : `期望 ${JSON.stringify(want)}，得到 ${JSON.stringify(SIDE_EFFECTS)}`
    },
  },
]

// ── 静态检查：声明为只读的工具里不该出现写操作 ──────────────
// 它挡不住恶意的实现，但能挡住"忘了声明"与"声明写错"这两类（讲义 L9 第二条）。
const WRITE_WORDS = /\b(writeFile|writeFileSync|appendFile|rmSync|rm|unlink|rmdir|mkdir)\b/

function staticCheck() {
  let src
  try {
    src = readFileSync(new URL(IMPL, import.meta.url), 'utf8')
  } catch {
    return { ok: false, why: `读不到实现文件 ${IMPL}` }
  }
  const lines = src.split('\n')
  const offenders = []
  for (const [i, line] of lines.entries()) {
    if (!/sideEffect:\s*['"]readonly['"]/.test(line)) continue
    const window = lines.slice(Math.max(0, i - 6), i + 6).join('\n')
    if (WRITE_WORDS.test(window)) offenders.push(`第 ${i + 1} 行附近`)
  }
  if (offenders.length) {
    return { ok: false, why: `声明为 readonly，但附近出现了写操作：${offenders.join('、')}` }
  }
  return { ok: true, why: '声明为只读的工具附近没有写操作' }
}

// ── 执行 ────────────────────────────────────────────────
console.log('')
console.log('══ 2.2 工具系统 · 构建题判分（按契约逐条检查）══')
console.log(`实现：${IMPL}`)
console.log('')

let earned = 0
let total = 0
const failures = []

// 前置校验：实现仍是模板时直接判 0 分。
// 否则"否定式判据"（例如"代码里不出现厂商字样"）会在空实现上白送分。
const IMPL_SOURCE = readFileSync(new URL(IMPL, import.meta.url), 'utf8')
const UNFILLED = /\bTODO\s*\d/.test(IMPL_SOURCE)
if (UNFILLED) console.log('实现仍是模板（含 TODO 标记），按未作答记 0 分。\n')

for (const c of CASES) {
  total += c.weight
  let why = ''
  if (UNFILLED) {
    why = '实现仍是模板（含 TODO 标记）'
  } else {
    try {
      why = (await c.run()) || ''
    } catch (e) {
      why = `检查本身抛错：${e?.message ?? e}`
    }
  }
  if (why) {
    failures.push(c.name)
    console.log(`❌ ${c.name}`)
    console.log(`   （${c.clause}）`)
    console.log(`   ${why}`)
  } else {
    earned += c.weight
    if (VERBOSE) console.log(`✅ ${c.name}  （${c.clause}）`)
  }
}

{
  total += 10
  const r = UNFILLED ? { ok: false, why: '实现仍是模板（含 TODO 标记）' } : staticCheck()
  if (r.ok) {
    earned += 10
    if (VERBOSE) console.log(`✅ E1 · 声明为只读的工具附近没有写操作  （讲义 1.8 的"声明 + 强制"）`)
  } else {
    failures.push('E1')
    console.log(`❌ E1 · 声明为只读的工具附近没有写操作`)
    console.log(`   ${r.why}`)
  }
}

const pct = total > 0 ? earned / total : 0
const bar = '█'.repeat(Math.round(pct * 20)).padEnd(20, '░')
console.log('')
console.log(`${bar}  ${earned} / ${total}  （${Math.round(pct * 100)}%）`)
console.log('')

if (failures.length === 0) {
  console.log('优秀——行为稳定，可以认为这一项已经做好。')
} else if (pct >= 0.7) {
  console.log(`还差几项：${failures.join('、')}。用 --verbose 看通过的项。`)
} else {
  console.log('★ 远未完成。建议先读 CONTRACT-tools.md，特别是标着"最容易漏"的那几条。')
}

console.log('')
console.log('（对照参考答案：IMPL=../grade/tools.reference.mjs node tests/t4-build.mjs）')
console.log('')

process.exit(pct >= 0.5 ? 0 : 1)
