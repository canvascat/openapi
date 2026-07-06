# 编辑页切换文件/分支显示旧文档修复 — 设计文档

> 日期：2026-07-04 | 状态：已确认 | 来源：Spectral 分支终审发现的 MVP 遗留缺陷（backlog #1，优先级最高）

## 1. 问题

`src/routes/_authed.repos.$owner.$repo.edit.$.tsx` 的 `EditPage` 用
`useState(file.text)` 等惰性初值持有 `text/sha/savedText`。TanStack Router 在同一路由的
params（`$_splat` 文件路径）或 search（`?ref=` 分支）变化时**复用组件实例**，
`useSuspenseQuery` 拿到新 `file` 但三个 state 保留旧值——整页显示旧文档内容；
基于旧文提交必然 409。

## 2. 已确认的决策

| 决策点 | 结论                                                                     |
| :----- | :----------------------------------------------------------------------- |
| 修法   | key 强制重挂载（方案 A），不用逐状态 effect 同步（方案 B，易漏且脆弱）   |
| 范围   | 只修显示 bug；「未保存改动离开拦截」不在本轮（现状本就无拦截，另开一轮） |

## 3. 改动（唯一文件）

`src/routes/_authed.repos.$owner.$repo.edit.$.tsx`：路由 `component` 从 `EditPage`
换成薄 wrapper，按 params/search 生成 key：

```tsx
component: (EditPageWrapper,
  function EditPageWrapper() {
    const { owner, repo, _splat: filePath = "" } = Route.useParams();
    const { ref } = Route.useSearch();
    return <EditPage key={`${owner}/${repo}/${filePath}@${ref}`} />;
  });
```

`EditPage` 本体一行不改（内部照常读 params/search）。key 变化 → React 卸载旧实例
挂载新实例 → `text/sha/savedText/saveOpen/historyOpen/editorRef/monacoRef` 全部归零，
Monaco marker 随组件销毁清除；配合 `fileQuery` 现有 `gcTime: 0`，重挂载必然拉取新内容。

## 4. 代价与边界

- 切换时 Monaco 重新实例化（数百毫秒），换正确性，可接受。
- 同 key 重渲染（无参数变化）行为不变。
- 历史抽屉开着切分支：随重挂载关闭归零（此前会残留旧文件的列表，顺带修复）。

## 5. 测试与验证

- `vp check && vp test` 全绿（现有 52 用例回归；本修复为装配层改动，不新增单测——
  路由级重挂载行为无法在 jsdom 中低成本仿真，性价比不划算）。
- `vp dev` 编译级验证（无真实 PAT）。
- 真实切换场景由用户线上验证：详情页换文件进入编辑页、编辑页内切 `?ref=`、
  编辑后切换回来内容为新文档。

## 6. 上线

单 commit 合并 main 推送，既有 Actions 自动部署。
