#!/usr/bin/env node
/**
 * kit 里的判分入口。
 *
 * 你不需要改这个文件。它会自动补上 answers.json 的路径，
 * 然后调用 ../grade/check-answers.mjs（判分器本体）。
 *
 * 用法（在 kit 目录下）：
 *   node tools/check.mjs            # 判分
 *   node tools/check.mjs --verbose  # 判分并列出每道错题的标准答案
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url)) // …/kit/tools
const kitRoot = dirname(here) // …/kit
const hwRoot = dirname(kitRoot) // …/homework/1.4
const grader = join(hwRoot, 'grade', 'check-answers.mjs')

const args = process.argv.slice(2)
if (!args.includes('--answers')) args.push('--answers', join(kitRoot, 'answers.json'))

const r = spawnSync(process.execPath, [grader, ...args], { stdio: 'inherit' })
process.exit(r.status ?? 1)
