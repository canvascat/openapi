# GitHub Pages 部署上线实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 OpenAPI 文档管理系统部署到 GitHub Pages（`https://canvascat.github.io/openapi/`），push main 自动构建发布，深链刷新不白屏。

**Architecture:** 三步走——先做子路径适配（vite base + TanStack Router basepath + 两处硬编码 401 跳转改 base 感知），再写 GitHub Actions 官方 Pages 工作流（setup-vp + Vite Task 跨 run 缓存 + 质量门禁），最后推送上线并冒烟验证。无新增依赖、无新增运行时逻辑。

**Tech Stack:** GitHub Pages（Actions 模式）、voidzero-dev/setup-vp@v1、actions/cache v6、actions/upload-pages-artifact@v3、actions/deploy-pages@v4、Vite base、TanStack Router basepath。

**Spec:** `docs/superpowers/specs/2026-07-03-github-pages-deploy-design.md`

## Global Constraints

- 包管理与脚本一律走 `vp`；CI 中通过 `vp run <task>` 执行以启用任务缓存。
- 访问地址固定为子路径 `/openapi/`；vite `base` 与 Router `basepath` 必须一致（后者取 `import.meta.env.BASE_URL`）。
- Monaco 维持 CDN 加载，本期不做本地打包。
- 所有面向用户的文案用中文。
- `src/routeTree.gen.ts` 为插件生成文件，勿手改。
- 每次提交前 pre-commit 自动跑 `vp check --fix`。

---

### Task 1: 子路径适配与本地验证

**Files:**

- Modify: `vite.config.ts`
- Modify: `src/main.tsx`
- Modify: `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`（约 67-71 行的 unauthorized 分支）

**Interfaces:**

- Produces: 构建产物资源路径以 `/openapi/` 为前缀；`vite.config.ts` 新增 `run.tasks` 的 `check`/`test`/`build` 三个任务名（Task 2 的 CI 工作流依赖这三个任务名，必须逐字一致）。

- [ ] **Step 1: vite.config.ts 加 base 与 run.tasks**

在 `defineConfig({...})` 对象中，`plugins` 之前加 `base`，并新增顶层 `run` 配置（其余配置不动）：

```ts
export default defineConfig({
  base: "/openapi/",
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  run: {
    tasks: {
      check: "vp check",
      test: "vp test",
      build: "vp build",
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
```

注意：保留文件现有的 `fmt`/`lint` 的 `ignorePatterns` 等既有配置（如与上面片段有出入，以工作区现状为准，只做「加 base、加 run」两处增量）。

- [ ] **Step 2: main.tsx 加 basepath 并修 401 跳转**

第 21 行 `createRouter` 改为：

```tsx
const router = createRouter({
  routeTree,
  context: { queryClient },
  basepath: import.meta.env.BASE_URL,
});
```

第 15 行 `window.location.assign("/auth")` 改为：

```tsx
window.location.assign(`${import.meta.env.BASE_URL}auth`);
```

（`BASE_URL` 值为 `/openapi/`，尾部自带斜杠，故拼接 `auth` 而非 `/auth`。）

- [ ] **Step 3: 编辑页 401 跳转同步修改**

`src/routes/_authed.repos.$owner.$repo.edit.$.tsx` 中 save mutation `onError` 的 unauthorized 分支（约 67-71 行）：

```tsx
if (kind === "unauthorized") {
  clearToken();
  window.location.assign(`${import.meta.env.BASE_URL}auth`);
  return;
}
```

（同函数内 conflict 分支的 `window.location.reload()` 与路径无关，不改。）

- [ ] **Step 4: 全量检查与测试**

Run: `vp check && vp test`
预期：0 errors 0 warnings；35/35 通过。

- [ ] **Step 5: 任务缓存前置条件验证（vp run 连跑两次）**

```bash
vp run build
vp run build
```

预期：第二次输出包含 cache hit（如 `cache hit, replaying`）。若第二次 miss，属任务指纹不稳定，报告实际输出（不要自行改 Actions 键策略，那是 Task 2 的输入）。

- [ ] **Step 6: 子路径本地手验**

```bash
vp build
vp preview
```

