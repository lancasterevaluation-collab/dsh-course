// 自定义主题：把 KaTeX 样式与阅读层次样式打进站点产物。
//
// 两者都不依赖 CDN，也不受客户端路由影响。
import DefaultTheme from 'vitepress/theme'
import 'katex/dist/katex.min.css'
import './custom.css'

export default DefaultTheme
