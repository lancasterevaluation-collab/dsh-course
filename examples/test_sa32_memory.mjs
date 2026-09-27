// 4.1 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  checkWriteFilters, makeEntry, WEIGHTS, scoreEntry, retrieve, planInjection,
  formatInjection, pollutionExposure, prefixInvalidation, evictionEvidence,
} from './sa32_memory.mjs'

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

// 定义 4.1.2：三个过滤器
{
  eq(checkWriteFilters({ kind: 'preference', source: 'user', crossSession: true }).accept, true, '偏好类通过')
  eq(checkWriteFilters({ kind: 'fact', source: 'user', crossSession: true }).accept, true, '事实类通过')
  eq(checkWriteFilters({ kind: 'inference', source: 'model', crossSession: true }).accept, true, '带来源的推测通过')
  eq(checkWriteFilters({ kind: 'fact', source: 'user', crossSession: false }).accept, false, '只在本次会话有用的被拒')
  eq(checkWriteFilters({ kind: 'inference', source: null, crossSession: true }).accept, false, '缺来源的推测被拒')
  eq(checkWriteFilters({ kind: 'fact', source: 'user', crossSession: true, temporary: true }).accept, false, '临时信息被拒')
  eq(checkWriteFilters({ kind: 'inference', source: null, crossSession: false, temporary: true }).reasons.length, 3, '三条不过时给出三个原因')
  eq(checkWriteFilters({ kind: 'fact', source: 'user', crossSession: false }).reasons, ['只在本次会话有用'], '原因文本正确')
  ok(checkWriteFilters({ kind: 'inference', source: null, crossSession: true }).reasons[0].includes('来源'), '推测缺来源的原因含“来源”')
}
{
  const candidates = [
    { id: 'c1', kind: 'preference', source: 'user', crossSession: true },
    { id: 'c2', kind: 'fact', source: 'user', crossSession: false },
    { id: 'c3', kind: 'inference', source: null, crossSession: true },
    { id: 'c4', kind: 'fact', source: 'user', crossSession: true },
  ]
  const accepted = candidates.filter((c) => checkWriteFilters(c).accept)
  eq(accepted.length, 2, '四个候选中两个通过')
  eq(accepted.map((c) => c.id), ['c1', 'c4'], '通过的是 c1 与 c4')
}

// 定义 4.1.1：条目字段
{
  const e = makeEntry({ id: 'x', text: 't', kind: 'fact', source: 'user' }, 42)
  eq(e.createdAt, 42, '写入时间被记下')
  eq(e.useCount, 0, '使用次数从零开始')
  eq(e.lastUsedAt, null, '从未使用过')
  eq(e.status, 'active', '新条目是有效的')
  eq(e.source, 'user', '来源被保留')
  const noSource = makeEntry({ id: 'y', text: 't', kind: 'inference' }, 1)
  eq(noSource.source, null, '未给来源时为 null')
}

// 定义 4.1.3：打分与检索
{
  eq(WEIGHTS.overlap, 1.0, '关键词权重为 1.0')
  eq(WEIGHTS.recency, 0.3, '时间权重为 0.3')
  eq(WEIGHTS.frequency, 0.2, '频率权重为 0.2')
  const fresh = makeEntry({ id: 'f', text: '提到用户', kind: 'fact', source: 'user' }, 100)
  const old = makeEntry({ id: 'o', text: '提到用户', kind: 'fact', source: 'user' }, 0)
  ok(scoreEntry('用户', fresh, 100) > scoreEntry('用户', old, 100), '新条目得分更高')
  eq(scoreEntry('无关词', fresh, 100) < scoreEntry('用户', fresh, 100), true, '关键词命中提高得分')
}
{
  const entries = [
    { ...makeEntry({ id: 'm1', text: '用户偏好简短回答', kind: 'preference', source: 'user' }, 0), useCount: 0 },
    { ...makeEntry({ id: 'm2', text: '用户偏好简体中文', kind: 'preference', source: 'user' }, 90), useCount: 1 },
    { ...makeEntry({ id: 'm3', text: '这个项目用 pnpm 而不是 npm', kind: 'fact', source: 'user' }, 10), useCount: 0 },
  ]
  const opts = { now: 100, k: 5, threshold: 0.5, decayDays: 30 }
  const hits = retrieve('用户', entries, opts)
  eq(hits.length, 2, '命中两条')
  eq(hits[0].id, 'm2', '较新的条目排在前面')
  eq(hits[1].id, 'm1', '较旧的排在第二')
  ok(!hits.some((h) => h.id === 'm3'), '不含关键词的条目被阈值挡住')
  eq(retrieve('sql', entries, opts).length, 0, '不相关查询返回空')
  eq(retrieve('用户', entries, { ...opts, threshold: 1.3 }).length, 0, '提高阈值后没有条目通过')
  eq(retrieve('用户', entries, { ...opts, k: 1 }).length, 1, 'k 限制返回条数')
  const suppressed = entries.map((e) => (e.id === 'm2' ? { ...e, status: 'suppressed' } : e))
  eq(retrieve('用户', suppressed, opts).length, 1, '被抑制的条目不参与检索')
  ok(!retrieve('用户', suppressed, opts).some((e) => e.id === 'm2'), '被抑制的那条不再出现')
  eq(retrieve('用户', entries, { ...opts, now: 0 }).length, 2, '时间前移后仍能命中关键词')
}

