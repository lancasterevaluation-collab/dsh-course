// 构建前清空产物目录。
//
// 为什么必须有这一步：产物目录存在时，VitePress 的构建会崩溃（Windows 上退出码 0xC0000409，
// 日志停在 "building client + server bundles..."）。srcExclude 排除 `.vitepress/**` 并不足够，
// 因为排除的是"页面发现"，而 outDir 仍会被扫描。实测：删掉 dist 后构建成功，保留 dist 则必崩。
import { rmSync, existsSync } from 'node:fs'

const dist = new URL('../.vitepress/dist', import.meta.url)
if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true })
  console.log('已清空产物目录 .vitepress/dist')
} else {
  console.log('产物目录不存在，无需清理')
}
