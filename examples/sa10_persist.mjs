// 3.5 配备算例：尾部截断、原子写、重放、幂等、检查点代价。
//
// 每个函数对应讲义 3.5 的一条命题或工具箱条目，数值与第八节一致。
// 只用标准库，可单独运行：node examples/sa10_persist.mjs
import { pathToFileURL } from 'node:url'

/** 崩溃的三个相位。只有"追加后"产生完整记录（定义 3.5.2）。 */
export const CRASH_PHASES = ['before-append', 'during-append', 'after-append']

/**
 * 定义 3.5.3 / 命题 3.5.1：尾部截断。按行解析，遇错即停，不跳过。
 * @param lines 日志行 @param parse 单行解析函数（失败时抛错或返回 null）
 * @returns `{ events, truncated }`；truncated 为 true 表示丢弃了尾部
 */
export function truncateTail(lines, parse) {
  const events = []
  for (const line of lines) {
    let parsed
    try { parsed = parse(line) } catch { break }
    if (parsed === null || parsed === undefined) break
    events.push(parsed)
  }
  return { events, truncated: events.length < lines.length }
}

/**
 * 定义 3.5.5 / 命题 3.5.2：原子写的三步。缺第二步会出现"重命名生效但内容为空"。
 * @param target 目标路径 @returns 三步数组
 */
export function atomicWriteSteps(target) {
  return [
    { step: 1, action: 'write', path: `${target}.tmp`, note: '崩溃只影响临时文件' },
    { step: 2, action: 'fsync', path: `${target}.tmp`, note: '缺少这一步则重命名可能先于数据落盘' },
    { step: 3, action: 'rename', from: `${target}.tmp`, to: target, note: '同一文件系统内的重命名是原子的' },
  ]
}

/**
 * 定义 3.5.4：保留上一份检查点，损坏时可回退。
 * @param prev 上一份（可为 null） @param next 新检查点 @returns `{ current, previous }`
 */
export function rotateCheckpoint(prev, next) {
  return { current: next, previous: prev }
}

/**
 * 定义 3.5.4：从检查点位置重放。
 * @param events 事件数组 @param checkpoint 检查点或 null @param init 初始状态
 * @param apply 单事件转移 @returns 重放后的状态
 */
export function replayFrom(events, checkpoint, init, apply) {
  let state = checkpoint ? checkpoint.state : init
  const from = checkpoint ? checkpoint.offset : 0
  for (let i = from; i < events.length; i++) state = apply(state, events[i])
  return state
}

/**
 * 命题 3.5.5：恢复前清理崩溃时残留的进程。
 * @param survivors 残留进程标识数组 @returns `{ cleaned, conflicts }`
 */
export function cleanupSurvivors(survivors) {
  return { cleaned: survivors.length, conflicts: 0 }
}

/**
 * 命题 3.5.3 / 工具箱 5.3：幂等检验。每个事件应用两次并比较。
 * @param apply 单事件转移 @param events 事件数组 @param init 初始状态
 * @returns `{ ok, failures }`
 */
export function isIdempotent(apply, events, init) {
  const failures = []
  for (const e of events) {
    const once = apply(init, e)
    const twice = apply(once, e)
    if (JSON.stringify(once) !== JSON.stringify(twice)) failures.push(e)
  }
  return { ok: failures.length === 0, failures }
}

/**
 * 命题 3.5.4：检查点间隔与两笔代价。间隔为 0 表示不打检查点。
 * @param total 日志总事件数 @param checkpoint 检查点间隔 @param costPerEventMs 单事件重放耗时（毫秒）
 * @param snapshotSizeMb 单份检查点规模（MB）
 * @returns `{ startupMs, checkpointCount, checkpointMb }`
 */
export function recoveryCost(total, checkpoint, costPerEventMs, snapshotSizeMb) {
  const replayCount = checkpoint > 0 ? Math.min(checkpoint, total) : total
  const checkpointCount = checkpoint > 0 ? Math.ceil(total / checkpoint) : 0
  return {
    startupMs: replayCount * costPerEventMs,
    checkpointCount,
    checkpointMb: checkpointCount * snapshotSizeMb,
  }
}

