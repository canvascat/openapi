# 版本时间轴 — 设计文档（二期·子项目 2）

> 日期：2026-07-04 | 状态：已确认 | 前置：MVP 与部署上线已完成（线上 https://canvascat.github.io/openapi/）

## 1. 目标

在编辑页提供当前文件的提交历史时间轴：查看任意历史节点的 diff（双基准可切换）、
一键把历史版本载入编辑器（走现有保存流完成回滚）。

## 2. 已确认的决策

| 决策点    | 结论                                                                                               |
| :-------- | :------------------------------------------------------------------------------------------------- |
| 入口      | 编辑页 header「历史」按钮 → 右侧 Sheet 抽屉（`sm:max-w-3xl`）                                      |
| 交互结构  | 抽屉内两级视图：提交列表 ⇄ diff 视图（带返回），不引入 Dialog/独立页                               |
| Diff 基准 | 双基准 ToggleGroup 切换：「此次变更」（parent vs 该版本）/「对比当前」（该版本 vs 编辑器当前文本） |
| 回滚语义  | 「载入此版本到编辑器」：内容 setText 进左栏（dirty 置真），用户经现有保存流提交，复用 409 处理     |
| 分页      | useInfiniteQuery，每页 20，「加载更多」按钮                                                        |
| 范围外    | 跨文件/仓库级历史、直接创建回滚 commit、diff 行级评论                                              |

## 3. 数据层

1. **`src/lib/github.ts`** 新增：

```ts
export interface CommitSummary {
  sha: string;
  shortSha: string; // sha.slice(0, 7)
  message: string; // 完整 message（UI 只展示首行）
  authorName: string; // commit.author?.name ?? "未知作者"
  authorDate: string | null; // commit.author?.date ?? null（ISO 字符串）
  parentSha: string | null; // parents[0]?.sha ?? null（首提交为 null）
}

export function mapCommit(raw): CommitSummary; // 纯映射函数，可单测
export async function listFileCommits(
  octokit,
  owner,
  repo,
  path,
  ref,
  page,
): Promise<CommitSummary[]>; // repos.listCommits({ owner, repo, path, sha: ref, per_page: 20, page })
```

2. **历史版本内容零新增**：现有 `fileQuery(owner, repo, path, ref)` 的 `ref` 直接传
   commit SHA，缓存键 `["file", owner, repo, path, sha]` 天然区分版本。
3. **`src/features/history/queries.ts`**：`commitsInfiniteQuery(owner, repo, path, ref)`
   （`infiniteQueryOptions`，`getNextPageParam`: 返回满 20 条则下一页码，否则 undefined）。

## 4. UI 组件（features/history/）

- **`history-sheet.tsx`**：Sheet 抽屉主组件。props：`open/onOpenChange`、
  `owner/repo/path/ref`、`currentText`（编辑器当前文本）、`onRestore(text: string, shortSha: string)`。
  内部状态：`selected: CommitSummary | null`（null=列表视图，非 null=diff 视图）。
  列表项：message 首行、作者、本地化日期、shortSha 徽标；底部「加载更多」。
- **`commit-diff.tsx`**：props：`owner/repo/path`、`commit: CommitSummary`、
  `currentText`、`baseline: "parent" | "current"`。用 `@monaco-editor/react` 的
  `DiffEditor`（readOnly、renderSideBySide）。
  - 「此次变更」：original = parent 版本内容（`parentSha` 为 null 时为空串），
    modified = 该版本内容；
  - 「对比当前」：original = 该版本内容，modified = `currentText`。
  - 内容经 `useQuery(fileQuery(owner, repo, path, sha))` 拉取，loading/error 态就地展示。
- 回滚按钮位于 diff 视图底部：「载入此版本到编辑器」→ `onRestore(该版本文本, shortSha)`。

## 5. 编辑页接入（唯一改动点）

`src/routes/_authed.repos.$owner.$repo.edit.$.tsx`：

- header 保存按钮旁加「历史」按钮（lucide `History` 图标，variant="outline"）；
- 新增状态 `historyOpen`；
- `onRestore` 回调：`setText(text)` + `toast.info(\`已载入 ${shortSha} 版本，保存提交后完成回滚\`)`+ 关抽屉。
dirty 由现有`text !== savedText` 自然置真，保存走现有 SaveDialog/mutation/409 链路。

## 6. 错误与边界

- 提交列表加载失败：抽屉内错误文案 + 重试按钮。
- 历史版本 >1MB：`getFileContent` 现有报错（「文件超过 1MB…」）在 diff 区就地展示。
- 首提交「此次变更」：左侧为空文档（新增文件语义）。
- 切换分支（`?ref=` 变化）：`commitsInfiniteQuery` key 含 ref，自动重取。
- 载入历史版本后未保存即再次打开抽屉：「对比当前」基准用的是编辑器实时 `currentText`，行为自洽。

## 7. 新增依赖与组件

- 无新 npm 依赖（DiffEditor 来自已装的 `@monaco-editor/react`）。
- shadcn 组件：`sheet`、`toggle-group`、`scroll-area`（经 `vp exec shadcn add`）。

## 8. 测试策略

- `mapCommit` 单测（Vitest，node 环境）：完整字段映射、缺 author/date 兜底、无 parent → null。
- 列表项渲染测试（jsdom）：message 首行截取、shortSha 展示。
- DiffEditor、抽屉交互、回滚链路：`vp dev` 手动验证（无真实 PAT 时验证编译与组件装配，真实交互由用户线上验证）。

## 9. 上线

合并 main 推送后由既有 GitHub Actions 工作流自动部署；顺带观察 Vite Task
跨 run 缓存首次命中情况（上期遗留观察项）。
