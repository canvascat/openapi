# 版本时间轴实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 编辑页提供当前文件的提交历史抽屉：双基准 diff 查看 + 一键载入历史版本走现有保存流回滚。

**Architecture:** 数据层在 `lib/github.ts` 加纯映射 `mapCommit` 与透传 `listFileCommits`；历史版本内容复用现有 `fileQuery`（ref 传 commit SHA）；`features/history/` 三个组件（列表项、DiffEditor 封装、Sheet 抽屉编排）；编辑页只加一个按钮、一个开关状态和一个 onRestore 回调。

**Tech Stack:** TanStack Query useInfiniteQuery、@monaco-editor/react DiffEditor、shadcn sheet/toggle-group/scroll-area。

**Spec:** `docs/superpowers/specs/2026-07-04-version-timeline-design.md`

## Global Constraints

- 包管理与脚本一律走 `vp`；shadcn 经 `vp exec shadcn add`。
- tsconfig 开启 `verbatimModuleSyntax`（仅类型导入必须 `import type`）、`erasableSyntaxOnly`、`noUnusedLocals/Parameters`。
- 组件测试文件顶部加 `// @vitest-environment jsdom`；纯函数测试用默认 node 环境；pre-commit 会把 `from "vitest"` 自动改写为 `from "vite-plus/test"`，属正常。
- 所有面向用户的文案用中文。
- `src/routeTree.gen.ts` 勿手改。
- 无新 npm 依赖（DiffEditor 来自已装的 `@monaco-editor/react`）。

---

### Task 1: 提交历史数据层（lib/github.ts）

**Files:**

- Modify: `src/lib/github.ts`（文件末尾追加）
- Test: `src/lib/github.test.ts`（文件末尾追加）

**Interfaces:**

- Produces:
  - `interface CommitSummary { sha: string; shortSha: string; message: string; authorName: string; authorDate: string | null; parentSha: string | null }`
  - `mapCommit(raw): CommitSummary`（纯函数）
  - `COMMITS_PAGE_SIZE = 20`
  - `listFileCommits(octokit: Octokit, owner: string, repo: string, path: string, ref: string, page: number): Promise<CommitSummary[]>`

- [ ] **Step 1: 在 `src/lib/github.test.ts` 末尾追加失败测试**

```ts
describe("mapCommit", () => {
  it("完整字段映射（shortSha 取前 7 位、parent 取第一个）", () => {
    expect(
      mapCommit({
        sha: "abcdef1234567890",
        commit: {
          message: "feat: 新增宠物接口\n\n详细说明",
          author: { name: "张三", date: "2026-07-01T08:00:00Z" },
        },
        parents: [{ sha: "p1" }, { sha: "p2" }],
      }),
    ).toEqual({
      sha: "abcdef1234567890",
      shortSha: "abcdef1",
      message: "feat: 新增宠物接口\n\n详细说明",
      authorName: "张三",
      authorDate: "2026-07-01T08:00:00Z",
      parentSha: "p1",
    });
  });

  it("缺 author 时兜底", () => {
    const r = mapCommit({ sha: "1234567890", commit: { message: "m", author: null }, parents: [] });
    expect(r.authorName).toBe("未知作者");
    expect(r.authorDate).toBeNull();
  });

  it("无 parent（首提交）→ parentSha 为 null", () => {
    const r = mapCommit({
      sha: "1234567890",
      commit: { message: "init", author: { name: "a", date: "2026-01-01T00:00:00Z" } },
      parents: [],
    });
    expect(r.parentSha).toBeNull();
  });
});
```

同时把文件顶部的导入改为包含 `mapCommit`：

```ts
import { classifyGithubError, decodeBase64, encodeBase64, mapCommit } from "./github";
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/lib/github.test.ts`
预期：FAIL（mapCommit 未导出）。

- [ ] **Step 3: 在 `src/lib/github.ts` 末尾追加实现**

```ts
export interface CommitSummary {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorDate: string | null;
  parentSha: string | null;
}

interface RawCommit {
  sha: string;
  commit: {
    message: string;
    author?: { name?: string | null; date?: string | null } | null;
  };
  parents: readonly { sha: string }[];
}

export function mapCommit(raw: RawCommit): CommitSummary {
  return {
    sha: raw.sha,
    shortSha: raw.sha.slice(0, 7),
    message: raw.commit.message,
    authorName: raw.commit.author?.name ?? "未知作者",
    authorDate: raw.commit.author?.date ?? null,
    parentSha: raw.parents[0]?.sha ?? null,
  };
}

export const COMMITS_PAGE_SIZE = 20;

export async function listFileCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  page: number,
): Promise<CommitSummary[]> {
  const { data } = await octokit.repos.listCommits({
    owner,
    repo,
    path,
    sha: ref,
    per_page: COMMITS_PAGE_SIZE,
    page,
  });
  return data.map((c) => mapCommit(c));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/lib/github.test.ts`
