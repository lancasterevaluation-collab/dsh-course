// 4.2 技能的算例。
// 每个导出函数对应讲义里的一个定义或命题，讲义中引用的数字都由这里复现。
import { pathToFileURL } from 'node:url'

/** 定义 4.2.2：三层的元数据长度限制（与规范的字段限制一致）。 */
export const LIMITS = { name: 64, description: 1024 }

/**
 * 命题 4.2.1：三种披露策略的注入成本。
 * @param d 描述长度（token）
 * @param b 主体长度（token）
 * @param r 资源长度（token）
 * @param n 技能数
 * @returns `{ c1, c2, c3, ratio }`
 */
export function disclosureCost(d, b, r, n) {
  const c1 = n * d
  const c2 = n * (d + b)
  const c3 = n * (d + b + r)
  return { c1, c2, c3, ratio: c3 / c1 }
}

/**
 * 命题 4.2.5：索引阶段只读前置元数据。
 * @param full 技能文件的全文
 * @returns 前置元数据部分；没有时返回全文
 */
export function readMetaOnly(full) {
  const m = /^---\n[\s\S]*?\n---\n/.exec(full)
  return m ? m[0] : full
}

/**
 * 定义 4.2.5 / 4.2.2：索引一个技能——只读元数据并校验必填与长度。
 * @param full 技能文件全文
 * @returns `{ ok, meta, reason, metaChars }`
 */
export function indexSkill(full) {
  const metaText = readMetaOnly(full)
  const m = /^---\n([\s\S]*?)\n---\n/.exec(full)
  if (!m) return { ok: false, reason: '缺少前置元数据', metaChars: metaText.length }
  const meta = Object.fromEntries(
    m[1].split('\n').filter(Boolean).map((line) => {
      const i = line.indexOf(':')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    }),
  )
  if (!meta.name || !meta.description) return { ok: false, reason: 'name 与 description 必填', metaChars: metaText.length }
  if (meta.description.length > LIMITS.description) return { ok: false, reason: `描述超过 ${LIMITS.description} 字符`, metaChars: metaText.length }
  return { ok: true, meta, metaChars: metaText.length, fullChars: full.length }
}

/**
 * 定义 4.2.3：任务与描述的相关性——描述里的关键词有多少出现在任务中。
 * @param task 任务描述
 * @param description 技能描述
 * @returns 0 到 1 之间的得分
 */
export function relevance(task, description) {
  const words = description.toLowerCase().split(/[\s,，。;；]+/).filter((w) => w.length >= 2)
  if (words.length === 0) return 0
  const hit = words.filter((w) => task.toLowerCase().includes(w)).length
  return hit / words.length
}

/**
 * 定义 4.2.3：触发——显式指定优先，其次是检索匹配。
 * @param task 任务描述
 * @param metas 元数据数组
 * @param opts `{ explicitName, threshold, maxLoad }`
 * @returns 选中的元数据数组
 */
export function selectSkills(task, metas, opts) {
  if (opts.explicitName) return metas.filter((m) => m.name === opts.explicitName)
  return metas
    .map((m) => ({ m, s: relevance(task, m.description) }))
    .filter((x) => x.s >= opts.threshold)
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.maxLoad)
    .map((x) => x.m)
}

/**
 * 定义 4.2.2：加载主体、追加事件、只列资源引用。
 * @param meta 元数据
 * @param body 主体文本
 * @param resources 资源数组（`{ purpose, path }`）
 * @param events 事件数组（会被追加）
 * @param now 当前时间
 * @returns 给模型的一段文本
 */
export function loadSkillBody(meta, body, resources, events, now) {
  events.push({ type: 'skill/load', name: meta.name, at: now })
  const lines = [`# 技能：${meta.name}`, meta.description, '', body, '', '## 可用资源']
  for (const r of resources) lines.push(`- ${r.purpose}：${r.path}`)
  return lines.join('\n')
}

/**
 * 定义 4.2.5：三阶段验证。
 * @param meta 元数据
 * @param loader 主体加载函数，读不到时返回 null
 * @param runner 检查运行函数，返回 `{ ok, summary }`
 * @param now 当前时间
 * @returns `{ ok, phase, reason, checkedAt }`
 */
export function validateSkill(meta, loader, runner, now) {
  if (!meta.check) return { ok: false, phase: 'static', reason: '缺少 check 字段' }
  const body = loader(meta.name)
  if (body === null) return { ok: false, phase: 'load', reason: '主体无法加载' }
  const r = runner(meta.check)
  return { ok: r.ok, phase: 'check', reason: r.summary, checkedAt: now }
}

/**
 * 命题 4.2.6：从同一次任务的加载事件里发现重叠。
 * @param events 事件数组
 * @param appliesBySkill 技能名到适用条件数组的映射
 * @returns 冲突数组
 */
