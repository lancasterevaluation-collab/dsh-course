// VitePress 配置：本课程的站点入口。
//
// 三条配置决定有理由（见 00-导论/0.5-语言风格与站点规范.md 第六节）：
//   ① 内容根等于项目根 —— 讲义保持在自己卷的目录里，首页在根 index.md；
//   ② search 用 local —— 站点在没有外部服务时也能检索；
//   ③ outline 限制到二三级 —— 长篇讲义的四级标题会让目录失去导航作用。
//
// 数学渲染在构建期用 KaTeX 完成（样式表见 .vitepress/theme/index.ts）。
// 之前用 MathJax CDN 做客户端渲染，症状是"公式没渲染成公式"——原因是客户端脚本在 SPA 路由下不可靠，
// 且依赖网络。构建期渲染的产物可直接检查，也不受路由影响。
import { defineConfig } from 'vitepress'
import { katex } from '@mdit/plugin-katex'

/** 六卷 + 作业 + 导论的篇目（侧边栏标题用名词短语，便于检索）。 */
const volumes = [
  {
    text: '第一卷 · 判断力地基',
    items: [
      { text: '1.1 一个功能的一生', link: '/01-判断力地基/1.1-一个功能的一生' },
      { text: '1.2 复杂度与技术债', link: '/01-判断力地基/1.2-复杂度与技术债' },
      { text: '1.3 读代码与架构', link: '/01-判断力地基/1.3-读代码与架构' },
      { text: '1.4 接口与契约', link: '/01-判断力地基/1.4-接口与契约' },
      { text: '1.5 数据、状态与可逆性', link: '/01-判断力地基/1.5-数据、状态与可逆性' },
    ],
  },
  {
    text: '第二卷 · 最小闭环',
    items: [
      { text: '2.1 模型层', link: '/02-最小闭环/2.1-模型层' },
      { text: '2.2 工具系统', link: '/02-最小闭环/2.2-工具系统' },
      { text: '2.3 容器与依赖注入', link: '/02-最小闭环/2.3-容器与依赖注入' },
      { text: '2.4 事件与扩展点', link: '/02-最小闭环/2.4-事件与扩展点' },
      { text: '2.5 作用域与隔离', link: '/02-最小闭环/2.5-作用域与隔离' },
      { text: '2.6 装配与配置组合', link: '/02-最小闭环/2.6-装配与配置组合' },
      { text: '2.7 会话日志与循环', link: '/02-最小闭环/2.7-会话日志与循环' },
    ],
  },
  {
    text: '第三卷 · 可靠性与纵深',
    items: [
      { text: '3.1 重试与错误分类', link: '/03-可靠性与纵深/3.1-重试与错误分类' },
      { text: '3.2 守卫、审批与沙箱', link: '/03-可靠性与纵深/3.2-守卫、审批与沙箱' },
      { text: '3.3 上下文压缩与溢出', link: '/03-可靠性与纵深/3.3-上下文压缩与溢出' },
      { text: '3.4 进程与后台作业', link: '/03-可靠性与纵深/3.4-进程与后台作业' },
      { text: '3.5 持久化与恢复', link: '/03-可靠性与纵深/3.5-持久化与恢复' },
      { text: '3.6 可观测', link: '/03-可靠性与纵深/3.6-可观测' },
    ],
  },
  {
    text: '第四卷 · 学习进化',
    items: [
      { text: '4.1 记忆', link: '/04-学习进化/4.1-记忆' },
      { text: '4.2 技能', link: '/04-学习进化/4.2-技能' },
      { text: '4.3 用户建模', link: '/04-学习进化/4.3-用户建模' },
      { text: '4.4 诊断', link: '/04-学习进化/4.4-诊断' },
      { text: '4.5 演化', link: '/04-学习进化/4.5-演化' },
      { text: '4.6 复盘周期', link: '/04-学习进化/4.6-复盘周期' },
      { text: '4.7 长程任务', link: '/04-学习进化/4.7-长程任务' },
    ],
  },
  {
    text: '第五卷 · 规模化与交互',
    items: [
      { text: '5.1 模式与预设', link: '/05-规模化与交互/5.1-模式与预设' },
      { text: '5.2 多会话与并发', link: '/05-规模化与交互/5.2-多会话与并发' },
      { text: '5.3 交互与权限', link: '/05-规模化与交互/5.3-交互与权限' },
      { text: '5.4 多智能体与外部工具', link: '/05-规模化与交互/5.4-多智能体与外部工具' },
    ],
  },
  {
    text: '第六卷 · 科研出口',
    items: [
      { text: '6.1 开放问题', link: '/06-科研出口/6.1-开放问题' },
      { text: '6.2 实验方法', link: '/06-科研出口/6.2-实验方法' },
      { text: '6.3 harness 效果评测与 benchmark', link: '/06-科研出口/6.3-harness评测与benchmark' },
      { text: '6.4 从观察到问题', link: '/06-科研出口/6.4-从观察到问题' },
    ],
  },
  {
    text: '第七卷 · 大模型基模',
    items: [
      { text: '7.1 token 与分词', link: '/07-大模型基模/7.1-token与分词' },
      { text: '7.2 注意力与 KV cache', link: '/07-大模型基模/7.2-注意力与KVcache' },
      { text: '7.3 预训练、微调与对齐', link: '/07-大模型基模/7.3-预训练微调与对齐' },
      { text: '7.4 采样与确定性', link: '/07-大模型基模/7.4-采样与确定性' },
      { text: '7.5 推理的成本结构', link: '/07-大模型基模/7.5-推理的成本结构' },
      { text: '7.6 能力评测', link: '/07-大模型基模/7.6-能力评测' },
    ],
  },
  {
    text: '作业工作区',
    items: [
      { text: 'ch01 判断力', link: '/homework/ch01-judgment/index' },
      { text: 'ch02 最小闭环', link: '/homework/ch02-loop/index' },
      { text: 'ch03 可靠性与纵深', link: '/homework/ch03-reliability/index' },
      { text: 'ch04 学习进化', link: '/homework/ch04-evolution/index' },
      { text: 'ch05 规模化与交互', link: '/homework/ch05-scale/index' },
      { text: 'ch06 科研出口', link: '/homework/ch06-research/index' },
    ],
  },
  {
    text: '导论与参考',
    items: [
      { text: '0.1 课程地图', link: '/00-导论/0.1-课程地图' },
      { text: '0.2 毕业标准', link: '/00-导论/0.2-毕业标准' },
      { text: '0.3 作业与提交规范', link: '/00-导论/0.3-作业与提交规范' },
      { text: '术语表', link: '/00-导论/术语表' },
    ],
  },
]