预期：PASS（原 9 个 + 新 3 个 = 12 个用例）。

- [ ] **Step 5: 全量检查后提交**

Run: `vp check && vp test`
预期：全绿。

```bash
git add src/lib/github.ts src/lib/github.test.ts
git commit -m "feat: 提交历史数据层——mapCommit 与 listFileCommits"
```

---

### Task 2: 历史抽屉 UI（features/history/）

**Files:**

- Create: `src/features/history/queries.ts`
- Create: `src/features/history/commit-item.tsx`
- Test: `src/features/history/commit-item.test.tsx`
- Create: `src/features/history/commit-diff.tsx`
- Create: `src/features/history/history-sheet.tsx`

**Interfaces:**

- Consumes: `CommitSummary/COMMITS_PAGE_SIZE/listFileCommits`（Task 1）、`fileQuery(owner, repo, path, ref)`（features/explorer/queries，ref 可传 commit SHA）、`getOctokit`（features/auth/session）。
- Produces: `<HistorySheet open onOpenChange owner repo path gitRef currentText onRestore={(text: string, shortSha: string) => void} />`（Task 3 编辑页使用；分支/引用参数命名为 `gitRef`——不能叫 `ref`，会与 React 内置 ref prop 冲突）。

- [ ] **Step 1: 拉取 shadcn 组件**

```bash
vp exec shadcn add sheet toggle-group scroll-area --overwrite
```

预期：`src/components/ui/` 生成 sheet.tsx、toggle-group.tsx、scroll-area.tsx（`--overwrite` 避免共享依赖文件的交互式覆盖提示卡住）。

- [ ] **Step 2: 创建 `src/features/history/queries.ts`**

```ts
import { infiniteQueryOptions } from "@tanstack/react-query";
import { getOctokit } from "@/features/auth/session";
import { COMMITS_PAGE_SIZE, listFileCommits } from "@/lib/github";

export const commitsInfiniteQuery = (owner: string, repo: string, path: string, ref: string) =>
  infiniteQueryOptions({
    queryKey: ["commits", owner, repo, path, ref],
    queryFn: ({ pageParam }) => listFileCommits(getOctokit(), owner, repo, path, ref, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === COMMITS_PAGE_SIZE ? lastPageParam + 1 : undefined,
  });
```

- [ ] **Step 3: 写失败测试 `src/features/history/commit-item.test.tsx`**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommitItem } from "./commit-item";

const commit = {
  sha: "abcdef1234567890",
  shortSha: "abcdef1",
  message: "feat: 新增宠物接口\n\n详细说明不应展示",
  authorName: "张三",
  authorDate: "2026-07-01T08:00:00Z",
  parentSha: "p1",
};

