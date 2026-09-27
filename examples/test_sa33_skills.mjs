// 4.2 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  LIMITS, disclosureCost, readMetaOnly, indexSkill, relevance, selectSkills,
  loadSkillBody, validateSkill, detectConflicts,
} from './sa33_skills.mjs'

let pass = 0
let fail = 0
const near = (a, b, tol, label) => {
  if (Math.abs(a - b) <= tol) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${a}，期望 ${b}`)
}
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return }
  fail++
  console.log(`不通过：${label} —— 得到 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}`)
}
const ok = (c, label) => {
  if (c) { pass++; return }
  fail++
  console.log(`不通过：${label}`)
}

// 命题 4.2.1：三层成本
{
  const c = disclosureCost(100, 1500, 10000, 20)
  eq(c.c1, 2000, '只给描述的成本是 2000')
  eq(c.c2, 32000, '描述加主体的成本是 32000')
  eq(c.c3, 232000, '全量成本是 232000')
  eq(c.ratio, 116, '全量与描述之比是 116')
  ok(c.c2 / c.c1 === 16, '第二层是第一层的 16 倍')
  ok(c.c3 > 131072, '全量超过 128K 窗口')
  ok(c.c2 < 131072, '不含主体的全量仍在窗口内')
  eq(disclosureCost(100, 1500, 10000, 0).c3, 0, '技能数为零时成本为零')
  eq(disclosureCost(0, 1500, 10000, 20).c1, 0, '描述长度为零时第一层成本为零')
}

// 命题 4.2.5 / 定义 4.2.2：索引只读元数据
{
  eq(LIMITS.name, 64, '名称上限 64')
  eq(LIMITS.description, 1024, '描述上限 1024')
  const metaText = '---\nname: a\ndescription: b\n---\n'
  const full = metaText + 'b'.repeat(1500)
  eq(readMetaOnly(full), metaText, '只读出前置元数据部分')
  eq(readMetaOnly('没有元数据'), '没有元数据', '没有元数据时返回全文')
  const r = indexSkill(full)
  eq(r.ok, true, '合法技能索引通过')
  eq(r.meta.name, 'a', '名称被解析')
  eq(r.metaChars, metaText.length, '索引读取的字符数等于元数据长度')
  eq(r.fullChars, full.length, '全文长度被记录')
  ok(r.metaChars / r.fullChars < 0.1, '索引读取量不足全文的一成')
}
{
  eq(indexSkill('没有前置元数据').reason, '缺少前置元数据', '缺元数据被拒')
  eq(indexSkill('---\nname: x\n---\n主体').reason, 'name 与 description 必填', '缺必填字段被拒')
  const long = indexSkill(`---\nname: x\ndescription: ${'x'.repeat(2000)}\n---\n主体`)
  eq(long.ok, false, '描述超长被拒')
  ok(long.reason.includes('1024'), '拒绝原因含上限值')
  const exact = indexSkill(`---\nname: x\ndescription: ${'x'.repeat(1024)}\n---\n主体`)
  eq(exact.ok, true, '恰好等于上限时通过')
}

// 定义 4.2.3：触发
{
  near(relevance('add a migration', 'writing migration code'), 1 / 3, 1e-9, '三分之一关键词命中')
  eq(relevance('完全无关', 'writing migration code'), 0, '没有关键词命中')
  eq(relevance('anything', ''), 0, '空描述的相关性为零')
  ok(relevance('run tests before push', 'run tests before pushing commits') > 0, '部分命中时得分大于零')
  ok(relevance('run tests before push', 'run tests before pushing commits') < 1, '并非全部命中时得分小于一')
}
{
  const metas = [
    { name: 'db-migration', description: 'change database schema before writing migration code' },
    { name: 'test-before-push', description: 'run tests before pushing commits' },
    { name: 'changelog', description: 'update changelog before release' },
  ]
  const task = 'add a column to the users table, need a migration'
  const picked = selectSkills(task, metas, { threshold: 0.1, maxLoad: 2 })
  eq(picked.length, 1, '相关任务只命中一个技能')
  eq(picked[0].name, 'db-migration', '命中的是数据库迁移技能')
  eq(selectSkills('translate this paragraph to French', metas, { threshold: 0.1, maxLoad: 2 }).length, 0, '不相关任务不加载')
  eq(selectSkills('无关任务', metas, { explicitName: 'changelog', threshold: 0.9, maxLoad: 1 })[0].name, 'changelog', '显式指定压过相关性')
  eq(selectSkills(task, metas, { threshold: 0.5, maxLoad: 2 }).length, 0, '提高阈值后不加载')
  eq(selectSkills(task, metas, { threshold: 0.01, maxLoad: 3 }).length, 1, '阈值极低时仍只有相关的那一个命中')
  eq(selectSkills(task, metas, { threshold: 0.01, maxLoad: 1 }).length, 1, 'maxLoad 限制加载数量')
  eq(selectSkills(task, metas, { explicitName: 'nope', threshold: 0.1 }).length, 0, '显式指定未匹配时返回空')
}

// 定义 4.2.2：加载
{
  const events = []
  const meta = { name: 'db-migration', description: 'change database schema' }
  const text = loadSkillBody(meta, '第一步……第二步……', [
    { purpose: '迁移模板', path: 'resources/template.sql' },
    { purpose: '回滚脚本', path: 'resources/rollback.sql' },
  ], events, 1000)
  eq(events.length, 1, '加载产生一条事件')
  eq(events[0].type, 'skill/load', '事件类型正确')
  eq(events[0].name, 'db-migration', '事件带技能名')
  eq(events[0].at, 1000, '事件带时间')
  ok(text.includes('# 技能：db-migration'), '加载文本带标题')
  ok(text.includes('resources/template.sql'), '资源路径被列出')
  ok(text.includes('resources/rollback.sql'), '第二个资源也被列出')
  ok(text.includes('迁移模板'), '资源用途被列出')
  ok(!text.includes('CREATE TABLE'), '资源内容不被内联')
}

// 定义 4.2.5：三阶段验证
{
  const noCheck = validateSkill({ name: 'a' }, () => 'x', () => ({ ok: true }), 1)
  eq(noCheck.phase, 'static', '缺少 check 时停在静态阶段')
  eq(noCheck.ok, false, '静态失败时整体为失败')
  const noBody = validateSkill({ name: 'a', check: 'run' }, () => null, () => ({ ok: true }), 1)
  eq(noBody.phase, 'load', '主体读不出时停在加载阶段')
  eq(noBody.reason, '主体无法加载', '加载失败的原因正确')
  const badCheck = validateSkill({ name: 'a', check: 'run' }, () => 'x', () => ({ ok: false, summary: '命令失败' }), 1)
  eq(badCheck.phase, 'check', '检查不通过时停在检查阶段')
  eq(badCheck.reason, '命令失败', '检查失败的原因来自运行结果')
  const good = validateSkill({ name: 'a', check: 'run' }, () => 'x', () => ({ ok: true, summary: 'ok' }), 7)
  eq(good.ok, true, '检查通过时整体通过')
  eq(good.checkedAt, 7, '通过时记录验证时间')
  eq(good.phase, 'check', '通过时阶段字段仍是检查')
  ok(badCheck.phase !== noBody.phase, '两个失败阶段可区分')
}

// 命题 4.2.6：冲突检测
{
  const events = [
    { type: 'skill/load', name: 'db-migration', at: 1 },
    { type: 'skill/load', name: 'schema-review', at: 1 },
  ]
  const applies = { 'db-migration': ['migration'], 'schema-review': ['migration', 'review'] }
  const conflicts = detectConflicts(events, applies)
  eq(conflicts.length, 1, '同一次任务里发现一条冲突')
  eq(conflicts[0].pair, ['db-migration', 'schema-review'], '冲突的两个技能被列出')
  eq(conflicts[0].overlap, ['migration'], '重叠的适用条件被列出')
  eq(detectConflicts([{ type: 'skill/load', name: 'a' }, { type: 'skill/load', name: 'b' }], { a: ['x'], b: ['y'] }).length, 0, '条件不重叠时不报冲突')
  eq(detectConflicts([], {}).length, 0, '没有加载事件时不报冲突')
  eq(detectConflicts([{ type: 'skill/load', name: 'a' }], { a: ['x'] }).length, 0, '只有一个技能时不报冲突')
}
{
  // 分时冲突：两次加载落在不同任务的事件里，检测不到
  const task1 = [{ type: 'skill/load', name: 'old-flow', at: 1 }]
  const task2 = [{ type: 'skill/load', name: 'new-flow', at: 2 }]
  const applies = { 'old-flow': ['deploy'], 'new-flow': ['deploy'] }
  eq(detectConflicts(task1, applies).length, 0, '分时使用在同一批次里检测不到')
  eq(detectConflicts(task2, applies).length, 0, '另一批次同样检测不到')
  eq(detectConflicts([...task1, ...task2], applies).length, 1, '把两批合起来才检测到')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
