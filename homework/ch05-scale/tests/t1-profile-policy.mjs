// Part A 的判据（分析题）。对应讲义 5.1、5.3 与 kit/problems/a-profile.questions.md。
import { readFileSync } from 'node:fs'
import { createSuite, assert, report } from './harness.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--answers')
const path = i >= 0 ? args[i + 1] : 'kit/answers/a-profile.json'
const s = createSuite('Part A · 模式与审批的分析', { weight: 15 })

/** 隐式默认的答案表。 */
const DEFAULT_KEY = {
  d1: ['reproducible', 'keep'], d2: ['environment-dependent', 'move-to-generation'],
  d3: ['reproducible', 'keep'], d4: ['environment-dependent', 'move-to-generation'],
  d5: ['environment-dependent', 'make-explicit'], d6: ['environment-dependent', 'move-to-generation'],
  d7: ['reproducible', 'keep'], d8: ['environment-dependent', 'make-explicit'],
  d9: ['reproducible', 'keep'], d10: ['environment-dependent', 'move-to-generation'],
}

/** 合并结果的答案表（values 与 origin）。 */
const MERGE_KEY = {
  g1: [{ concurrency: 8 }, { concurrency: '用户级' }],
  g2: [{ timeoutMs: 60000 }, { timeoutMs: '项目级' }],
  g3: [{ tools: ['c'] }, { tools: '用户级' }],
  g4: [{ retry: { n: 5, backoff: 1000 } }, { 'retry.n': '用户级', 'retry.backoff': '内建' }],
  g5: [{ a: 9, b: 3 }, { a: '运行参数', b: '项目级' }],
  g6: [{ tags: [] }, { tags: '运行参数' }],
}

const RISK_KEY = { c1: 'high', c2: 'high', c3: 'low', c4: 'critical' }
const LAYERS = ['内建', '用户级', '项目级', '运行参数']
const COMMANDS = ['rm ', 'mv ', 'cp ', 'chmod', 'curl', 'git push']

let data = null
let loadError = null
try { data = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { loadError = e.message }

s.check('A1 答案文件可读且结构齐全', () => {
  assert.ok(!loadError, `无法读取 ${path}：${loadError}`)
  for (const k of ['defaults', 'merges', 'consequences']) assert.ok(Array.isArray(data[k]), `缺少数组字段：${k}`)
})

s.check('A2 defaults 有 10 项且 id 齐全', () => {
  assert.eq(data.defaults.length, 10)
  assert.eq(data.defaults.map((d) => d.id).sort().join(','), Object.keys(DEFAULT_KEY).sort().join(','))
})

s.check('A3 10 条 verdict 与 action 正确（含一致性规则）', () => {
  for (const d of data.defaults) {
    const [verdict, action] = DEFAULT_KEY[d.id]
    assert.eq(d.verdict, verdict, `${d.id} 的 verdict`)
    assert.eq(d.action, action, `${d.id} 的 action`)
    assert.ok(String(d.reason ?? '').length > 0, `${d.id} 缺少依据`)
    if (d.verdict === 'environment-dependent') {
      assert.ok(['move-to-generation', 'make-explicit'].includes(d.action), `${d.id} 是环境相关，action 不得是 keep`)
    } else {
      assert.eq(d.action, 'keep', `${d.id} 可复现，action 必须是 keep`)
    }
  }
})

s.check('A4 合并结果（values）正确', () => {
  for (const m of data.merges) {
    const [values] = MERGE_KEY[m.id]
    assert.deepEq(m.values, values, `${m.id} 的有效值`)
  }
})

s.check('A5 合并的来源（origin）正确且取值合法', () => {
  for (const m of data.merges) {
    const [, origin] = MERGE_KEY[m.id]
    assert.deepEq(m.origin, origin, `${m.id} 的来源`)
    for (const v of Object.values(m.origin)) {
      assert.ok(LAYERS.includes(v), `${m.id} 的来源层非法：${v}`)
    }
  }
})

s.check('A6 后果描述通过三条检查且风险档位正确', () => {
  assert.eq(data.consequences.length, 4)
  for (const c of data.consequences) {
    const text = String(c.text ?? '')
    assert.ok(text.length > 0, `${c.id} 缺少 text`)
    assert.ok(!text.includes('`'), `${c.id} 不得含反引号`)
    for (const cmd of COMMANDS) assert.ok(!text.includes(cmd), `${c.id} 不得含命令名「${cmd.trim()}」`)
    assert.ok(text.includes('可恢复') || text.includes('不可恢复'), `${c.id} 必须说明可恢复性`)
    assert.eq(c.risk, RISK_KEY[c.id], `${c.id} 的风险档位`)
  }
})

const result = await s.run()
report([result])
process.exit(result.passed === result.total ? 0 : 1)
