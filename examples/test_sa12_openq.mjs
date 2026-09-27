// 6.1 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  validate, answerable, informationGain, binaryEntropy, coverage, classify, rank, decompose,
} from './sa12_openq.mjs'

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

const q = {
  id: 'q1', dependent: '任务成功率', independent: '压缩阈值',
  instrument: 'bench-v1', decide: () => 'support', cost: 100,
}

// 定义 6.1.1 / 6.1.2：三要素校验
ok(validate(q).ok, '三要素齐备时通过')
eq(validate({ ...q, dependent: null }).missing, ['因变量'], '缺因变量被指出')
eq(validate({ ...q, independent: null }).missing, ['自变量'], '缺自变量被指出')
eq(validate({ ...q, instrument: null }).missing, ['测量手段'], '缺测量手段被指出')
eq(validate({ ...q, decide: undefined }).missing, ['判别程序'], '缺判别程序被指出')
eq(validate({}).missing.length, 4, '全缺时列出四项')

// 定义 6.1.3：可回答性
ok(answerable(q, ['bench-v1'], 200), '手段可用且预算足够时可回答')
ok(!answerable(q, ['bench-v2'], 200), '手段不在集合内时不可回答')
ok(!answerable(q, ['bench-v1'], 50), '代价超过预算时不可回答')
ok(answerable(q, ['bench-v1'], 100), '代价等于预算时可回答')

// 定义 6.1.5：信息量
near(informationGain(0.5), 1, 1e-9, '先验 0.5 的信息量 = 1 比特')
near(informationGain(0.95), 0.074, 1e-3, '先验 0.95 的信息量约 0.074 比特')
near(informationGain(0.99), 0.0145, 1e-3, '先验 0.99 的信息量约 0.0145 比特')
near(informationGain(0.5) / informationGain(0.95), 13.5, 0.1, '0.5 与 0.95 的信息量之比约 13.5')
near(informationGain(0.95, 'refute'), 4.3219, 1e-3, '否证方向 @ p=0.95 约 4.32 比特')
near(informationGain(0.5, 'refute'), 1, 1e-9, 'p=0.5 时两个方向信息量相等（命题 6.1.5）')
eq(informationGain(1), 0, '先验为 1 时信息量为 0')
eq(informationGain(0), 0, '先验为 0 时信息量为 0')

// 工具箱 5.1：二元熵
near(binaryEntropy(0.5), 1, 1e-9, '二元熵在 p=0.5 取最大值 1')
near(binaryEntropy(0.95), 0.2864, 1e-3, '二元熵 @ p=0.95 约 0.286')
eq(binaryEntropy(0), 0, 'p=0 时熵为 0')
eq(binaryEntropy(1), 0, 'p=1 时熵为 0')
ok(binaryEntropy(0.5) > binaryEntropy(0.6), '熵随 p 偏离 0.5 而下降')

// 工具箱 5.3：覆盖率
const questions = [
  { ...q, id: 'a', instrument: 'bench-v1', cost: 100 },
  { ...q, id: 'b', instrument: 'bench-v2', cost: 100 },
  { ...q, id: 'c', instrument: 'bench-v1', cost: 5000 },
]
near(coverage(questions, ['bench-v1']), 2 / 3, 1e-9, '只有一种手段时覆盖率 2/3')
near(coverage(questions, ['bench-v1', 'bench-v2']), 1, 1e-9, '两种手段齐备时覆盖率 1')
eq(coverage([], ['bench-v1']), 1, '空清单的覆盖率定义为 1')

// 定义 6.1.6：清单分类
eq(classify(questions[1], ['bench-v1'], 1000, 0.5), 'blocked-by-instrument', '手段缺失时归为 blocked-by-instrument')
eq(classify(questions[0], ['bench-v1'], 1000, 0.99), 'settled', '先验过高时归为 settled')
eq(classify(questions[0], ['bench-v1'], 1000, 0.5), 'active', '可回答且未被确定时归为 active')
eq(classify(questions[2], ['bench-v1'], 1000, 0.5), 'blocked-by-instrument', '代价超预算也归为 blocked')

// 7.3：排序
const priors = { a: 0.95, b: 0.5, c: 0.5 }
const ordered = rank(questions, ['bench-v1', 'bench-v2'], 1000, (x) => priors[x.id]).map((x) => x.id)
eq(ordered[0], 'b', '熵最大的排最前（b 的先验 0.5）')
eq(ordered[ordered.length - 1], 'c', '不可回答的排最后（c 代价超预算）')
ok(ordered.indexOf('a') > ordered.indexOf('b'), '先验高的排在先验低的之后')

// 定义 6.1.4：分解
ok(decompose(q, [q, q]).ok, '子问题合法时分解通过')
ok(!decompose(q, []).ok, '子问题为空时分解不通过')
eq(decompose(q, [{ ...q, dependent: null }]).invalid.length, 1, '非法子问题被列出')
eq(decompose(q, [q, q]).count, 2, '分解记录子问题个数')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
