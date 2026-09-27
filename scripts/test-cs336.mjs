/**
 * 运行第 7 卷（大模型基模）的 PyTorch 算例。
 *
 * 这些算例需要项目级虚拟环境（见 07-大模型基模/index.md）。
 * 环境不存在时跳过而不是失败：缺少本地环境不应该让文档门禁变红。
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const PYTHON_CANDIDATES = [
  join('.venv', 'Scripts', 'python.exe'),
  join('.venv', 'bin', 'python'),
]

const CASES = [
  'a0_bpe.py',
  'a1_attention.py',
  'a2_alignment.py',
  'a3_sampling.py',
  'a4_inference_cost.py',
  'a5_evaluation.py',
]

const python = PYTHON_CANDIDATES.find((candidate) => existsSync(candidate))
if (!python) {
  console.log('跳过第 7 卷算例：未找到 .venv（环境搭建见 07-大模型基模/index.md）')
  process.exit(0)
}

let failed = 0
for (const name of CASES) {
  const result = spawnSync(python, [join('examples', 'cs336', name)], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  if (result.status !== 0) {
    failed += 1
    console.error(`算例失败：${name}`)
  }
}

console.log(failed === 0 ? `第 7 卷算例全部通过（${CASES.length} 个）` : `第 7 卷算例失败 ${failed} 个`)
process.exit(failed === 0 ? 0 : 1)