describe("CommitItem", () => {
  it("只展示 message 首行、作者与短 SHA", () => {
    render(<CommitItem commit={commit} onSelect={() => {}} />);
    expect(screen.getByText("feat: 新增宠物接口")).toBeTruthy();
    expect(screen.queryByText(/详细说明不应展示/)).toBeNull();
    expect(screen.getByText("张三")).toBeTruthy();
    expect(screen.getByText("abcdef1")).toBeTruthy();
  });

  it("点击回传该 commit", () => {
    const onSelect = vi.fn();
    render(<CommitItem commit={commit} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(commit);
  });
});
```

- [ ] **Step 4: 运行确认失败**

Run: `vp test src/features/history/commit-item.test.tsx`
预期：FAIL（模块不存在）。

- [ ] **Step 5: 实现 `src/features/history/commit-item.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import type { CommitSummary } from "@/lib/github";

export function CommitItem({
  commit,
  onSelect,
}: {
  commit: CommitSummary;
  onSelect: (commit: CommitSummary) => void;
}) {
  const title = commit.message.split("\n")[0];
  return (
    <button
      type="button"
      className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left hover:bg-accent"
      onClick={() => onSelect(commit)}
    >
      <span className="truncate text-sm font-medium">{title}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{commit.authorName}</span>
        <span>{commit.authorDate ? new Date(commit.authorDate).toLocaleString() : "未知时间"}</span>
        <Badge variant="secondary" className="font-mono">
          {commit.shortSha}
        </Badge>
      </span>
    </button>
  );
}
```

- [ ] **Step 6: 运行确认通过**

Run: `vp test src/features/history/commit-item.test.tsx`
预期：PASS（2 个用例）。

- [ ] **Step 7: 实现 `src/features/history/commit-diff.tsx`**

```tsx
import { DiffEditor } from "@monaco-editor/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fileQuery } from "@/features/explorer/queries";
import type { CommitSummary } from "@/lib/github";

export type DiffBaseline = "parent" | "current";

export function CommitDiff({
  owner,
  repo,
  path,
  commit,
  currentText,
  baseline,
  onRestore,
}: {
  owner: string;
  repo: string;
  path: string;
  commit: CommitSummary;
  currentText: string;
  baseline: DiffBaseline;
  onRestore: (text: string) => void;
}) {
  const version = useQuery(fileQuery(owner, repo, path, commit.sha));
  const needParent = baseline === "parent" && commit.parentSha !== null;
  const parent = useQuery({
    ...fileQuery(owner, repo, path, commit.parentSha ?? ""),
    enabled: needParent,
  });

  if (version.isError) {
    return (
      <p className="p-4 text-sm text-destructive">加载版本内容失败：{version.error.message}</p>
    );
  }
  if (needParent && parent.isError) {
    return <p className="p-4 text-sm text-destructive">加载对比基准失败：{parent.error.message}</p>;
  }
  if (version.isPending || (needParent && parent.isPending)) {
    return <p className="p-4 text-sm text-muted-foreground">加载版本内容...</p>;
  }

  const original =
    baseline === "parent"
      ? commit.parentSha === null
        ? ""
        : parent.data!.text
      : version.data.text;
  const modified = baseline === "parent" ? version.data.text : currentText;
  const language = path.endsWith(".json") ? "json" : "yaml";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
        <DiffEditor
          height="100%"
          language={language}
          original={original}
          modified={modified}
          options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false } }}
        />
      </div>
      <Button className="shrink-0 self-end" onClick={() => onRestore(version.data.text)}>
        载入此版本到编辑器
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: 实现 `src/features/history/history-sheet.tsx`**

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CommitSummary } from "@/lib/github";
import { CommitDiff, type DiffBaseline } from "./commit-diff";
import { CommitItem } from "./commit-item";
import { commitsInfiniteQuery } from "./queries";