export default defineConfig({
  // 部署基路径：本地与"根路径部署"用 '/'；GitHub Pages 的子路径部署由 CI 注入
  // （例如仓库名为 dsh-course 时是 '/dsh-course/'）。配错会让所有资源 404。
  base: process.env.DOCS_BASE ?? '/',
  lang: 'zh-CN',
  title: 'Agent Harness 工程',
  description: '从判断力到科研出口的系统课程：讲义、锚点、算例与作业',
  cleanUrls: true,
  srcExclude: [
    // 旧稿存档不进站点（历史材料，链接可能已过期）
    '**/docs/**',
    '**/node_modules/**',
    // 仓库说明面向 GitHub 读者，不必进站点（它含面向本机路径的说明）
    'README.md',
    // 构建产物与缓存必须排除：否则第二次构建会把上次的产物当成源文件扫描（本仓库曾因此崩溃）
    '**/.vitepress/**',
    // 两个巨型参考文件不进站点：合计约 900 KB，且含上千个美元符号（会拖慢构建并干扰数学解析）
    'appendix/面试题库.md',
    'appendix/面试题库-v2.md',
  ],
  ignoreDeadLinks: false, // 死链等于交付失败（见 0.5 第七节）
  // 数学渲染在构建期完成（KaTeX）：HTML 里直接是排版好的公式，
  // 不依赖 CDN，也不受客户端路由影响。样式表由 .vitepress/theme/index.ts 引入。
  markdown: {
    config: (md) => {
      md.use(katex)
    },
  },

  themeConfig: {
    nav: [
      { text: '导论', link: '/00-导论/0.1-课程地图' },
      { text: '讲义', link: '/01-判断力地基/1.1-一个功能的一生' },
      { text: '作业', link: '/homework/ch01-judgment/index' },
      { text: '术语表', link: '/00-导论/术语表' },
    ],
    sidebar: { '/': volumes },
    search: { provider: 'local' },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
  },
})
