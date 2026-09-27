// Part B 的判据（分析题）。对应讲义 3.2 与 kit/problems/b-guard.questions.md。
//
// 用法：node tests/t2-guard.mjs --answers kit/answers/b-guard.json
//
// 「后果描述」的三条检查（不含反引号、不含命令名、含可恢复性）在这里被实现为可运行的判据——
// 它是本作业里少数能机械检查的写作质量。
import { readFileSync } from 'node:fs'
import { createSuite, assert, report } from './harness.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--answers')
const path = i >= 0 ? args[i + 1] : 'kit/answers/b-guard.json'

const s = createSuite('Part B · 守卫与审批', { weight: 15 })

/** 风险等级的答案表（与题目文件一致）。 */
const RISK_KEY = {
  op1: 'low', op2: 'low', op3: 'medium', op4: 'high', op5: 'critical',
  op6: 'medium', op7: 'critical', op8: 'high', op9: 'high', op10: 'critical',
}

/** 不可恢复的操作（高风险时不得默认 allow）。 */
const IRREVERSIBLE = new Set(['op3', 'op4', 'op5', 'op7', 'op8', 'op10'])

const COMMAND_NAMES = ['rm ', 'mv ', 'cp ', 'chmod', 'curl', 'dd ', 'git push', 'npm install']

let data = null
let loadError = null
try {
  data = JSON.parse(readFileSync(path, 'utf8'))
} catch (e) {
  loadError = e.message
}

s.check('B1 答案文件可读且结构齐全', () => {
  assert.ok(!loadError, `无法读取 ${path}：${loadError}`)
  assert.ok(Array.isArray(data.rules), '缺少 rules 数组')
  assert.ok(Array.isArray(data.policies), '缺少 policies 数组')
})

s.check('B2 规则项数与 id 齐全', () => {
  assert.eq(data.rules.length, 10, '应有 10 条规则')
  assert.eq(data.rules.map((r) => r.id).sort().join(','), Object.keys(RISK_KEY).sort().join(','))
})

s.check('B3 10 条风险等级正确（6 分）', () => {
  const wrong = data.rules.filter((r) => r.risk !== RISK_KEY[r.id])
  assert.ok(wrong.length === 0, `等级错误 ${wrong.length} 项：${wrong.map((w) => `${w.id}=${w.risk || '空'}`).join('、')}`)
})

s.check('B4 默认动作与等级一致（4 分）', () => {
  for (const r of data.rules) {
    assert.ok(['allow', 'ask', 'deny'].includes(r.action), `${r.id} 的 action 非法：${r.action}`)
    if (r.risk === 'low') assert.ok(r.action !== 'deny', `${r.id} 低风险不应 deny`)
    if (r.risk === 'critical') assert.ok(r.action !== 'allow', `${r.id} critical 不得 allow`)
    if (IRREVERSIBLE.has(r.id)) assert.ok(r.action !== 'allow', `${r.id} 不可恢复的操作不得 allow`)
  }
})

s.check('B5 后果描述的检查：不含命令、说明可恢复性（3 分）', () => {
  for (const r of data.rules) {
    const c = String(r.consequence ?? '')
    assert.ok(c.length > 0, `${r.id} 缺少 consequence`)
    assert.ok(!c.includes('`'), `${r.id} 的后果描述含反引号（应说后果而不是命令）`)
    const hit = COMMAND_NAMES.find((n) => c.includes(n))
    if (hit) throw new Error(`${r.id} 的后果描述含命令名「${hit.trim()}」`)
    assert.ok(c.includes('可恢复') || c.includes('不可恢复'), `${r.id} 的后果描述必须说明可恢复性`)
  }
})

s.check('B6 策略题：粒度合法且推断有依据（2 分）', () => {
  assert.eq(data.policies.length, 3, '应有 3 项策略题')
  const allowed = ['once', 'session', 'project', 'forever']
  for (const p of data.policies) {
    assert.ok(allowed.includes(p.granularity), `${p.id} 的粒度非法：${p.granularity}`)
    assert.ok(p.reason && String(p.reason).length > 10, `${p.id} 的依据过短`)
  }
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
