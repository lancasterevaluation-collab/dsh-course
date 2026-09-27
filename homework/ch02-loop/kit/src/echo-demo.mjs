/**
 * 第二层验证：写一个新工具，只靠 register 让它出现在模型可见的清单里。
 *
 * 这一层检查的不是"某个函数对不对"，而是【扩展点是否成立】（讲义 4.1、4.3）。
 * 判据：注册这个工具不需要改 tools.mjs 的任何一行。
 *
 * 用法：node kit/src/echo-demo.mjs
 * ★ 它依赖 kit/src/llm.mjs 已经实现（注册表用模型层的 parseArguments 解析参数）。
 *   如果 tools.mjs 还是骨架，这里会打印一行"起点"提示而不是一屏堆栈。
 */

import { ToolRegistry } from './tools.mjs'

async function main() {
  const registry = new ToolRegistry()

  // ★ 唯一的动作：注册。
  const unregister = registry.register({
    name: 'echo',
    description: '把 text 原样返回。用来确认工具系统的工作方式，不产生任何副作用。',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: '要回显的文本' } },
      required: ['text'],
    },
    sideEffect: 'readonly',
    run: ({ text }) => ({ ok: true, content: text }),
  })

  const ctx = { workspace: process.cwd(), maxResultChars: 2000 }

  console.log('')
  console.log('① 模型可见的工具清单（它要进请求，也要进日志）')
  console.log('  ', JSON.stringify(registry.list()))
  console.log('')

  console.log('② 正常调用')
  console.log('  ', JSON.stringify(await registry.run('echo', '{"text":"你好"}', ctx)))
  console.log('')

  console.log('③ 参数缺必填——注意错误信息里带字段名')
  console.log('  ', JSON.stringify(await registry.run('echo', '{}', ctx)))
  console.log('')

  console.log('④ 参数不是合法 JSON')
  console.log('  ', JSON.stringify(await registry.run('echo', '{"text":', ctx)))
  console.log('')

  console.log('⑤ 工具名不存在——它要让模型能换一条路')
  console.log('  ', JSON.stringify(await registry.run('nope', '{}', ctx)))
  console.log('')

  console.log('⑥ 卸载之后')
  unregister()
  console.log('  ', JSON.stringify(registry.list()))
  console.log('')
  console.log('对照判据：① 与 ⑥ 是判据 1、2，③④⑤ 都要返回 ok:false 而不是抛异常。')
  console.log('')
}

try {
  await main()
} catch (err) {
  console.log('')
  console.log(`★ 起点：tools.mjs 还没有实现完——${err?.message ?? err}`)
  console.log('')
  console.log('  先读 kit/CONTRACT-tools.md（尤其是承诺 4、5、6），再回来跑这个脚本。')
  console.log('  契约测试：node tests/t4-build.mjs')
  console.log('')
  process.exit(1)
}