export function HistorySheet({
  open,
  onOpenChange,
  owner,
  repo,
  path,
  gitRef,
  currentText,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: string;
  repo: string;
  path: string;
  gitRef: string;
  currentText: string;
  onRestore: (text: string, shortSha: string) => void;
}) {
  const [selected, setSelected] = useState<CommitSummary | null>(null);
  const [baseline, setBaseline] = useState<DiffBaseline>("parent");
  const commits = useInfiniteQuery({
    ...commitsInfiniteQuery(owner, repo, path, gitRef),
    enabled: open,
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelected(null);
        }
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-4 p-4 sm:max-w-3xl">
        <SheetHeader className="p-0">
          <SheetTitle>
            {selected ? `${selected.shortSha} · ${selected.message.split("\n")[0]}` : "提交历史"}
          </SheetTitle>
          <SheetDescription className="truncate font-mono">
            {path} @ {gitRef}
          </SheetDescription>
        </SheetHeader>

        {selected === null ? (
          <ScrollArea className="min-h-0 flex-1">
            {commits.isPending && <p className="text-sm text-muted-foreground">加载提交历史...</p>}
            {commits.isError && (
              <div className="text-sm text-destructive">
                <p>加载失败：{commits.error.message}</p>
                <Button variant="outline" className="mt-2" onClick={() => void commits.refetch()}>
                  重试
                </Button>
              </div>
            )}
            {commits.isSuccess && (
              <>
                {commits.data.pages.flat().length === 0 && (
                  <p className="text-sm text-muted-foreground">该文件在当前分支暂无提交记录。</p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {commits.data.pages.flat().map((c) => (
                    <li key={c.sha}>
                      <CommitItem commit={c} onSelect={setSelected} />
                    </li>
                  ))}
                </ul>
                {commits.hasNextPage && (
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={commits.isFetchingNextPage}
                    onClick={() => void commits.fetchNextPage()}
                  >
                    {commits.isFetchingNextPage ? "加载中..." : "加载更多"}
                  </Button>
                )}
              </>
            )}
          </ScrollArea>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                ← 返回列表
              </Button>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={baseline}
                onValueChange={(value) => {
                  if (value) {
                    setBaseline(value as DiffBaseline);
                  }
                }}
              >
                <ToggleGroupItem value="parent">此次变更</ToggleGroupItem>
                <ToggleGroupItem value="current">对比当前</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="min-h-0 flex-1">
              <CommitDiff
                owner={owner}
                repo={repo}
                path={path}
                commit={selected}
                currentText={currentText}
                baseline={baseline}
                onRestore={(text) => onRestore(text, selected.shortSha)}
              />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 9: 全量检查与测试**

Run: `vp check && vp test`
预期：全绿（HistorySheet 尚未被引用，若 lint 报未使用导出属误报则忽略；oxlint 默认不报未使用导出）。

- [ ] **Step 10: 提交**

```bash
git add src/features/history src/components/ui
git commit -m "feat: 历史时间轴抽屉——提交列表与双基准 diff"
```

---

### Task 3: 编辑页接入与本地验证

**Files:**

- Modify: `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`

**Interfaces:**

- Consumes: `<HistorySheet />`（Task 2，props 见 Task 2 Interfaces）。

- [ ] **Step 1: 编辑页加历史按钮与抽屉**

新增 imports（加到现有 import 区）：

```tsx
import { History } from "lucide-react";
import { HistorySheet } from "@/features/history/history-sheet";
```

`EditPage` 组件内，`const [saveOpen, setSaveOpen] = useState(false);` 之后加：

```tsx
const [historyOpen, setHistoryOpen] = useState(false);
```

header 中保存按钮（`<Button disabled={!dirty} onClick={() => setSaveOpen(true)}>保存</Button>`）之前加历史按钮，包一层容器：

```tsx
<div className="flex shrink-0 items-center gap-2">
  <Button variant="outline" onClick={() => setHistoryOpen(true)}>
    <History className="size-4" />
    历史
  </Button>
  <Button disabled={!dirty} onClick={() => setSaveOpen(true)}>
    保存
  </Button>
</div>
```

组件 JSX 末尾（`<SaveDialog ... />` 之后、最外层 `</div>` 之前）加：

```tsx
<HistorySheet
  open={historyOpen}
  onOpenChange={setHistoryOpen}
  owner={owner}
  repo={repo}
  path={filePath}
  gitRef={ref}
  currentText={text}
  onRestore={(restoredText, shortSha) => {
    setText(restoredText);
    setHistoryOpen(false);
    toast.info(`已载入 ${shortSha} 版本，保存提交后完成回滚`);
  }}
/>
```

（组件 prop 名用 `gitRef` 而非 `ref`——后者是 React 内置 prop，不能承载字符串。）

- [ ] **Step 2: 全量检查与测试**

Run: `vp check && vp test`
预期：全绿（37 个用例：原 35 + Task 1 的 3 - 已有 github.test 归并计数以实际输出为准）。

- [ ] **Step 3: 本地手验（无真实 PAT，编译级）**

`vp dev` 后台启动：确认编辑页路由编译无错、无 token 时守卫重定向正常；验证完停掉 dev server、确认端口无残留监听。真实交互（列表加载、diff、回滚、加载更多）由用户线上验证。

- [ ] **Step 4: 提交**

```bash
git add "src/routes/_authed.repos.\$owner.\$repo.edit.\$.tsx"
git commit -m "feat: 编辑页接入版本时间轴"
```

---

### Task 4: 合并上线与观察（控制器执行）

**Files:** 无代码改动。

- [ ] **Step 1: 全分支终审后合并 main 并推送**

```bash
git checkout main && git merge <feature-branch> && git push origin main
```

- [ ] **Step 2: 观察 Actions**

确认 Deploy to GitHub Pages 工作流绿灯；同时观察上期遗留项——本次运行的 `vp run` 步骤是否打印 Vite Task 缓存命中（`cache hit, replaying`）。

- [ ] **Step 3: 线上冒烟（用户配合）**

访问线上编辑页 → 打开「历史」抽屉 → 列表加载 → 点开 diff 双基准切换 → 载入历史版本 → 保存提交完成回滚。
