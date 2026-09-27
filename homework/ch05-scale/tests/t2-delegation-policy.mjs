// Part B 的判据（分析题）。对应讲义 5.4 与 kit/problems/b-delegation.questions.md。
import { readFileSync } from 'node:fs'
import { createSuite, assert, report } from './harness.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--answers')
const path = i >= 0 ? args[i + 1] : 'kit/answers/b-delegation.json'
const s = createSuite('Part B · 派发协议与信任边界', { weight: 15 })

/** 含糊的目标写法（它们在题目里正是"不可判定"的原型）。 */
const VAGUE = ['看一下', '研究一下', '修一下', '补上', '看看', '搞一下']
/** 约束必须是判据形式。 */
const CONSTRAINT = /(不得|必须|只能|不允许|不超过|不少于|至少|通过|等于)/
const CEILINGS = ['read', 'write', 'destructive', 'system']

let data = null
let loadError = null
try { data = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { loadError = e.message }

s.check('B1 答案文件可读且结构齐全', () => {
  assert.ok(!loadError, `无法读取 ${path}：${loadError}`)
  assert.ok(Array.isArray(data.delegations), '缺少 delegations 数组')
  assert.ok(Array.isArray(data.boundaries), '缺少 boundaries 数组')
})

s.check('B2 delegations 有 6 项且 id 齐全', () => {
  assert.eq(data.delegations.length, 6)
  assert.eq(data.delegations.map((d) => d.id).sort().join(','), ['t1', 't2', 't3', 't4', 't5', 't6'].join(','))
})

s.check('B3 每份协议的目标可判定（不是含糊说法）', () => {
  for (const d of data.delegations) {
    const goal = String(d.goal ?? '')
    assert.ok(goal.length >= 8, `${d.id} 的目标过短`)
    for (const v of VAGUE) {
      assert.ok(!goal.includes(v), `${d.id} 的目标含含糊说法「${v}」——它不可判定`)
    }
  }
})

s.check('B4 上下文子集说明"不给什么"，且约束至少两条并写成判据', () => {
  for (const d of data.delegations) {
    const notGive = d.context?.notGive
    assert.ok(Array.isArray(notGive) && notGive.length > 0, `${d.id} 必须说明不给什么`)
    assert.ok(Array.isArray(d.constraints) && d.constraints.length >= 2, `${d.id} 至少两条约束`)
    for (const c of d.constraints) {
      assert.ok(CONSTRAINT.test(String(c)), `${d.id} 的约束「${c}」不是判据形式`)
    }
  }
})

s.check('B5 每份协议给出产出格式与容量', () => {
  for (const d of data.delegations) {
    const f = d.outputFormat
    assert.ok(f && ['text', 'patch', 'list'].includes(f.kind), `${d.id} 的产出格式类型非法：${f?.kind}`)
    assert.ok(typeof f.maxChars === 'number' && f.maxChars > 0, `${d.id} 必须给出容量（maxChars）`)
  }
})

s.check('B6 四条信任边界：维度齐全、默认最小集、等级由配置指定', () => {
  assert.eq(data.boundaries.length, 4)
  for (const b of data.boundaries) {
    assert.ok(b.fs && Array.isArray(b.fs.read) && Array.isArray(b.fs.write), `${b.id} 缺少文件白名单`)
    assert.ok(Array.isArray(b.net), `${b.id} 缺少网络白名单`)
    assert.ok(b.budget && typeof b.budget.callsPerMinute === 'number', `${b.id} 缺少配额`)
    assert.eq(b.contextSharing?.parentHistory, false, `${b.id} 默认不得共享父会话历史`)
    assert.ok(['filtered', 'none'].includes(b.contextSharing?.memory), `${b.id} 的记忆共享取值非法`)
    assert.ok(CEILINGS.includes(b.sideEffectCeiling), `${b.id} 的副作用等级非法：${b.sideEffectCeiling}`)
    assert.ok(String(b.escapeAttempt ?? '').length > 4, `${b.id} 必须给出一条越界尝试`)
  }
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
