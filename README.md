# 基于 GitHub 的 Swagger/OpenAPI 文档管理系统

> **文件类型：** 架构设计方案 | **状态：** 实施中 | **目标架构：** 无服务端纯前端应用 (Serverless SPA)

## 1. 项目概述与核心愿景

在前后端分离的团队协作中，API 文档的高效管理和版本追溯一直是核心痛点。传统的 Swagger 管理方式通常依赖专门的后端服务与数据库（如 Swagger Enterprise、YApi 等），这带来了服务器维护成本、数据备份以及多套环境同步的复杂性。

本方案提出一种 **纯前端、去中心化、Serverless化** 的 Swagger/OpenAPI 文档管理系统。该系统直接依托 **GitHub 仓库** 作为文档的底层存储介质，利用 Git 天然的分支、提交（Commit）历史以及权限管控能力，实现免后端服务的 API 文档版本管理。用户通过 GitHub 账户授权或提供细粒度访问令牌（Fine-grained PAT）后，即可在浏览器端完成文档的同步、可视编辑、版本对齐和变更提交。

---

## 2. 核心架构设计 (Architecture Topology)

系统采用完全运行在浏览器侧的单页应用（SPA）架构。将数据层全面上移并委托给 GitHub API，前端通过 Octokit SDK 直接与 GitHub 进行加密安全的远程通信。

| 系统分层                 | 核心职责                                                               | 技术组件 / API                                       |
| :----------------------- | :--------------------------------------------------------------------- | :--------------------------------------------------- |
| **视图与表现层**         | 负责文档树渲染、Swagger 交互式预览、可视化代码编辑器、版本时间轴展示。 | React 19, Shadcn/UI, Monaco Editor, Swagger-UI-React |
| **状态与控制层**         | 维护当前活跃的仓库信息、文件树状态、本地未提交缓存、用户鉴权上下文。   | React Context, TanStack Query                        |
| **基础设施与网关层**     | 封装 GitHub REST API，处理 Base64 编解码、数据暂存及离线冲突检测。     | `@octokit/rest`, `js-base64`                         |
| **持久化存储层（外部）** | 代码库托管、文档版本变更、组织/成员细粒度读写权限管理。                | GitHub Repository                                    |

> 💡 **架构优势：**
>
> 1. **零维护成本：** 无需租赁服务器、无需部署数据库，静态页面可托管于 GitHub Pages、Vercel 或 Cloudflare Pages。
> 2. **天然的版本控制：** 每次保存即一次 Git Commit，每次发布可关联 Git Tag，历史版本对比天然支持。
> 3. **权限复用：** 直接复用 GitHub 团队的组织架构与仓库权限，无需开发复杂的 RBAC 权限系统。

---

## 3. 关键业务流程与技术实现

### 3.1 用户认证与鉴权选型

由于应用完全没有独立后端，纯前端直接对接 GitHub OAuth 流会面临 `client_secret` 泄露的安全隐患。方案提供两种互补的鉴权路径：

1. **细粒度个人访问令牌 (Fine-grained PAT) 模式【首选】：**
   用户在 GitHub 官方生成针对特定文档仓库的 Token，应用将其存储于浏览器的加密本地存储中。这种模式最纯粹，完全不需要任何服务端逻辑参与。
2. **轻量级托管 Exchange 函数模式【备选】：**
   引入一个极简的 Serverless 函数（如 Cloudflare Workers 或 Vercel Edge Function），仅用于在换取 Access Token 时隐藏 `client_secret`，不留存任何用户数据。

### 3.2 数据流与同步机制

当用户授权一个仓库后，应用将模拟一个轻量级的 Git 工作区运作。核心的数据存取和同步链路如下：

```text
[ 浏览器端 Web App ]                                [ GitHub REST API ]
       │                                                    │
       ├────── 1. 获取文件树 ──────────────────────────────>│ (repos.getContent)
       │<───── 2. 返回目录结构及各文件 SHA ─────────────────┤
       │                                                    │
       ├────── 3. 选定文档，请求详情 ───────────────────────>│ (repos.getContent)
       │<───── 4. 返回 Base64 编码的文档内容 ───────────────┤
       │                                                    │
   [本地解码编辑]                                              │
       │                                                    │
       ├────── 5. 提交修改 (带上当前的 SHA) ────────────────>│ (repos.createOrUpdateFileContents)
       │<───── 6. 写入成功，返回全新生成的文件 SHA ──────────┤

```

### 3.3 冲突解决机制 (Conflict Resolution)

由于存在多人在不同设备协同修改同一个 Swagger 文档的可能性，GitHub API 要求每次更新必须传入当前已知的最新文件 `sha` 值。如果在用户编辑期间，远程仓库已被他人更新，GitHub 会返回 `409 Conflict` 状态码。

