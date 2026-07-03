# GitHub Pages 部署上线 — 设计文档（二期·子项目 1）

> 日期：2026-07-03 | 状态：已确认 | 前置：MVP 已合入 main 并推送远端（f83cefd）

## 1. 目标

把 OpenAPI 文档管理系统部署到 GitHub Pages：push main 自动构建发布，访问地址
`https://canvascat.github.io/openapi/`，深链刷新不白屏，CI 带质量门禁与 Vite Task 缓存。

## 2. 已确认的决策

| 决策点   | 结论                                                                                                                                                         |
| :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 平台     | GitHub Pages，Pages Source 用 "GitHub Actions"（无 gh-pages 分支）                                                                                           |
| 访问地址 | 默认子路径 `/openapi/`，不配自定义域名                                                                                                                       |
| Monaco   | 维持 jsdelivr CDN 加载，不做本地打包                                                                                                                         |
| CI 基座  | `voidzero-dev/setup-vp@v1`（node 24 + cache: true），参考 viteplus.dev/guide/ci                                                                              |
| 任务缓存 | 按 viteplus.dev/guide/github-actions-cache：check/test/build 定义为 `vp run` 任务，跨 run 恢复 `node_modules/.vite/task-cache`（实验特性，失效不影响正确性） |
| 范围外   | 自定义域名、PR 预览环境、OAuth Exchange（后续子项目）                                                                                                        |

## 3. 代码改动（子路径适配）

1. **`vite.config.ts`**
   - 加 `base: "/openapi/"`（dev/build 统一，本地 dev 与线上行为一致）。
   - 加 `run.tasks`：`{ check: "vp check", test: "vp test", build: "vp build" }`，供 CI 走 `vp run` 启用任务缓存。
2. **`src/main.tsx`**
   - `createRouter` 加 `basepath: import.meta.env.BASE_URL`，路由内 Link/redirect 自动适配子路径。
   - QueryCache 401 处理的 `window.location.assign("/auth")` 改为 `window.location.assign(import.meta.env.BASE_URL + "auth")`。
3. **`src/routes/_authed.repos.$owner.$repo.edit.$.tsx`**
   - save mutation 401 分支的硬编码跳转同上改为 base 感知。

（以上同时清掉终审 Minor #7 的硬编码根路径问题。）

## 4. SPA 深链回退

GitHub Pages 对未知路径返回 404。构建后把 `dist/index.html` 复制为 `dist/404.html`
（Pages 标准 SPA 技巧），使 `/openapi/repos/...` 直达刷新时仍加载应用、由前端路由接管。
复制动作放在 CI 工作流构建步骤之后（本地构建不受影响）。

## 5. CI 工作流 `.github/workflows/deploy.yml`

触发：push 到 main。权限：`contents: read`、`pages: write`、`id-token: write`。
并发组 `pages`（cancel-in-progress: false，防止部署互踩）。

步骤（两个 job：build → deploy，官方 Pages 模式）：

```
build job (ubuntu-latest):
  1. actions/checkout@v4
  2. voidzero-dev/setup-vp@v1  (node-version: '24', cache: true)
  3. vp install
  4. actions/cache/restore@v6  path: node_modules/.vite/task-cache
     key: vite-task-${{ runner.os }}-${{ runner.arch }}-${{ github.run_id }}-${{ github.run_attempt }}
     restore-keys: vite-task-${{ runner.os }}-${{ runner.arch }}-
  5. vp run check   # 质量门禁：fmt + lint + 类型
  6. vp run test    # 35 个单测
  7. vp run build   # 产出 dist/（含 base=/openapi/）
  8. cp dist/index.html dist/404.html
  9. actions/cache/save@v6（if: success()，key 用 restore 步骤的 cache-primary-key）
  10. actions/upload-pages-artifact@v3  path: dist

deploy job (needs: build, environment: github-pages):
  actions/deploy-pages@v4
```

缓存键遵循官方指引：主键含 run_id/run_attempt（条目不可变，每次成功保存新条目），
restore 前缀按 OS/arch 匹配最新缓存；任务输入（源码/lockfile）交给 Vite Task 指纹，
不进 Actions key。

## 6. 一次性手动步骤（用户操作）

仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
（无 gh CLI，无法自动化；不做此步 deploy job 会报环境未配置。）

## 7. 验证

- **本地**：`vp run build` 连跑两次确认第二次 cache hit（任务缓存前置条件）；
  `vp build && vp preview` 打开 `http://localhost:4173/openapi/` 走登录 → 仓库列表，
  确认子路径下路由跳转与静态资源路径正确；`vp check && vp test` 全绿。
- **线上**：push 后 Actions 绿灯；访问 `https://canvascat.github.io/openapi/` 完成一次
  PAT 登录；深链（如 `/openapi/repos`）刷新不白屏；第二次 push 观察 Vite Task
  缓存命中日志（`cache hit, replaying`）。

## 8. 测试策略

纯配置/装配改动，不新增单测；既有 35 个单测作为 CI 门禁。子路径行为靠
`vp preview` 本地手验 + 线上冒烟。唯一逻辑改动（两处 401 跳转 base 感知）由
现有代码走查覆盖，不值得为 `window.location` 包一层抽象来换可测性（YAGNI）。

## 9. 风险与回退

- Vite Task 跨 run 缓存是实验特性：任何失效表现为「缓存未命中、任务全量重跑」，
  只影响时长不影响正确性；若持续 miss，按官方指引先修任务指纹而非改 Actions key。
- `vp run` 任务与直接命令（`vp build`）缓存互不相通，本地开发习惯不受影响。
- 部署失败不影响既有站点版本（Pages 原子发布）。
