# 基于 GitHub 的 OpenAPI 文档管理系统 — MVP 设计文档

> 日期：2026-07-03 | 状态：已确认 | 蓝本：项目 README 架构提案

## 1. 目标

以 README 提案为蓝本，落地纯前端 Serverless 的 Swagger/OpenAPI 文档管理系统 MVP：
用户使用 GitHub Fine-grained PAT 登录，浏览有权限的仓库与分支，在过滤后的
OpenAPI 文件树中选择文档，通过 Monaco + swagger-ui 双栏编辑器「所见即所得」地
编辑，并直接提交回 GitHub 仓库。

## 2. 已确认的决策

| 决策点            | 结论                                                                       |
| :---------------- | :------------------------------------------------------------------------- |
| MVP 范围          | PAT 鉴权 + 仓库/文件树 + 双栏编辑器与实时预览（含保存提交）                |
| 鉴权              | 仅 Fine-grained PAT，存 localStorage；OAuth Exchange 函数列为二期可选      |
| 编辑器            | Monaco Editor（`@monaco-editor/react`）；swagger-ui-react 仅作右栏只读预览 |
| Spectral 规范校验 | 二期；MVP 依靠 Monaco 语法校验 + swagger-ui 渲染报错兜底                   |
| 冲突处理          | MVP 降级：409 时提示「远端已更新，请刷新后重试」；三方合并列为三期         |
| 路由              | TanStack Router（文件式路由），与 TanStack Query 同生态                    |
| UI                | shadcn/ui + 官方 blocks（login / sidebar / dashboard 系列）改造            |
| 部署              | 暂不部署，本地开发优先；部署方案仅写入文档                                 |

## 3. 分期计划

- **MVP（本期）**：PAT 登录 → 仓库列表 → 分支 + OpenAPI 文件树 → 双栏编辑 → 提交保存。
- **二期**：版本时间轴（listCommits + 历史 diff + 一键回滚）、Spectral 实时校验、OAuth Exchange 函数（可选）、部署上线（GitHub Pages / Vercel）。
- **三期**：409 冲突三方可视化合并（jsdiff）、多分支协作（切分支 + 前端发起 PR）、Webhooks 通知联动。

## 4. 路由设计（TanStack Router）

```
src/routes/
├── __root.tsx                        # 根布局：QueryClientProvider、Octokit Context、Toaster
├── index.tsx                         # /：有 token → 重定向 /repos，否则 → /auth
├── auth.tsx                          # /auth：PAT 输入与校验（login block 改造）
└── _authed/                          # 布局路由：beforeLoad 校验 token，无效 redirect /auth
    ├── repos.index.tsx               # /repos：仓库列表（卡片网格）
    └── repos.$owner.$repo/
        ├── index.tsx                 # /repos/:owner/:repo：分支选择 + OpenAPI 文件树
        └── edit.$.tsx                # /repos/:owner/:repo/edit/*：双栏编辑器（$ 通配文件路径）
```

- 文件路径含多级斜杠，用 splat（`$`）段承载。
- 分支用类型化 search param `?ref=<branch>`（`validateSearch`），切分支不换路由。
- 路由 `loader` 配合 Query `ensureQueryData` 预取文件树 / 文件内容。

## 5. 目录结构与模块划分

```
src/
├── main.tsx                 # RouterProvider 入口
├── routes/                  # 见上节，页面壳 + loader + 守卫
├── features/
│   ├── auth/                # PAT 表单、token 校验（octokit rest users.getAuthenticated）、本地存取
│   ├── explorer/            # 仓库列表、分支选择器、文件树组件与过滤逻辑
│   └── editor/              # Monaco 封装、swagger-ui 预览封装、保存提交对话框
├── lib/
│   ├── github.ts            # Octokit 封装：listRepos / listBranches / getTree / getContent / updateContent
│   └── openapi.ts           # YAML/JSON 解析（js-yaml）、OpenAPI 文件识别规则
└── components/ui/           # shadcn/ui 组件与 blocks
```

各模块单一职责：`lib/` 纯函数无 React 依赖，可独立单测；`features/` 组件只消费
`lib/` 与 Query hooks；`routes/` 只做装配与导航。

## 6. 核心数据流

1. 用户在 `/auth` 输入 PAT → `users.getAuthenticated` 校验 → 成功后存 localStorage 并跳 `/repos`。
2. Octokit 实例经 React Context 提供；TanStack Query 管理所有 GitHub API 请求的缓存 / 重试 / 加载态。
3. 文件树：`git.getTree(recursive)` 拉全树 → 过滤 `.json/.yaml/.yml` 扩展名 → 懒校验内容含 `openapi`/`swagger` 顶级字段。
4. 编辑：`repos.getContent` 取 Base64 内容解码 → Monaco 编辑 → 防抖 500ms 解析（js-yaml）→ 右栏 swagger-ui 重渲染。
5. 保存：对话框填写 commit message → `repos.createOrUpdateFileContents` 携带原 SHA → 成功后以返回的新 SHA 更新本地状态并失效相关 Query 缓存。

## 7. UI 与 shadcn blocks 映射

| 页面       | 复用 block         | 改造点                                                |
| :--------- | :----------------- | :---------------------------------------------------- |
| /auth      | login 系列         | 表单字段换成 PAT 输入 + Fine-grained PAT 生成指引链接 |
| 工作区布局 | sidebar 系列       | Sidebar 放仓库/分支切换 + 文件树；主区域放编辑器双栏  |
| /repos     | dashboard 卡片网格 | 仓库卡片：名称、描述、私有标识、更新时间              |

blocks 通过 `shadcn add <block>` 拉取为本地源码后按需改造（项目已有 `components.json`）。

## 8. 错误处理

- **401**：清除本地 token，redirect `/auth` 并 toast 提示。
- **403（限流）**：toast 显示 rate limit 重置时间。
- **409（保存冲突）**：提示「远端已更新，请刷新后重试」，提供一键重新拉取按钮（丢弃/保留本地改动二选一）。
- **YAML/JSON 解析失败**：右栏显示解析错误信息而非崩溃；swagger-ui 用 ErrorBoundary 包裹。
- **大文件（>1MB，getContent 限制）**：MVP 提示暂不支持。

## 9. 新增依赖

`@tanstack/react-router`、`@tanstack/router-plugin`（Vite 插件）、`@tanstack/react-query`、
`@octokit/rest`、`@monaco-editor/react`、`swagger-ui-react`（含 `@types/swagger-ui-react`）、`js-yaml`（含 `@types/js-yaml`）。

## 10. 测试策略

- `lib/openapi.ts`、`lib/github.ts` 单元测试（Vitest，经 `vp test` 运行）：文件过滤规则、Base64 编解码、错误映射。
- 关键组件（PAT 表单、保存对话框）做渲染级测试。
- 编辑器 / swagger-ui 集成以手动验证为主（`vp dev`）。

## 11. README 完善

在现有架构提案之后追加「实施细则」章节：分期计划、目录结构、路由设计、
依赖清单、本文档所列全部决策；提案原文保持不动，状态从「提案」更新为「实施中」。