export function detectConflicts(events, appliesBySkill) {
  const loaded = events.filter((e) => e.type === 'skill/load').map((e) => e.name)
  const conflicts = []
  for (let i = 0; i < loaded.length; i++) {
    for (let j = i + 1; j < loaded.length; j++) {
      const a = appliesBySkill[loaded[i]] ?? []
      const b = appliesBySkill[loaded[j]] ?? []
      const overlap = a.filter((x) => b.includes(x))
      if (overlap.length) conflicts.push({ pair: [loaded[i], loaded[j]], overlap })
    }
  }
  return conflicts
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(44)} ${v}`)

  rows.push('4.2 技能 · 算例（SA-33）')
  rows.push('')

  rows.push('[1] 三层披露的成本')
  const cost = disclosureCost(100, 1500, 10000, 20)
  line('技能数', 20)
  line('只给描述的 token 数', cost.c1)
  line('描述加全部主体的 token 数', cost.c2)
  line('全量含资源的 token 数', cost.c3)
  line('全量与只给描述之比', cost.ratio)
  line('全量是否超过 128K 窗口', cost.c3 > 131072)
  line('只给主体（不含资源）是否超窗口', cost.c2 > 131072)
  rows.push('')

  rows.push('[2] 索引与校验')
  const metaText = '---\nname: db-migration\ndescription: change database schema use before writing migration code\n---\n'
  const full = metaText + 'b'.repeat(1500)
  const good = indexSkill(full)
  line('合法技能的索引结果', good.ok)
  line('索引读取的字符数', good.metaChars)
  line('全文的字符数', good.fullChars)
  line('索引读取占全文的比例', (good.metaChars / good.fullChars).toFixed(3))
  line('缺少前置元数据的拒绝原因', indexSkill('没有前置元数据的文件').reason)
  line('缺必填字段的拒绝原因', indexSkill('---\nname: x\n---\n主体').reason)
  line('描述超长的拒绝原因', indexSkill(`---\nname: x\ndescription: ${'x'.repeat(2000)}\n---\n主体`).reason)
  rows.push('')

  rows.push('[3] 触发')
  const metas = [
    { name: 'db-migration', description: 'change database schema before writing migration code' },
    { name: 'test-before-push', description: 'run tests before pushing commits' },
    { name: 'changelog', description: 'update changelog before release' },
  ]
  const task = 'add a column to the users table, need a migration'
  const picked = selectSkills(task, metas, { threshold: 0.1, maxLoad: 2 })
  line('检索命中的技能', picked.map((m) => m.name).join(', ') || '无')
  line('不相关任务的命中数', selectSkills('translate this paragraph to French', metas, { threshold: 0.1, maxLoad: 2 }).length)
  line('显式指定的命中数', selectSkills('无关任务', metas, { explicitName: 'changelog', threshold: 0.9, maxLoad: 1 }).length)
  line('显式指定压过相关性', selectSkills('无关任务', metas, { explicitName: 'changelog', threshold: 0.9, maxLoad: 1 })[0].name)
  line('提高阈值后命中数', selectSkills(task, metas, { threshold: 0.5, maxLoad: 2 }).length)
  rows.push('')

  rows.push('[4] 加载与验证')
  const events = []
  const text = loadSkillBody(metas[0], '第一步……第二步……', [{ purpose: '迁移模板', path: 'resources/template.sql' }], events, 1000)
  line('加载事件数', events.length)
  line('加载文本含资源路径', text.includes('resources/template.sql'))
  line('加载文本不含资源内容', !text.includes('CREATE TABLE'))
  line('缺少 check 的阶段', validateSkill({ name: 'a' }, () => 'x', () => ({ ok: true }), 1).phase)
  line('主体读不出的阶段', validateSkill({ name: 'a', check: 'run' }, () => null, () => ({ ok: true }), 1).phase)
  line('检查不通过的阶段', validateSkill({ name: 'a', check: 'run' }, () => 'x', () => ({ ok: false, summary: '命令失败' }), 1).phase)
  line('检查通过时的结果', validateSkill({ name: 'a', check: 'run' }, () => 'x', () => ({ ok: true, summary: 'ok' }), 7).ok)
  line('通过时记录验证时间', validateSkill({ name: 'a', check: 'run' }, () => 'x', () => ({ ok: true, summary: 'ok' }), 7).checkedAt)
  rows.push('')

  rows.push('[5] 冲突')
  const runEvents = [
    { type: 'skill/load', name: 'db-migration', at: 1 },
    { type: 'skill/load', name: 'schema-review', at: 1 },
  ]
  const applies = { 'db-migration': ['migration'], 'schema-review': ['migration', 'review'] }
  const conflicts = detectConflicts(runEvents, applies)
  line('同一次任务里的冲突数', conflicts.length)
  line('重叠的适用条件', conflicts[0]?.overlap.join(', '))
  line('不重叠时不报冲突', detectConflicts([{ type: 'skill/load', name: 'a' }, { type: 'skill/load', name: 'b' }], { a: ['x'], b: ['y'] }).length)

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
