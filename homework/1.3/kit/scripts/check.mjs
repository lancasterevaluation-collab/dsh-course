#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  任务 3 · 架构规则检查脚本（骨架已经搭好，你只需要填规则）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  这个文件是"基础设施 + 一条示例规则"，你的任务是在它基础上再加一条。
 *
 *  ── 为什么用 Node 而不是 PowerShell ──────────────────────────────────
 *
 *  这是一个真实的工程判断，值得你知道原因：
 *
 *    1) Windows 默认禁止运行 .ps1 脚本（执行策略），你每次都得加
 *       -ExecutionPolicy Bypass，而这个参数在别人机器上不一定被允许。
 *    2) Windows PowerShell 5.1 会把"UTF-8 无 BOM"的文件按系统 ANSI 编码
 *       读取，于是这个文件里的中文注释会变成乱码并导致语法错误。
 *       我实测过：一个完全正确的 .ps1 因为这一条而无法运行。
 *    3) dsh-mini 本身就是 Node 项目，Node 一定可用，且默认按 UTF-8 读文件。
 *
 *  这正是 3.2 讲的"偶然复杂度"：工具选择的成本不体现在功能上，而体现在
 *  运行环境的约束上。选 PowerShell 没有让脚本更难写，但让它更难被跑起来。
 *
 *  ── 为什么这个任务值得做 ───────────────────────────────────────────
 *
 *  写进文档的规则会随时间失效（因为没人读文档）；写进命令的规则会随时间
 *  报警（因为它每次提交都会跑）。你在团队里能提供的最有价值的贡献之一，
 *  就是这种"不需要写业务代码，却能持续阻止一类问题"的东西。
 *
 *  但它有一个前提：检查必须真的能报警。**一个永远绿的检查比没有检查更糟**，
 *  因为它制造虚假的安全感。所以本任务有一条硬要求——你必须在 dsh-mini 的
 *  副本里人为制造违规，确认脚本抓到了它。
 *
 *  ── 怎么想"该检查什么" ─────────────────────────────────────────────
 *
 *  问三个问题：
 *    ① 有哪条规则是"大家口头都知道、但没人验证"的？
 *       （架构分层、命名约定、配置与代码的一致性……）
 *    ② 这条规则被破坏时，症状会在多久之后出现？
 *       （立刻报错的价值低——它自己会暴露；**延后暴露的才值得检查**）
 *    ③ 检查它需要什么信息？能用文本搜索拿到吗？
 *       （拿不到的，比如运行时行为，不适合做静态检查）
 *
 *  按这三个问题筛一遍，你会发现"依赖方向"这类规则最适合——它延后暴露
 *  （编译能通过），且纯文本可查。
 *
 *  ── 验证流程（判分器会检查你是否真的做了）──────────────────────────
 *
 *    # 1) 正常状态：应输出 PASS，退出码 0
 *    node check.mjs --repo D:\dsh-mini
 *
 *    # 2) 制造违规（用副本，别动本体）
 *    Copy-Item -Recurse D:\dsh-mini D:\dsh-mini-violate-test
 *    # 在副本里给某个 kernel 文件加一行【值导入】：
 *    #   import { Context } from '../framework/context.ts'
 *    node check.mjs --repo D:\dsh-mini-violate-test     # 应列出违规并返回非零
 *    #
 *    # 试完值导入，再试一行【类型导入】，看看会不会触发：
 *    #   import type { Context } from '../framework/context.ts'
 *    # 如果没触发，说明你的检查做了正确的区分——这正是任务 1 里
 *    # "值依赖 vs 类型依赖"的同一个区分，在这里又出现了一次。
 *
 *    # 3) 清理
 *    Remove-Item -Recurse -Force D:\dsh-mini-violate-test
 *
 *    # 4) 把第 2 步的实际输出粘进 kit/answers.json 的 task3.selfTestOutput
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

// ────────────────────────────────────────────────── 参数与基础设施（别改）

const args = process.argv.slice(2)
const i = args.indexOf('--repo')
if (i < 0 || !args[i + 1]) {
  console.error('用法：node check.mjs --repo <dsh-mini 的路径>')
  process.exit(2)
}
const REPO = args[i + 1]

