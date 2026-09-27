// 3.4 算例的数字回归：讲义「八、判据与数字回归」的每个数字都在这里被断言。
import {
  TRANSITIONS, TERMINAL, killSequence, graceExpired, nextState,
  mergeStreams, checkTimeoutNesting, bufferFillTime, reachableStates, canReachTerminal,
} from './sa09_process.mjs'

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

// 定义 3.4.2：终止序列
const seq = killSequence(1234, 1000)
eq(seq.length, 3, '终止序列是三步（宽限期不能省）')
eq(seq[0].signal, 'SIGTERM', '第一步是请求退出')
eq(seq[0].target, -1234, '按进程组寻址（负号）')
eq(seq[1].delay, 1000, '第二步是宽限期')
eq(seq[2].signal, 'SIGKILL', '第三步是强制杀死')
eq(seq[2].target, -1234, '强制杀死同样按组')

// 宽限期判断
eq(graceExpired([], 1000, 99999, 0), { kill: false, cleaned: true }, '无存活进程时不需要强杀')
eq(graceExpired([11], 1000, 500, 0).waiting, true, '未到宽限期时继续等待')
eq(graceExpired([11], 1000, 1500, 0), { kill: true, cleaned: false }, '到点仍存活则强杀且清理未完成')

// 定义 3.4.3：状态机
eq(nextState('pending', 'start'), 'running', 'pending → running')
eq(nextState('running', 'restart'), 'unknown', '重启后 running 迁到 unknown（不是猜成功或失败）')
eq(nextState('running', 'done'), 'succeeded', 'running → succeeded')
eq(nextState('unknown', 'done'), 'succeeded', 'unknown 可由外部证据消解')
for (const t of TERMINAL) {
  ok(Object.keys(TRANSITIONS[t]).length === 0, `终止状态 ${t} 没有出边`)
}
let threw = false
try { nextState('succeeded', 'start') } catch { threw = true }
ok(threw, '离开终止状态被拦截')

// 工具箱 5.1：可达性
ok(canReachTerminal('pending'), '从 pending 可达终止状态')
ok(canReachTerminal('running'), '从 running 可达终止状态')
ok(canReachTerminal('unknown'), '从 unknown 可达终止状态')
eq(reachableStates('pending').sort(), ['cancelled', 'failed', 'pending', 'running', 'succeeded', 'unknown'], 'pending 的可达集合')

// 定义 3.4.4：输出归并
const a = [{ t: 1, line: 'a1' }, { t: 3, line: 'a2' }]
const b = [{ t: 2, line: 'b1' }, { t: 4, line: 'b2' }]
eq(mergeStreams(a, b).map((x) => x.line), ['a1', 'b1', 'a2', 'b2'], '按时间戳归并两条流')
eq(mergeStreams([], b).map((x) => x.line), ['b1', 'b2'], '一条流为空时直接返回另一条')
eq(mergeStreams(a, a).length, 4, '相同时间戳时两侧都保留')

// 命题 3.4.5：超时嵌套
eq(checkTimeoutNesting([30000, 10000, 5000]).ok, true, '单调不增的层级通过')
eq(checkTimeoutNesting([5000, 10000]).ok, false, '内层大于外层被拒绝')
eq(checkTimeoutNesting([1000]).ok, true, '单层通过')
eq(checkTimeoutNesting([]).ok, true, '空层级通过')

// 定义 3.4.5：背压
near(bufferFillTime(65536, 1000000, 0), 0.065536, 1e-6, '64 KB 缓冲在 1 MB/s 下 0.0655 秒填满')
eq(bufferFillTime(65536, 1000, 1000), Number.POSITIVE_INFINITY, '消费不低于产出时不会填满')
eq(bufferFillTime(1024, 100, 0), 10.24, '容量除以净速率')

console.log(`\n结果：${pass} 通过，${fail} 不通过`)
if (fail > 0) process.exit(1)