/**
 * 工具箱 5.5：由启动时间上限反算检查点间隔。
 * @param maxStartupMs 可接受的启动重放耗时 @param costPerEventMs 单事件重放耗时
 * @returns 间隔上界（事件数）
 */
export function checkpointInterval(maxStartupMs, costPerEventMs) {
  return Math.floor(maxStartupMs / costPerEventMs)
}

/**
 * 命题 3.5.6：恢复等价性检验——恢复结果应当等于"崩溃前已提交事件"的重放结果。
 * @param committed 崩溃前已提交的事件 @param recovered 恢复后得到的事件序列
 * @param init 初始状态 @param apply 单事件转移
 * @returns 两者是否一致
 */
export function recoveredEqualsCommit(committed, recovered, init, apply) {
  const a = committed.reduce(apply, init)
  const b = recovered.reduce(apply, init)
  return JSON.stringify(a) === JSON.stringify(b)
}

/** 打印本篇全部算例。@returns 无（仅输出） */
export function main() {
  const rows = []
  const line = (name, v) => rows.push(`${name.padEnd(40)} ${v}`)

  // 尾部截断
  const raw = ['{"v":1}', '{"v":2}', '{"v":3', '{"v":4}']
  const parse = (s) => {
    if (!s.endsWith('}')) throw new Error('不完整')
    return JSON.parse(s)
  }
  const t = truncateTail(raw, parse)
  line('尾部截断：保留事件数', t.events.length)
  line('尾部截断：truncated', t.truncated)

  line('原子写步数', atomicWriteSteps('/var/lib/s.json').length)
  const rot = rotateCheckpoint({ state: { v: 1 }, offset: 1 }, { state: { v: 2 }, offset: 2 })
  line('检查点轮留', `current.offset=${rot.current.offset}, previous.offset=${rot.previous.offset}`)

  const events = [{ dv: 1 }, { dv: 2 }, { dv: 3 }]
  line('从检查点重放 offset=1', JSON.stringify(replayFrom(events, { state: { v: 10 }, offset: 1 }, { v: 0 }, (s, e) => ({ v: s.v + e.dv }))))
  line('从零重放', JSON.stringify(replayFrom(events, null, { v: 0 }, (s, e) => ({ v: s.v + e.dv }))))
  line('清理残留进程', JSON.stringify(cleanupSurvivors(['pid-1', 'pid-2'])))

  // 幂等
  const assign = (s, e) => ({ ...s, v: e.v })
  const add = (s, e) => ({ ...s, v: s.v + e.v })
  line('幂等检验（赋值型）', isIdempotent(assign, [{ v: 1 }, { v: 2 }], { v: 0 }).ok)
  line('幂等检验（累加型）', isIdempotent(add, [{ v: 1 }, { v: 2 }], { v: 0 }).ok)

  // 代价
  const noCp = recoveryCost(300000, 0, 0.1, 1)
  const cp10k = recoveryCost(300000, 10000, 0.1, 1)
  const cp1k = recoveryCost(300000, 1000, 0.1, 1)
  line('无检查点：启动重放', noCp.startupMs + ' 毫秒')
  line('间隔 1 万：启动重放', cp10k.startupMs + ' 毫秒')
  line('间隔 1 万：检查点总量', cp10k.checkpointMb + ' MB（' + cp10k.checkpointCount + ' 份）')
  line('间隔 1000：检查点总量', cp1k.checkpointMb + ' MB（' + cp1k.checkpointCount + ' 份）')
  line('间隔上界（1 秒上限）', checkpointInterval(1000, 0.1))

  line('崩溃相位个数', CRASH_PHASES.length)
  line('恢复等价性（一致）', recoveredEqualsCommit([{ dv: 1 }], [{ dv: 1 }], { v: 0 }, (s, e) => ({ v: s.v + e.dv })))
  line('恢复等价性（多应用一次）', recoveredEqualsCommit([{ dv: 1 }], [{ dv: 1 }, { dv: 1 }], { v: 0 }, (s, e) => ({ v: s.v + e.dv })))

  console.log(rows.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
