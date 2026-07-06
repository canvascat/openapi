# 编辑页切换重挂载修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复编辑页在切换文件（`$_splat`）或分支（`?ref=`）时组件复用导致整页显示旧文档的缺陷。

**Architecture:** 路由 `component` 换成薄 wrapper `EditPageWrapper`，按 `owner/repo/filePath@ref` 生成 key 渲染 `<EditPage key=...>`——参数变化即强制重挂载，全部本地状态与 Monaco marker 自然归零。`EditPage` 本体零改动。

**Tech Stack:** React key 重挂载，TanStack Router `Route.useParams/useSearch`。

**Spec:** `docs/superpowers/specs/2026-07-04-edit-page-remount-fix-design.md`

## Global Constraints

- 工具链一律走 `vp`（`vp check` / `vp test` / `vp dev`）。
- `src/routeTree.gen.ts` 勿手改。
- 只修显示 bug，不加「未保存改动离开拦截」。

---

### Task 1: EditPageWrapper 重挂载修复

**Files:**

- Modify: `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`

**Interfaces:**

- Produces: 路由 `component` 变为 `EditPageWrapper`；`EditPage` 增加 `key` prop 消费（由 React 处理，函数签名不变）。

- [ ] **Step 1: 路由 component 换成 wrapper**

在 `export const Route = createFileRoute(...)({ ... })` 中，把：

```tsx
  component: EditPage,
```

改为：

```tsx
  component: EditPageWrapper,
```

并在 `Route` 定义之后、`function EditPage() {` 之前插入：

```tsx
function EditPageWrapper() {
  const { owner, repo, _splat: filePath = "" } = Route.useParams();
  const { ref } = Route.useSearch();
  return <EditPage key={`${owner}/${repo}/${filePath}@${ref}`} />;
}
```

`EditPage` 函数本体一行不改。

- [ ] **Step 2: 检查与测试**

Run: `vp check && vp test`
预期：0 errors；52/52 通过（本修复不新增单测，路由级重挂载行为在 jsdom 中无法低成本仿真，spec 第 5 节已明确）。

- [ ] **Step 3: 本地编译验证**

`vp dev` 后台启动：编辑页路由编译无错、无 token 守卫重定向正常。验证完停掉 dev server、确认端口无残留（用工具 run_in_background，勿用 shell &）。真实切换场景（详情页换文件、编辑页切 `?ref=`、内容跟随刷新）由用户线上验证。

- [ ] **Step 4: 提交**

```bash
git add "src/routes/_authed.repos.\$owner.\$repo.edit.\$.tsx"
git commit -m "fix: 编辑页按 owner/repo/path@ref 强制重挂载，修复切换后显示旧文档"
```

---

### Task 2: 合并上线（控制器执行）

**Files:** 无代码改动。

- [ ] **Step 1: 评审通过后合并 main 并推送**

```bash
git checkout main && git merge <feature-branch> && git push origin main
```

- [ ] **Step 2: 观察 Actions 绿灯与线上生效**

确认 Deploy to GitHub Pages 工作流成功、主页 200 且 bundle hash 更新。

- [ ] **Step 3: 线上验证（用户配合）**

登录后：详情页打开文件 A → 返回 → 打开文件 B，确认编辑器显示 B 内容；编辑页手改 `?ref=` 切分支，确认内容与历史抽屉跟随刷新。
