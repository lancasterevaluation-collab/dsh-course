# Agent Harness 工程：从判断力到科研出口

一套成体系的 agent harness 课程：**33 篇讲义 + 6 个大作业 + 理论锚点 + 可运行算例**。

站点由 VitePress 构建，可发布为静态站点（GitHub Pages / Vercel / Netlify 均可）。

## 本地预览

```sh
npm ci
npm run docs:dev        # 本地开发服务器，带热更新
```

## 构建

```sh
npm run docs:build      # 先清空产物目录，再构建到 .vitepress/dist
npm run docs:preview    # 预览构建产物
```

> **不要直接重跑 `vitepress build`**：产物目录已存在时第二次构建会以 `0xC0000409` 崩溃。
> `docs:build` 里的 `clean-dist.mjs` 正是为此存在的。

## 部署到 GitHub Pages

仓库已带 `.github/workflows/deploy-pages.yml`，推送即发布：

```sh
git init
git add -A
git commit -m "课程站点"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在仓库里做一次设置：**Settings → Pages → Build and deployment → Source 选 `GitHub Actions`**。

站点地址是 `https://<用户名>.github.io/<仓库名>/`。

### 为什么子路径能工作

GitHub Pages 的子路径部署要求 VitePress 的 `base` 等于 `/<仓库名>/`，配错会让所有资源 404。
这里由 CI 注入，不写死在配置里：

```yaml
env:
  DOCS_BASE: /${{ github.event.repository.name }}/
```

本地与根路径部署（Vercel、Netlify、自定义域名）不设该变量，`base` 回落到 `/`。
需要手动指定时：

```sh
DOCS_BASE=/my-repo/ npm run docs:build      # PowerShell: $env:DOCS_BASE='/my-repo/'
```

## 部署到其他平台

| 平台 | 做法 |
|---|---|
| Vercel | 导入仓库，构建命令 `npm run docs:build`，输出目录 `.vitepress/dist` |
| Netlify | 同上；或直接拖拽 `.vitepress/dist` 目录 |
| 任意静态托管 | 上传 `.vitepress/dist` 的内容 |

## 目录结构

```
index.md                首页（VitePress home 布局）
00-导论/                课程地图、毕业标准、写作与站点规范、术语表
01-判断力地基/ … 06-科研出口/    六卷讲义，每卷 3–7 篇
homework/               六个大作业工作区（kit 起点 / tests 判分器 / grade 参考实现）
examples/               算例与数字回归断言（每篇讲义配一个）
scripts/                质量门：讲义骨架、教科书化判据、文本规范化
appendix/               附录与题库
进度.md                 项目台账（做到哪、下一步、验收数据）
.vitepress/             站点配置、主题样式与构建产物
```

## 质量门

改动讲义或算例后，这几条必须全绿：

```sh
npm run check            # 讲义骨架、篇幅比例、加粗密度
npm run check:textbook   # 教科书化十条判据
npm run test:examples    # 全部算例的数字回归断言
npm run docs:build       # 构建（含死链检查，退出码必须为 0）
```

## 内容约定

- 讲义走五层结构：【设计原因】→【直觉】→【严格】→【回到直觉】→【工具箱】，固定 16 节；
- 形式化结论用锚点编号引用（`SA-01`…`SA-42`），每篇新建一个；
- 每个数字都有对应算例复现，改错公式或实现会让断言立刻失败；
- 每篇末尾有"只记一句话"与记忆层（骨架、情境绑定、主动回忆、复述练习）。

## 许可

课程内容与代码供学习使用。
