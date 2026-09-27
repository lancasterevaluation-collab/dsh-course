// 3.5 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  CRASH_PHASES, truncateTail, atomicWriteSteps, rotateCheckpoint, replayFrom,
  cleanupSurvivors, isIdempotent, recoveryCost, checkpointInterval, recoveredEqualsCommit,
} from './sa10_persist.mjs'

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

// 定义 3.5.3 / 命题 3.5.1：尾部截断
const parse = (s) => {
  if (!s.endsWith('}')) throw new Error('不完整')
  return JSON.parse(s)
}
const raw = ['{"v":1}', '{"v":2}', '{"v":3', '{"v":4}']
const t = truncateTail(raw, parse)
eq(t.events.length, 2, '遇到不完整记录即停止（不跳过后续）')
eq(t.truncated, true, '返回截断标志')
eq(t.events.map((e) => e.v), [1, 2], '保留的最长可解析前缀')
eq(truncateTail(['{"v":1}'], parse).truncated, false, '全部可解析时不标记截断')
eq(truncateTail([], parse).events, [], '空日志返回空事件')
// 尾部不完整时会丢弃其后的完整行——因为它们本来就不该存在（追加写）
eq(truncateTail(raw, parse).events.length, 2, '不完整记录之后的完整行同样丢弃')

// 定义 3.5.5：原子写三步
const steps = atomicWriteSteps('/var/lib/state.json')
eq(steps.length, 3, '原子写是三步')
eq(steps[0].path, '/var/lib/state.json.tmp', '第一步写临时文件')
eq(steps[1].action, 'fsync', '第二步落盘（不可省）')
eq(steps[2].action, 'rename', '第三步重命名')
eq(steps[2].to, '/var/lib/state.json', '重命名到目标位置')

// 定义 3.5.4：检查点轮留与重放
const rot = rotateCheckpoint({ offset: 1 }, { offset: 2 })
eq(rot.current.offset, 2, 'current 指向新检查点')
eq(rot.previous.offset, 1, 'previous 保留上一份')
const events = [{ dv: 1 }, { dv: 2 }, { dv: 3 }]
const inc = (s, e) => ({ v: s.v + e.dv })
eq(replayFrom(events, { state: { v: 10 }, offset: 1 }, { v: 0 }, inc), { v: 15 }, '从 offset=1 重放只应用其后的事件')
eq(replayFrom(events, null, { v: 0 }, inc), { v: 6 }, '无检查点时从零重放')

// 命题 3.5.5：进程层清理
eq(cleanupSurvivors(['a', 'b']), { cleaned: 2, conflicts: 0 }, '残留进程被清理')
eq(cleanupSurvivors([]), { cleaned: 0, conflicts: 0 }, '无残留时无事发生')

// 命题 3.5.3：幂等
const assign = (s, e) => ({ ...s, v: e.v })
const add = (s, e) => ({ ...s, v: s.v + e.v })
ok(isIdempotent(assign, [{ v: 1 }, { v: 2 }], { v: 0 }).ok, '赋值型操作幂等')
ok(!isIdempotent(add, [{ v: 1 }], { v: 0 }).ok, '累加型操作不幂等（会在重放时重复）')
eq(isIdempotent(add, [{ v: 1 }, { v: 2 }], { v: 0 }).failures.length, 2, '不幂等事件全部被列出')

// 命题 3.5.4：代价
near(recoveryCost(300000, 0, 0.1, 1).startupMs, 30000, 1e-9, '无检查点时启动重放 30000 毫秒')
near(recoveryCost(300000, 10000, 0.1, 1).startupMs, 1000, 1e-9, '间隔 1 万时启动重放 1000 毫秒')
near(recoveryCost(300000, 10000, 0.1, 1).checkpointMb, 30, 1e-9, '间隔 1 万时检查点总量 30 MB')
near(recoveryCost(300000, 1000, 0.1, 1).checkpointMb, 300, 1e-9, '间隔 1000 时检查点总量 300 MB')
eq(recoveryCost(300000, 10000, 0.1, 1).checkpointCount, 30, '间隔 1 万时有 30 份检查点')
eq(recoveryCost(300000, 1000, 0.1, 1).checkpointCount, 300, '间隔 1000 时有 300 份')
ok(recoveryCost(300000, 1000, 0.1, 1).startupMs < recoveryCost(300000, 10000, 0.1, 1).startupMs, '间隔越小启动越快')
ok(recoveryCost(300000, 1000, 0.1, 1).checkpointMb > recoveryCost(300000, 10000, 0.1, 1).checkpointMb, '间隔越小写入越多')

// 工具箱 5.5：间隔反算
eq(checkpointInterval(1000, 0.1), 10000, '1 秒上限、0.1 毫秒每次 → 间隔 10000')
eq(checkpointInterval(100, 0.2), 500, '100 毫秒上限、0.2 毫秒每次 → 间隔 500')

// 命题 3.5.6：恢复等价性
ok(recoveredEqualsCommit([{ dv: 1 }], [{ dv: 1 }], { v: 0 }, inc), '一致时判定相等')
ok(!recoveredEqualsCommit([{ dv: 1 }], [{ dv: 1 }, { dv: 1 }], { v: 0 }, inc), '多应用一次时判定不等')
ok(recoveredEqualsCommit([], [], { v: 0 }, inc), '空事件两边都等于初始状态')

// 定义 3.5.2：崩溃相位
eq(CRASH_PHASES.length, 3, '崩溃点分三个相位')
eq(CRASH_PHASES, ['before-append', 'during-append', 'after-append'], '相位顺序')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
