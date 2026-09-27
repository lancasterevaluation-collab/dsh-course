#!/usr/bin/env node
/**
 * kit 里的判分入口。
 *
 * 你不需要改这个文件。它的作用是：自动补上 answers.json 的路径，
 * 然后调用 ../grade/check-answers.mjs（判分器本体）。
 *
 * 用法（在 kit 目录下）：
 *   node tools/check.mjs --repo D:\dsh-mini
 *   node tools/check.mjs --repo D:\dsh-mini --verbose   # 第一次跑建议加，之后不要加
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url)) // …/kit/tools
const kitRoot = dirname(here) // …/kit
const hwRoot = dirname(kitRoot) // …/homework/3.3
const grader = join(hwRoot, 'grade', 'check-answers.mjs')

if (!process.argv.includes('--repo')) {
  console.error('缺少 --repo 参数。例如：node tools/check.mjs --repo D:\\dsh-mini')
  process.exit(2)
}

const args = process.argv.slice(2)
if (!args.includes('--answers')) args.push('--answers', join(kitRoot, 'answers.json'))

const r = spawnSync(process.execPath, [grader, ...args], { stdio: 'inherit' })
process.exit(r.status ?? 1)