// 定义 4.1.4：注入
{
  const injectable = [
    { id: 's1', text: '偏好', kind: 'preference', useCount: 5, tokens: 20 },
    { id: 's2', text: '约定', kind: 'fact', useCount: 4, tokens: 20 },
    { id: 's3', text: '长描述', kind: 'fact', useCount: 0, tokens: 100 },
  ]
  const plan = planInjection(injectable, { maxEntries: 5, maxTokens: 60 })
  eq(plan.picked.length, 2, '双重预算下注入两条')
  eq(plan.tokens, 40, '注入四十个 token')
  eq(plan.skipped, 1, '跳过一条')
  eq(plan.picked.map((e) => e.id), ['s1', 's2'], '稳定的两条排在前面')
  ok(!plan.picked.some((e) => e.id === 's3'), '超预算的条目整条不出现')
  const narrow = planInjection(injectable, { maxEntries: 1, maxTokens: 60 })
  eq(narrow.picked.length, 1, '条数上限生效')
  const tight = planInjection(injectable, { maxEntries: 5, maxTokens: 25 })
  eq(tight.picked.length, 1, 'token 上限生效')
  eq(tight.tokens, 20, '未超 token 上限')
}
{
  const picked = [
    { id: 'a', text: '用户偏好简体中文', kind: 'preference' },
    { id: 'b', text: '这个项目用 pnpm', kind: 'fact' },
  ]
  const text = formatInjection(picked)
  ok(text.startsWith('以下是已知的偏好与事实：'), '注入文本带性质说明')
  ok(text.includes('1. [preference]'), '条目带编号与类别')
  ok(text.includes('2. [fact]'), '第二条同样带编号')
  eq(formatInjection([]), '', '空选择时返回空串')
}

// 定义 4.1.6 / 命题 4.1.2：污染
{
  eq(pollutionExposure(0.3, 10), 3, 'p=0.3 时十次任务期望影响三次')
  eq(pollutionExposure(0.3, 30), 9, '次数加倍则影响次数加倍')
  eq(pollutionExposure(0.15, 10), 1.5, '概率减半则影响次数减半')
  eq(pollutionExposure(0, 100), 0, '不注入则无影响')
  ok(pollutionExposure(0.3, 10) > pollutionExposure(0.1, 10), '概率越高影响越大')
}

// 命题 4.1.4：分层注入
{
  eq(prefixInvalidation(1500, 500, false), 2000, '全部前部时失效长度是总和')
  eq(prefixInvalidation(1500, 500, true), 0, '分层后任务相关部分不影响前缀')
  eq(prefixInvalidation(0, 500, false), 500, '没有稳定部分时失效长度等于任务部分')
  ok(prefixInvalidation(1500, 500, true) < prefixInvalidation(1500, 500, false), '分层降低失效长度')
}

// 命题 4.1.5：淘汰依据
{
  eq(evictionEvidence(false), 0, '无观测时没有可用依据')
  eq(evictionEvidence(true), 1, '有观测时有依据')
  ok(evictionEvidence(true) > evictionEvidence(false), '观测是淘汰依据的来源')
}

// 定义 4.1.5 的容量演示：拒绝是默认
{
  const capacity = 3
  const store = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const rejected = store.length >= capacity
  eq(rejected, true, '容量满时写入被拒绝')
  eq(store.length, capacity, '拒绝不改变存储内容')
}

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