打开 `http://localhost:4173/openapi/`：确认页面正常加载（重定向到 `/openapi/auth` 显示登录页）、静态资源无 404（浏览器控制台无报错）、点击「去 GitHub 生成一个」以外的路由跳转均带 `/openapi/` 前缀。验证完停掉 preview 进程，确认端口无残留监听。

- [ ] **Step 7: 提交**

```bash
git add vite.config.ts src/main.tsx "src/routes/_authed.repos.\$owner.\$repo.edit.\$.tsx"
git commit -m "feat: 子路径 /openapi/ 适配——vite base、Router basepath 与 401 跳转"
```

---

### Task 2: GitHub Actions 部署工作流

**Files:**

- Create: `.github/workflows/deploy.yml`

**Interfaces:**

- Consumes: Task 1 定义的 `vp run` 任务名 `check`/`test`/`build`（逐字一致）。
- Produces: push main 触发的 build→deploy 两段式 Pages 工作流。

- [ ] **Step 1: 创建 `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: voidzero-dev/setup-vp@v1
        with:
          node-version: "24"
          cache: true

      - run: vp install

      - name: Restore Vite Task cache
        id: vite-task-cache
        uses: actions/cache/restore@v6
        with:
          path: node_modules/.vite/task-cache
          key: vite-task-${{ runner.os }}-${{ runner.arch }}-${{ github.run_id }}-${{ github.run_attempt }}
          restore-keys: |
            vite-task-${{ runner.os }}-${{ runner.arch }}-

      - run: vp run check
      - run: vp run test
      - run: vp run build

      - name: SPA fallback
        run: cp dist/index.html dist/404.html

      - name: Save Vite Task cache
        if: success()
        uses: actions/cache/save@v6
        with:
          path: node_modules/.vite/task-cache
          key: ${{ steps.vite-task-cache.outputs.cache-primary-key }}

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 本地静态验证**

项目无 yaml lint 工具，验证为逐项走查（在报告中逐条确认）：

1. `vp run check` / `vp run test` / `vp run build` 三个任务名与 `vite.config.ts` 的 `run.tasks` 键逐字一致；
2. 缓存 `path` 为 `node_modules/.vite/task-cache`，restore 的 `key`/`restore-keys` 与 save 引用的 `cache-primary-key` 与本文件 Task 2 Step 1 代码块一致；
3. `upload-pages-artifact` 的 `path` 为 `dist`；`permissions` 含 `pages: write` 与 `id-token: write`；`concurrency.group` 为 `pages`。

Run: `vp check && vp test`
预期：全绿（workflow 文件不影响前端检查，确认无误伤）。

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: GitHub Pages 部署工作流（setup-vp + Vite Task 缓存）"
```

---

### Task 3: 推送上线与冒烟验证（控制器执行，含用户交互）

**Files:** 无代码改动。

**Interfaces:**

- Consumes: Task 1/2 的全部提交；用户在仓库 Settings → Pages 把 Source 切为 "GitHub Actions"（一次性手动步骤）。

- [ ] **Step 1: 提醒用户开启 Pages**

提示用户完成：仓库 `canvascat/openapi` → Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。等用户确认后再推送（先推送后开开关会导致首次 deploy job 失败，虽可 re-run 但没必要）。

- [ ] **Step 2: 推送 main**

```bash
git push origin main
```

- [ ] **Step 3: 观察 Actions**

用户或控制器打开 `https://github.com/canvascat/openapi/actions` 确认 Deploy to GitHub Pages 工作流绿灯（build 含 check/test 门禁）。首次运行 Vite Task 缓存 restore 会 miss、save 会新建条目，属预期。

- [ ] **Step 4: 线上冒烟**

访问 `https://canvascat.github.io/openapi/`：

1. 自动跳转登录页，样式与静态资源正常；
2. 深链 `https://canvascat.github.io/openapi/repos` 直接访问 → 404.html 回退生效，重定向到登录页而非 GitHub 404；
3. （可选，用户有 PAT 时）完成一次登录 → 仓库列表。

- [ ] **Step 5: 观察第二次 push 的缓存命中（非阻塞）**

下次任意 push 后在 Actions 日志中确认 `Cache restored from key: vite-task-...` 且 `vp run` 打印 cache hit。若 GitHub 恢复了缓存但任务仍 miss，按 spec 第 9 节先查任务指纹，记录为后续事项，不阻塞本期收尾。