const problems = []
/** 记录一处违规。rule 是规则名，file 要写成相对 src/ 的路径。 */
function addProblem(rule, file, detail) {
  problems.push({ rule, file, detail })
}

/** 递归收集某个目录下的 .ts 文件（跳过 node_modules 与 lib）。 */
async function collectTs(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'lib') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await collectTs(p)))
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** 把绝对路径变成 `src/xxx/yyy.ts` 形式，便于阅读与比对。 */
function toRel(abs) {
  const s = abs.replace(/\\/g, '/')
  const k = s.indexOf('/src/')
  return k >= 0 ? 'src' + s.slice(k + 4) : s
}

/**
 * 取出一段源码里的【值】导入说明符（排除 import type）。
 * 这个区分很重要：类型导入编译后会被擦除，不构成运行时依赖。
 */
function valueImports(source) {
  const out = []
  for (const m of source.matchAll(/\bimport\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
    if (!m[1]) out.push(m[2])
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════
//  示例规则 A：依赖方向（已实现，作为你的模板）
//
//  规则：kernel/ 下的文件不得 import framework/ 或 plugins/ 下的任何文件。
//  价值：破坏了它，编译仍然通过、测试可能仍然通过，但分层被打破——
//        与"延后暴露才值得检查"这个筛选标准完全吻合。
// ══════════════════════════════════════════════════════════════════════════

async function testLayerDirection() {
  const files = await collectTs(join(REPO, 'src', 'kernel'))
  for (const abs of files) {
    const src = await readFile(abs, 'utf8')
    for (const spec of valueImports(src)) {
      if (/\.\.\/(framework|plugins|apps|evolution)\//.test(spec)) {
        addProblem('A-依赖方向', toRel(abs), `值导入了 ${spec}`)
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  ★TODO 1★ 选一条新规则
//
//  候选（也可以自己找）：
//    · framework/ 不得 import plugins/ 或 apps/
//    · modes/*.json 里的每个工具名都必须存在于工具池中
//      （工具池在 src/plugins/tools.ts 的 TOOL_POOL_NAMES）
//    · modes/*.json 的 prompt 字段指向的文件必须存在
//      （prompt: "ptc.md" 对应 prompts/ptc.md）
//    · src/ 下每个 .ts 文件都不得有模块级可变状态
//      （这一条误报会很多，想清楚再选）
//
//  选好之后，回答（写进 kit/writeup.md）：
//    · 它被破坏时会怎样？症状多久出现？
//    · 什么情况下你的检查会误报？什么情况下会漏报？
// ══════════════════════════════════════════════════════════════════════════

async function testMyRule() {
  // ★TODO 2★ 在这里实现你的规则。
  //
  // 模式参考上面的 testLayerDirection：
  //   1) 找到要检查的文件（collectTs，或用 readFile 读配置）
  //   2) 逐个检查（正则匹配、JSON.parse、字符串包含都可以）
  //   3) 发现问题时调用 addProblem('<规则名>', '<相对路径>', '<细节>')
  //
  // 两个注意点：
  //   · file 参数写成相对 src/ 的形式（读的人才知道是哪个文件）
  //   · 不要修改任何文件——检查脚本必须是只读的

  // 你的代码从这里开始：


  // 你的代码到这里结束
}

// ══════════════════════════════════════════════════════════════════════════
//  报告与退出码（已写好，不要改——判分器依赖这个输出格式）
// ══════════════════════════════════════════════════════════════════════════

await testLayerDirection()
// ★TODO 3★ 取消下面这行的注释，让你的规则真正运行起来
// await testMyRule()

if (problems.length === 0) {
  const n = (await collectTs(join(REPO, 'src', 'kernel'))).length
  console.log(`PASS  依赖方向与其他规则均无违规（检查了 ${n} 个 kernel 文件）`)
  process.exit(0)
}

console.log(`FAIL  发现 ${problems.length} 处违规：`)
for (const p of problems.sort((a, b) => (a.rule + a.file).localeCompare(b.rule + b.file))) {
  console.log(`  [${p.rule}] ${p.file}`)
  console.log(`        ${p.detail}`)
}
process.exit(1)