> ⚠️ **高风险控制：并发冲突处理策略**
> 当捕获到 409 错误时，系统应当：
>
> 1. 自动调用 API 获取最新的远程文档内容。
> 2. 在前端使用 Diff 算法（如 `jsdiff`）将“本地修改”、“远程最新修改”以及“初始修改基线”进行三方对比。
> 3. 弹窗提示用户，以可视化的分栏视图（Side-by-Side Diff）引导用户手动选择保留冲突代码，并在解决后重新获取新 `sha` 完成提交。

---

## 4. 核心功能模块划分

- **工作空间与项目树：** 动态拉取用户有权限的仓库与分支，提供类似 IDE 的左侧树形目录导航，过滤出 `.json`, `.yaml`, `.yml` 格式的 OpenAPI 定义文件。
- **双栏双向同步编辑器：** 左侧为高性能文本编辑器（支持 JSON/YAML 语法高亮、代码提示与实时 Schema 校准），右侧实时渲染出 `swagger-ui` 的动态预览，提供“所见即所得”的体验。
- **版本演进时间轴：** 调用 `listCommits` 接口过滤针对特定文件的提交历史，支持点击任意历史节点查看当次提交的修改内容与说明，具备一键回滚历史版本的能力。

---

## 5. 前端技术栈选型推荐

为了保证应用在处理高并发数据、大容量文档时的性能与稳定性，推荐采用如下现代前端技术选型：

- **核心框架：** `React 19` (利用其全新的 Action 机制与并发特性，优化大型异步请求加载体验)。
- **UI 组件库：** `Shadcn/UI` (高度可定制，基于 Tailwind CSS，无冗余样式，适合构建干净专业的工具类平台)。
- **Git 客户端 SDK：** `@octokit/rest` (GitHub 官方提供的标准 REST 客户端，类型支持完备)。
- **文档解析与校验：** `@stoplight/spectral` (用于在前端编辑时提供实时的 OpenAPI 设计规范合规性校验，防止拼写错误导致提交脏数据)。

---

## 6. 扩展性预留规划

在基础版本稳定后，由于纯前端架构高度灵活，系统后续可无缝向以下方向扩展：

1. **多分支协作流水线：** 支持直接从当前文档切出 `feat/api-update` 新分支，编辑完成后在前端一键向主分支提起 Pull Request，将 API 评审完全融入现有的 GitHub Code Review 研发流。
2. **Webhooks 联动：** 可配置仓库的 Webhook，当主分支文档变更时，自动触发企业微信、钉钉或 Slack 通知的发送，彻底打通研发生态圈。

---

## 7. 实施细则（2026-07 确认）

完整设计文档见 `docs/superpowers/specs/2026-07-03-openapi-doc-manager-design.md`。

### 7.1 分期计划

- **MVP（已实现）：** PAT 登录 → 仓库列表 → 分支 + OpenAPI 文件树 → Monaco + swagger-ui 双栏编辑 → 提交保存。
- **二期（已实现）：** 部署上线（GitHub Pages + Actions）、版本时间轴（提交历史 + 双基准 diff + 回滚）、Spectral 实时校验；OAuth Exchange 函数待外部账号就绪。
- **三期：** 409 冲突三方可视化合并（jsdiff）、多分支协作（前端发起 PR）、Webhooks 通知联动。
- **可视化接口管理（Apifox 式，规划中）：** 接口浏览 → 数据模型 → 可视化编辑 → 接口调试，四块分期推进，路线图见 `docs/superpowers/specs/2026-07-04-visual-api-management-roadmap.md`。

### 7.2 关键决策

| 决策点   | 结论                                                              |
| :------- | :---------------------------------------------------------------- |
| 鉴权     | 仅 Fine-grained PAT，存 localStorage（key：`openapi.github.pat`） |
| 路由     | TanStack Router 文件式路由；分支经 `?ref=` search param 传递      |
| 编辑器   | Monaco（左）+ swagger-ui-react（右，只读预览）                    |
| 冲突处理 | MVP 降级：409 时提示「远端已更新，请刷新后重试」                  |
| UI       | shadcn/ui + 官方 blocks（login-01 等）改造                        |

### 7.3 目录结构

    src/
    ├── routes/          # TanStack Router 文件式路由（装配、loader、守卫）
    ├── features/
    │   ├── auth/        # PAT 会话、登录表单
    │   ├── explorer/    # 仓库列表、分支选择、文件树、Query 工厂
    │   └── editor/      # Monaco、swagger 预览、保存对话框
    ├── lib/
    │   ├── github.ts    # Octokit 封装、Base64、错误分类
    │   └── openapi.ts   # 文档解析与 OpenAPI 识别
    └── components/ui/   # shadcn/ui 组件

### 7.4 本地开发

    vp install   # 安装依赖
    vp dev       # 启动开发服务器
    vp check     # 格式化 / lint / 类型检查
    vp test      # 运行测试
