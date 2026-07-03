# OpenAPI 文档管理系统 MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 纯前端 OpenAPI 文档管理系统 MVP——PAT 登录 GitHub，浏览仓库/分支/OpenAPI 文件树，Monaco + swagger-ui 双栏编辑并提交回仓库。

**Architecture:** SPA，TanStack Router 文件式路由承载 `owner/repo/path/ref` 上下文，TanStack Query 管理全部 GitHub API 状态，Octokit 直连 GitHub REST API，无任何后端。`lib/` 为无 React 依赖的纯函数层，`features/` 为业务组件层，`routes/` 只做装配与守卫。

**Tech Stack:** React 19、TanStack Router/Query、@octokit/rest、@monaco-editor/react、swagger-ui-react、js-yaml、shadcn/ui（blocks：login-01、sidebar-07）、Vite+（vp）工具链。

**Spec:** `docs/superpowers/specs/2026-07-03-openapi-doc-manager-design.md`

## Global Constraints

- 包管理与脚本一律走 `vp`：`vp add` / `vp add -D` / `vp exec` / `vp check` / `vp test` / `vp dev`。
- tsconfig 开启 `verbatimModuleSyntax`（仅类型导入必须写 `import type`）、`erasableSyntaxOnly`（禁止 enum/namespace，用联合类型）、`noUnusedLocals/Parameters`。
- 路径别名 `@/` → `src/`。
- 每次提交前 pre-commit 自动跑 `vp check --fix`；若报 `src/routeTree.gen.ts`（插件生成文件）的 lint/fmt 错误，勿手改该文件，在 `vite.config.ts` 的 lint/fmt 配置中忽略它。
- 测试用 Vitest（`vp test`）；组件测试文件顶部加 `// @vitest-environment jsdom`，纯函数测试用默认 node 环境。
- localStorage token key 固定为 `openapi.github.pat`。
- 所有面向用户的文案用中文。
- `swagger-ui-react` 对 React 19 会有 peer dependency 警告，属已知情况，忽略即可。

---

### Task 1: 依赖安装与路由骨架

**Files:**

- Modify: `package.json`（经 vp add）
- Modify: `vite.config.ts`
- Modify: `src/main.tsx`
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Delete: `src/App.tsx`

**Interfaces:**

- Produces: 可运行的 TanStack Router 应用骨架；`src/routeTree.gen.ts` 由插件自动生成；后续任务在 `src/routes/` 下加文件即注册路由。根路由 context 类型为 `{ queryClient: QueryClient }`。

- [ ] **Step 1: 安装依赖**

```bash
vp add @tanstack/react-router @tanstack/react-query @octokit/rest @monaco-editor/react swagger-ui-react js-yaml
vp add -D @tanstack/router-plugin @types/swagger-ui-react @types/js-yaml jsdom @testing-library/react
```

预期：安装成功；swagger-ui-react 的 React 19 peer 警告忽略。

- [ ] **Step 2: vite.config.ts 加入路由插件（必须在 react() 之前）**

```ts
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
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

- [ ] **Step 3: 创建根路由 `src/routes/__root.tsx`**

```tsx
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
});
```

- [ ] **Step 4: 创建首页占位路由 `src/routes/index.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="flex min-h-svh items-center justify-center">
      <h1 className="text-2xl font-semibold">OpenAPI 文档管理</h1>
    </div>
  ),
});
```

- [ ] **Step 5: 重写 `src/main.tsx` 并删除 `src/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./style.css";

const queryClient = new QueryClient();

const router = createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

删除 `src/App.tsx`。

- [ ] **Step 6: 启动验证**

Run: `vp dev`（首次启动会生成 `src/routeTree.gen.ts`）
预期：浏览器访问 `/` 显示「OpenAPI 文档管理」。停掉 dev server。

- [ ] **Step 7: 检查通过后提交**

Run: `vp check`
预期：format/lint/type 全绿（routeTree.gen.ts 若报错，按 Global Constraints 处理）。

```bash
git add -A
git commit -m "feat: 接入 TanStack Router/Query 与项目依赖"
```

---

### Task 2: 会话与 Token 存储（features/auth/session.ts）

**Files:**

- Create: `src/features/auth/session.ts`
- Test: `src/features/auth/session.test.ts`

**Interfaces:**

- Produces:
  - `getToken(): string | null`
  - `setToken(token: string): void`
  - `clearToken(): void`
  - `getOctokit(): Octokit`（无 token 时抛错；同一 token 返回同一实例）

- [ ] **Step 1: 写失败测试 `src/features/auth/session.test.ts`**

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearToken, getOctokit, getToken, setToken } from "./session";

describe("session", () => {
  beforeEach(() => {
    localStorage.clear();
    clearToken();
  });

  it("默认无 token", () => {
    expect(getToken()).toBeNull();
  });

  it("setToken 后可读取，clearToken 后清空", () => {
    setToken("ghp_test");
    expect(getToken()).toBe("ghp_test");
    expect(localStorage.getItem("openapi.github.pat")).toBe("ghp_test");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("无 token 时 getOctokit 抛错", () => {
    expect(() => getOctokit()).toThrow();
  });

  it("有 token 时 getOctokit 返回同一实例，换 token 后返回新实例", () => {
    setToken("ghp_a");
    const first = getOctokit();
    expect(getOctokit()).toBe(first);
    setToken("ghp_b");
    expect(getOctokit()).not.toBe(first);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/features/auth/session.test.ts`
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/features/auth/session.ts`**

```ts
import { Octokit } from "@octokit/rest";

const TOKEN_KEY = "openapi.github.pat";

let cached: { token: string; octokit: Octokit } | null = null;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  cached = null;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  cached = null;
}

export function getOctokit(): Octokit {
  const token = getToken();
  if (!token) {
    throw new Error("未登录：缺少 GitHub PAT");
  }
  if (cached?.token !== token) {
    cached = { token, octokit: new Octokit({ auth: token }) };
  }
  return cached.octokit;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/features/auth/session.test.ts`
预期：PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/features/auth
git commit -m "feat: PAT 会话存储与 Octokit 单例"
```

---

### Task 3: OpenAPI 解析与识别（lib/openapi.ts）

**Files:**

- Create: `src/lib/openapi.ts`
- Test: `src/lib/openapi.test.ts`

**Interfaces:**

- Produces:
  - `isOpenApiCandidate(path: string): boolean`（扩展名过滤 .json/.yaml/.yml，大小写不敏感）
  - `type ParseResult = { ok: true; doc: Record<string, unknown> } | { ok: false; error: string }`
  - `parseDocument(source: string): ParseResult`（YAML 是 JSON 超集，统一用 js-yaml 解析）
  - `hasOpenApiRoot(doc: Record<string, unknown>): boolean`（含 `openapi` 或 `swagger` 顶级字段）

- [ ] **Step 1: 写失败测试 `src/lib/openapi.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { hasOpenApiRoot, isOpenApiCandidate, parseDocument } from "./openapi";

describe("isOpenApiCandidate", () => {
  it.each(["api.json", "docs/v1/api.yaml", "a.yml", "A.YAML"])("%s → true", (p) => {
    expect(isOpenApiCandidate(p)).toBe(true);
  });
  it.each(["readme.md", "openapi.txt", "yaml", "api.json.bak"])("%s → false", (p) => {
    expect(isOpenApiCandidate(p)).toBe(false);
  });
});

describe("parseDocument", () => {
  it("解析 YAML 对象", () => {
    const r = parseDocument("openapi: 3.1.0\ninfo:\n  title: demo");
    expect(r).toEqual({ ok: true, doc: { openapi: "3.1.0", info: { title: "demo" } } });
  });
  it("解析 JSON 对象", () => {
    const r = parseDocument('{"swagger": "2.0"}');
    expect(r).toEqual({ ok: true, doc: { swagger: "2.0" } });
  });
  it("语法错误返回 error", () => {
    const r = parseDocument("a: [1, 2");
    expect(r.ok).toBe(false);
  });
  it("根节点非对象返回 error", () => {
    expect(parseDocument("42").ok).toBe(false);
    expect(parseDocument("- 1\n- 2").ok).toBe(false);
  });
});

describe("hasOpenApiRoot", () => {
  it("openapi / swagger 字段 → true", () => {
    expect(hasOpenApiRoot({ openapi: "3.0.0" })).toBe(true);
    expect(hasOpenApiRoot({ swagger: "2.0" })).toBe(true);
  });
  it("其他对象 → false", () => {
    expect(hasOpenApiRoot({ name: "package.json" })).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/lib/openapi.test.ts`
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/lib/openapi.ts`**

```ts
import { load } from "js-yaml";

export function isOpenApiCandidate(path: string): boolean {
  return /\.(json|ya?ml)$/i.test(path);
}

export type ParseResult = { ok: true; doc: Record<string, unknown> } | { ok: false; error: string };

export function parseDocument(source: string): ParseResult {
  try {
    const doc = load(source);
    if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
      return { ok: false, error: "文档根节点必须是对象" };
    }
    return { ok: true, doc: doc as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function hasOpenApiRoot(doc: Record<string, unknown>): boolean {
  return "openapi" in doc || "swagger" in doc;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/lib/openapi.test.ts`
预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/openapi.ts src/lib/openapi.test.ts
git commit -m "feat: OpenAPI 文档解析与文件识别"
```

---

### Task 4: GitHub API 封装（lib/github.ts）

**Files:**

- Create: `src/lib/github.ts`
- Test: `src/lib/github.test.ts`

**Interfaces:**

- Consumes: `isOpenApiCandidate`（Task 3）
- Produces:
  - `decodeBase64(b64: string): string` / `encodeBase64(text: string): string`（UTF-8 安全，decode 容忍 GitHub 返回中的换行）
  - `type GithubErrorKind = "unauthorized" | "rate-limited" | "conflict" | "not-found" | "unknown"`
  - `classifyGithubError(err: unknown): GithubErrorKind`
  - `interface RepoSummary { owner: string; name: string; fullName: string; description: string | null; isPrivate: boolean; defaultBranch: string; updatedAt: string | null }`
  - `listRepos(octokit: Octokit): Promise<RepoSummary[]>`
  - `listBranches(octokit: Octokit, owner: string, repo: string): Promise<string[]>`
  - `interface TreeFile { path: string; sha: string }`
  - `listOpenApiFiles(octokit: Octokit, owner: string, repo: string, ref: string): Promise<TreeFile[]>`
  - `interface FileContent { text: string; sha: string }`
  - `getFileContent(octokit, opts: { owner: string; repo: string; path: string; ref: string }): Promise<FileContent>`（>1MB 抛错）
  - `saveFileContent(octokit, opts: { owner: string; repo: string; path: string; branch: string; content: string; sha: string; message: string }): Promise<string>`（返回新 SHA）

- [ ] **Step 1: 写失败测试 `src/lib/github.test.ts`**（只测纯函数，octokit 透传函数不做 mock 测试）

```ts
import { describe, expect, it } from "vitest";
import { classifyGithubError, decodeBase64, encodeBase64 } from "./github";

describe("base64", () => {
  it("UTF-8 round-trip（含中文）", () => {
    const text = 'openapi: 3.1.0\ninfo:\n  title: 宠物店 API "v1"';
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });
  it("decode 容忍 GitHub 返回内容中的换行符", () => {
    const b64 = encodeBase64("hello world");
    const chunked = `${b64.slice(0, 4)}\n${b64.slice(4)}\n`;
    expect(decodeBase64(chunked)).toBe("hello world");
  });
});

describe("classifyGithubError", () => {
  it.each([
    [401, "unauthorized"],
    [403, "rate-limited"],
    [429, "rate-limited"],
    [404, "not-found"],
    [409, "conflict"],
    [500, "unknown"],
  ])("status %i → %s", (status, kind) => {
    expect(classifyGithubError({ status })).toBe(kind);
  });
  it("非对象输入 → unknown", () => {
    expect(classifyGithubError(null)).toBe("unknown");
    expect(classifyGithubError("boom")).toBe("unknown");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/lib/github.test.ts`
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/lib/github.ts`**

```ts
import type { Octokit } from "@octokit/rest";
import { isOpenApiCandidate } from "./openapi";

export function decodeBase64(b64: string): string {
  const bytes = Uint8Array.from(atob(b64.replaceAll("\n", "")), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

export type GithubErrorKind =
  | "unauthorized"
  | "rate-limited"
  | "conflict"
  | "not-found"
  | "unknown";

export function classifyGithubError(err: unknown): GithubErrorKind {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: unknown }).status
      : undefined;
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
    case 429:
      return "rate-limited";
    case 404:
      return "not-found";
    case 409:
      return "conflict";
    default:
      return "unknown";
  }
}

export interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  defaultBranch: string;
  updatedAt: string | null;
}

export async function listRepos(octokit: Octokit): Promise<RepoSummary[]> {
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "updated",
  });
  return repos.map((r) => ({
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    isPrivate: r.private,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at ?? null,
  }));
}

export async function listBranches(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string[]> {
  const branches = await octokit.paginate(octokit.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
  });
  return branches.map((b) => b.name);
}

export interface TreeFile {
  path: string;
  sha: string;
}

export async function listOpenApiFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<TreeFile[]> {
  const { data: branch } = await octokit.repos.getBranch({ owner, repo, branch: ref });
  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch.commit.sha,
    recursive: "true",
  });
  return data.tree
    .filter((n) => n.type === "blob" && n.path !== undefined && isOpenApiCandidate(n.path))
    .map((n) => ({ path: n.path!, sha: n.sha! }));
}

export interface FileContent {
  text: string;
  sha: string;
}

export async function getFileContent(
  octokit: Octokit,
  opts: { owner: string; repo: string; path: string; ref: string },
): Promise<FileContent> {
  const { data } = await octokit.repos.getContent(opts);
  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`不是文件：${opts.path}`);
  }
  if (data.encoding !== "base64" || data.content === "") {
    throw new Error("文件超过 1MB，暂不支持在线编辑");
  }
  return { text: decodeBase64(data.content), sha: data.sha };
}

export async function saveFileContent(
  octokit: Octokit,
  opts: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    content: string;
    sha: string;
    message: string;
  },
): Promise<string> {
  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner: opts.owner,
    repo: opts.repo,
    path: opts.path,
    branch: opts.branch,
    message: opts.message,
    content: encodeBase64(opts.content),
    sha: opts.sha,
  });
  const newSha = data.content?.sha;
  if (!newSha) {
    throw new Error("GitHub 未返回新文件 SHA");
  }
  return newSha;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/lib/github.test.ts`
预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/github.ts src/lib/github.test.ts
git commit -m "feat: GitHub API 封装与错误分类"
```

---

### Task 5: /auth 登录页与路由守卫

**Files:**

- Create: `src/features/auth/pat-form.tsx`（由 login-01 block 改造）
- Test: `src/features/auth/pat-form.test.tsx`
- Create: `src/routes/auth.tsx`
- Create: `src/routes/_authed.tsx`
- Modify: `src/routes/index.tsx`（占位内容换成重定向）
- Modify: `src/routes/__root.tsx`（挂 Toaster）

**Interfaces:**

- Consumes: `getToken/setToken`（Task 2）
- Produces: `_authed` 布局路由——后续所有需登录页面放在 `src/routes/_authed.*.tsx` 下即自动受守卫保护；`<PatForm />` 组件。

- [ ] **Step 1: 拉取 shadcn 组件与 login block**

```bash
vp exec shadcn add login-01 sonner
```

预期：生成 `src/components/login-form.tsx` 及 `src/components/ui/`（card、input、label、sonner 等）。login-form.tsx 只作参考样式，改造后的表单写入 pat-form.tsx，最后删除 login-form.tsx。

- [ ] **Step 2: 写失败测试 `src/features/auth/pat-form.test.tsx`**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PatForm } from "./pat-form";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

describe("PatForm", () => {
  it("渲染 token 输入框与登录按钮", () => {
    render(<PatForm />);
    expect(screen.getByLabelText("Fine-grained PAT")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
  });

  it("空 token 提交时提示错误且不发请求", () => {
    render(<PatForm />);
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(screen.getByText("请输入 Token")).toBeTruthy();
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `vp test src/features/auth/pat-form.test.tsx`
预期：FAIL（模块不存在）。

- [ ] **Step 4: 实现 `src/features/auth/pat-form.tsx`**

```tsx
import { Octokit } from "@octokit/rest";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setToken } from "./session";

export function PatForm() {
  const navigate = useNavigate();
  const [token, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError("请输入 Token");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await new Octokit({ auth: trimmed }).users.getAuthenticated();
      setToken(trimmed);
      await navigate({ to: "/repos" });
    } catch {
      setError("Token 无效或已过期，请检查后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录 GitHub</CardTitle>
        <CardDescription>
          使用 Fine-grained PAT 访问你的文档仓库，Token 仅保存在本地浏览器。
          <a
            className="ml-1 underline"
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
          >
            去生成 Token
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pat">Fine-grained PAT</Label>
            <Input
              id="pat"
              type="password"
              placeholder="github_pat_..."
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "校验中..." : "登录"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

删除 `src/components/login-form.tsx`（仅作过样式参考）。

- [ ] **Step 5: 运行确认通过**

Run: `vp test src/features/auth/pat-form.test.tsx`
预期：PASS。

- [ ] **Step 6: 创建路由：auth 页、守卫布局、首页重定向、Toaster**

`src/routes/auth.tsx`：

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PatForm } from "@/features/auth/pat-form";
import { getToken } from "@/features/auth/session";

export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    if (getToken()) {
      throw redirect({ to: "/repos" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <PatForm />
      </div>
    </div>
  );
}
```

`src/routes/_authed.tsx`：

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getToken } from "@/features/auth/session";

export const Route = createFileRoute("/_authed")({
  beforeLoad: () => {
    if (!getToken()) {
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
```

`src/routes/index.tsx` 整体替换为：

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getToken } from "@/features/auth/session";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: getToken() ? "/repos" : "/auth" });
  },
});
```

`src/routes/__root.tsx` 整体替换为：

```tsx
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
});
```

注意：`/repos` 路由 Task 6 才创建，此时 `to: "/repos"` 会类型报错——先创建占位 `src/routes/_authed.repos.index.tsx`：

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/repos/")({
  component: () => <div className="p-6">仓库列表（Task 6 实现）</div>,
});
```

- [ ] **Step 7: 手动验证 + 检查**

Run: `vp dev`
预期：`/` 未登录跳 `/auth`；输入真实 PAT 登录成功跳 `/repos` 占位页；刷新 `/repos` 不再要求登录。停掉 dev server。

Run: `vp check && vp test`
预期：全部通过。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: PAT 登录页与路由守卫"
```

---

### Task 6: /repos 仓库列表页

**Files:**

- Create: `src/features/explorer/queries.ts`
- Modify: `src/routes/_authed.repos.index.tsx`（占位换实现）

**Interfaces:**

- Consumes: `getOctokit`（Task 2）、`listRepos/listBranches/listOpenApiFiles/getFileContent`（Task 4）
- Produces: Query 工厂（后续任务复用）：
  - `reposQuery()` → `RepoSummary[]`，queryKey `["repos"]`
  - `branchesQuery(owner, repo)` → `string[]`，queryKey `["branches", owner, repo]`
  - `treeQuery(owner, repo, ref)` → `TreeFile[]`，queryKey `["tree", owner, repo, ref]`
  - `fileQuery(owner, repo, path, ref)` → `FileContent`，queryKey `["file", owner, repo, path, ref]`

- [ ] **Step 1: 创建 `src/features/explorer/queries.ts`**

```ts
import { queryOptions } from "@tanstack/react-query";
import { getOctokit } from "@/features/auth/session";
import { getFileContent, listBranches, listOpenApiFiles, listRepos } from "@/lib/github";

export const reposQuery = () =>
  queryOptions({
    queryKey: ["repos"],
    queryFn: () => listRepos(getOctokit()),
  });

export const branchesQuery = (owner: string, repo: string) =>
  queryOptions({
    queryKey: ["branches", owner, repo],
    queryFn: () => listBranches(getOctokit(), owner, repo),
  });

export const treeQuery = (owner: string, repo: string, ref: string) =>
  queryOptions({
    queryKey: ["tree", owner, repo, ref],
    queryFn: () => listOpenApiFiles(getOctokit(), owner, repo, ref),
  });

export const fileQuery = (owner: string, repo: string, path: string, ref: string) =>
  queryOptions({
    queryKey: ["file", owner, repo, path, ref],
    queryFn: () => getFileContent(getOctokit(), { owner, repo, path, ref }),
    staleTime: 0,
  });
```

- [ ] **Step 2: 拉取 badge 组件**

```bash
vp exec shadcn add badge
```

- [ ] **Step 3: 实现 `src/routes/_authed.repos.index.tsx`（整体替换占位）**

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearToken } from "@/features/auth/session";
import { reposQuery } from "@/features/explorer/queries";

export const Route = createFileRoute("/_authed/repos/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(reposQuery()),
  component: ReposPage,
});

function ReposPage() {
  const { data: repos } = useSuspenseQuery(reposQuery());
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">选择仓库</h1>
        <Button
          variant="outline"
          onClick={() => {
            clearToken();
            void navigate({ to: "/auth" });
          }}
        >
          退出登录
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {repos.map((repo) => (
          <Link
            key={repo.fullName}
            to="/repos/$owner/$repo"
            params={{ owner: repo.owner, repo: repo.name }}
          >
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="truncate">{repo.fullName}</span>
                  {repo.isPrivate && <Badge variant="secondary">私有</Badge>}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {repo.description ?? "暂无描述"}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      {repos.length === 0 && <p className="text-muted-foreground">该 Token 无可访问的仓库。</p>}
    </div>
  );
}
```

注意：`to="/repos/$owner/$repo"` 的目标路由 Task 7 创建，先建占位 `src/routes/_authed.repos.$owner.$repo.index.tsx`：

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/repos/$owner/$repo/")({
  component: () => <div className="p-6">仓库详情（Task 7 实现）</div>,
});
```

- [ ] **Step 4: 手动验证 + 检查**

Run: `vp dev`
预期：登录后 `/repos` 展示仓库卡片（名称/描述/私有标识），点击进入占位详情页；退出登录回到 `/auth`。停掉 dev server。

Run: `vp check && vp test`
预期：全部通过。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 仓库列表页与 Query 工厂"
```

---

### Task 7: 仓库详情页（分支选择 + OpenAPI 文件树）

**Files:**

- Create: `src/features/explorer/file-tree.tsx`
- Test: `src/features/explorer/file-tree.test.ts`
- Modify: `src/routes/_authed.repos.$owner.$repo.index.tsx`（占位换实现）

**Interfaces:**

- Consumes: `branchesQuery/treeQuery/reposQuery`（Task 6）、`TreeFile`（Task 4）
- Produces:
  - `interface TreeNode { name: string; path: string; children: TreeNode[] | null }`（children 为 null 表示文件）
  - `buildFileTree(paths: string[]): TreeNode[]`（目录在前、同级按名称排序）
  - `<FileTree nodes={TreeNode[]} onSelectFile={(path: string) => void} />`
- 编辑页路由（Task 8）约定：`/repos/$owner/$repo/edit/$`，splat 为文件路径，search `{ ref: string }`。

- [ ] **Step 1: 写失败测试 `src/features/explorer/file-tree.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { buildFileTree } from "./file-tree";

describe("buildFileTree", () => {
  it("按目录分组，目录在前、同级按名称排序", () => {
    const tree = buildFileTree(["b.yaml", "docs/v1/pet.json", "docs/user.yaml", "a.json"]);
    expect(tree).toEqual([
      {
        name: "docs",
        path: "docs",
        children: [
          {
            name: "v1",
            path: "docs/v1",
            children: [{ name: "pet.json", path: "docs/v1/pet.json", children: null }],
          },
          { name: "user.yaml", path: "docs/user.yaml", children: null },
        ],
      },
      { name: "a.json", path: "a.json", children: null },
      { name: "b.yaml", path: "b.yaml", children: null },
    ]);
  });

  it("空输入返回空数组", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/features/explorer/file-tree.test.ts`
预期：FAIL。

- [ ] **Step 3: 实现 `src/features/explorer/file-tree.tsx`**

```tsx
import { FileJson, Folder } from "lucide-react";

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[] | null;
}

export function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of paths) {
    const segments = path.split("/");
    let level = root;
    let prefix = "";
    for (const [i, name] of segments.entries()) {
      prefix = prefix ? `${prefix}/${name}` : name;
      const isFile = i === segments.length - 1;
      let node = level.find((n) => n.name === name);
      if (!node) {
        node = { name, path: prefix, children: isFile ? null : [] };
        level.push(node);
      }
      if (!isFile) {
        level = node.children!;
      }
    }
  }
  const sortLevel = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      const aDir = a.children !== null ? 0 : 1;
      const bDir = b.children !== null ? 0 : 1;
      return aDir - bDir || a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) {
        sortLevel(n.children);
      }
    }
    return nodes;
  };
  return sortLevel(root);
}

export function FileTree({
  nodes,
  onSelectFile,
}: {
  nodes: TreeNode[];
  onSelectFile: (path: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.children === null ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
              onClick={() => onSelectFile(node.path)}
            >
              <FileJson className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{node.name}</span>
            </button>
          ) : (
            <div>
              <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{node.name}</span>
              </div>
              <div className="pl-4">
                <FileTree nodes={node.children} onSelectFile={onSelectFile} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/features/explorer/file-tree.test.ts`
预期：PASS。

- [ ] **Step 5: 拉取 select 组件并实现详情页**

```bash
vp exec shadcn add select
```

`src/routes/_authed.repos.$owner.$repo.index.tsx` 整体替换：

```tsx
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildFileTree, FileTree } from "@/features/explorer/file-tree";
import { branchesQuery, reposQuery, treeQuery } from "@/features/explorer/queries";

export const Route = createFileRoute("/_authed/repos/$owner/$repo/")({
  validateSearch: (search: Record<string, unknown>): { ref?: string } => ({
    ref: typeof search.ref === "string" && search.ref !== "" ? search.ref : undefined,
  }),
  loaderDeps: ({ search }) => ({ ref: search.ref }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(reposQuery()),
      context.queryClient.ensureQueryData(branchesQuery(params.owner, params.repo)),
    ]);
  },
  component: RepoPage,
});

function RepoPage() {
  const { owner, repo } = Route.useParams();
  const { ref: refParam } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: repos } = useSuspenseQuery(reposQuery());
  const { data: branches } = useSuspenseQuery(branchesQuery(owner, repo));
  const defaultBranch =
    repos.find((r) => r.owner === owner && r.name === repo)?.defaultBranch ?? "main";
  const ref = refParam ?? defaultBranch;

  const tree = useQuery(treeQuery(owner, repo, ref));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link to="/repos" className="text-sm text-muted-foreground hover:underline">
            ← 返回仓库列表
          </Link>
          <h1 className="truncate text-2xl font-semibold">
            {owner}/{repo}
          </h1>
        </div>
        <Select value={ref} onValueChange={(value) => void navigate({ search: { ref: value } })}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="选择分支" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tree.isPending && <p className="text-muted-foreground">加载文件树...</p>}
      {tree.isError && (
        <div className="text-destructive">
          <p>加载失败：{tree.error.message}</p>
          <Button variant="outline" className="mt-2" onClick={() => void tree.refetch()}>
            重试
          </Button>
        </div>
      )}
      {tree.isSuccess && tree.data.length === 0 && (
        <p className="text-muted-foreground">该分支下未找到 .json/.yaml/.yml 文件。</p>
      )}
      {tree.isSuccess && tree.data.length > 0 && (
        <FileTree
          nodes={buildFileTree(tree.data.map((f) => f.path))}
          onSelectFile={(path) =>
            void navigate({
              to: "/repos/$owner/$repo/edit/$",
              params: { owner, repo, _splat: path },
              search: { ref },
            })
          }
        />
      )}
    </div>
  );
}
```

注意：编辑路由 Task 8 创建，先建占位 `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`：

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/repos/$owner/$repo/edit/$")({
  validateSearch: (search: Record<string, unknown>): { ref: string } => ({
    ref: typeof search.ref === "string" && search.ref !== "" ? search.ref : "main",
  }),
  component: () => <div className="p-6">编辑器（Task 8 实现）</div>,
});
```

- [ ] **Step 6: 手动验证 + 检查**

Run: `vp dev`
预期：进入仓库详情页显示分支下拉（默认分支选中）与文件树（目录嵌套、只含 json/yaml/yml）；切换分支文件树刷新且 URL 带 `?ref=`；点击文件进入编辑器占位页。停掉 dev server。

Run: `vp check && vp test`
预期：全部通过。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 仓库详情页——分支选择与 OpenAPI 文件树"
```

---

### Task 8: 双栏编辑器（Monaco + swagger-ui 实时预览）

**Files:**

- Create: `src/features/editor/use-debounced-value.ts`
- Test: `src/features/editor/use-debounced-value.test.tsx`
- Create: `src/features/editor/swagger-preview.tsx`
- Modify: `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`（占位换实现）

**Interfaces:**

- Consumes: `fileQuery`（Task 6）、`parseDocument/hasOpenApiRoot`（Task 3）
- Produces:
  - `useDebouncedValue<T>(value: T, delayMs: number): T`
  - `<SwaggerPreview source={string} />`（内部解析 + 错误面板 + ErrorBoundary）
  - 编辑页内部状态 `text: string`、`sha: string`（Task 9 的保存流程依赖：`text` 为当前编辑内容，`sha` 为最近一次已知远端 SHA）。

- [ ] **Step 1: 写失败测试 `src/features/editor/use-debounced-value.test.tsx`**

```tsx
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("延迟后才更新值", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 500), {
      initialProps: { value: "a" },
    });
    expect(result.current).toBe("a");

    rerender({ value: "b" });
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(499));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("b");
  });

  it("连续变化只保留最后一次", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 500), {
      initialProps: { value: "a" },
    });
    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(300));
    rerender({ value: "c" });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe("c");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/features/editor/use-debounced-value.test.tsx`
预期：FAIL。

- [ ] **Step 3: 实现 `src/features/editor/use-debounced-value.ts`**

```ts
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/features/editor/use-debounced-value.test.tsx`
预期：PASS。

- [ ] **Step 5: 实现 `src/features/editor/swagger-preview.tsx`**

```tsx
import { Component, type ReactNode } from "react";
import SwaggerUI from "swagger-ui-react";
import { hasOpenApiRoot, parseDocument } from "@/lib/openapi";
import "swagger-ui-react/swagger-ui.css";

class PreviewBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return <Notice text="预览渲染失败，请检查文档结构。" tone="error" />;
    }
    return this.props.children;
  }
}

function Notice({ text, tone }: { text: string; tone: "error" | "info" }) {
  return (
    <div
      className={`p-4 text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {text}
    </div>
  );
}

export function SwaggerPreview({ source }: { source: string }) {
  const result = parseDocument(source);
  if (!result.ok) {
    return <Notice text={`解析失败：${result.error}`} tone="error" />;
  }
  if (!hasOpenApiRoot(result.doc)) {
    return <Notice text="缺少 openapi/swagger 顶级字段，暂不渲染预览。" tone="info" />;
  }
  return (
    <PreviewBoundary resetKey={source}>
      <SwaggerUI spec={result.doc} />
    </PreviewBoundary>
  );
}
```

- [ ] **Step 6: 实现编辑页 `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`（整体替换占位）**

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import Editor from "@monaco-editor/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SwaggerPreview } from "@/features/editor/swagger-preview";
import { useDebouncedValue } from "@/features/editor/use-debounced-value";
import { fileQuery } from "@/features/explorer/queries";

export const Route = createFileRoute("/_authed/repos/$owner/$repo/edit/$")({
  validateSearch: (search: Record<string, unknown>): { ref: string } => ({
    ref: typeof search.ref === "string" && search.ref !== "" ? search.ref : "main",
  }),
  loaderDeps: ({ search }) => ({ ref: search.ref }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      fileQuery(params.owner, params.repo, params._splat ?? "", deps.ref),
    ),
  component: EditPage,
});

function EditPage() {
  const { owner, repo, _splat: filePath = "" } = Route.useParams();
  const { ref } = Route.useSearch();

  const { data: file } = useSuspenseQuery(fileQuery(owner, repo, filePath, ref));
  const [text, setText] = useState(file.text);
  const [sha, setSha] = useState(file.sha);
  const [savedText, setSavedText] = useState(file.text);
  void sha;
  void setSha;
  void setSavedText; // 以上三行 Task 9 保存流程接入后删除
  const debouncedText = useDebouncedValue(text, 500);

  const language = filePath.endsWith(".json") ? "json" : "yaml";
  const dirty = text !== savedText;

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/repos/$owner/$repo"
            params={{ owner, repo }}
            search={{ ref }}
            className="shrink-0 text-sm text-muted-foreground hover:underline"
          >
            ← 返回
          </Link>
          <span className="truncate font-mono text-sm">
            {owner}/{repo} · {filePath} @ {ref}
          </span>
        </div>
        <Button disabled={!dirty}>保存{dirty ? "" : "（无改动）"}</Button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="min-w-0 border-r">
          <Editor
            height="100%"
            language={language}
            value={text}
            onChange={(value) => setText(value ?? "")}
            options={{ minimap: { enabled: false }, wordWrap: "on" }}
          />
        </div>
        <div className="min-w-0 overflow-y-auto bg-white">
          <SwaggerPreview source={debouncedText} />
        </div>
      </div>
    </div>
  );
}
```

说明：保存按钮此处只占位（禁用逻辑就绪），Task 9 接入提交对话框与 mutation，并移除三行 `void` 占位。

- [ ] **Step 7: 手动验证 + 检查**

Run: `vp dev`
预期：点开一个 OpenAPI 文件，左侧 Monaco 显示源码（json/yaml 高亮正确），右侧渲染 swagger-ui；编辑左侧 500ms 后右侧刷新；把 YAML 改出语法错误时右侧显示「解析失败」而非白屏；删除 openapi 字段时提示缺少顶级字段。停掉 dev server。

Run: `vp check && vp test`
预期：全部通过。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: Monaco 与 swagger-ui 双栏编辑器"
```

---

### Task 9: 保存提交（对话框 + mutation + 全局错误处理）

**Files:**

- Create: `src/features/editor/save-dialog.tsx`
- Test: `src/features/editor/save-dialog.test.tsx`
- Modify: `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`（接入保存流程）
- Modify: `src/main.tsx`（QueryCache 全局 401 处理）

**Interfaces:**

- Consumes: `saveFileContent/classifyGithubError`（Task 4）、`fileQuery/treeQuery`（Task 6）、编辑页 `text/sha` 状态（Task 8）
- Produces: `<SaveDialog open onOpenChange defaultMessage pending onConfirm={(message: string) => void} />`

- [ ] **Step 1: 拉取 dialog 组件**

```bash
vp exec shadcn add dialog
```

- [ ] **Step 2: 写失败测试 `src/features/editor/save-dialog.test.tsx`**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveDialog } from "./save-dialog";

describe("SaveDialog", () => {
  it("显示默认 commit message，确认时回传", () => {
    const onConfirm = vi.fn();
    render(
      <SaveDialog
        open
        onOpenChange={() => {}}
        defaultMessage="docs: update pet.yaml"
        pending={false}
        onConfirm={onConfirm}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>("Commit message");
    expect(input.value).toBe("docs: update pet.yaml");
    fireEvent.change(input, { target: { value: "docs: 调整宠物接口" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(onConfirm).toHaveBeenCalledWith("docs: 调整宠物接口");
  });

  it("message 为空时禁用提交按钮", () => {
    render(
      <SaveDialog
        open
        onOpenChange={() => {}}
        defaultMessage=""
        pending={false}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "提交" }).disabled).toBe(true);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `vp test src/features/editor/save-dialog.test.tsx`
预期：FAIL。

- [ ] **Step 4: 实现 `src/features/editor/save-dialog.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SaveDialog({
  open,
  onOpenChange,
  defaultMessage,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMessage: string;
  pending: boolean;
  onConfirm: (message: string) => void;
}) {
  const [message, setMessage] = useState(defaultMessage);

  useEffect(() => {
    if (open) {
      setMessage(defaultMessage);
    }
  }, [open, defaultMessage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>提交到 GitHub</DialogTitle>
          <DialogDescription>此次保存将作为一次 Git Commit 写入当前分支。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="commit-message">Commit message</Label>
          <Input id="commit-message" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button
            disabled={message.trim() === "" || pending}
            onClick={() => onConfirm(message.trim())}
          >
            {pending ? "提交中..." : "提交"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: 运行确认通过**

Run: `vp test src/features/editor/save-dialog.test.tsx`
预期：PASS。

- [ ] **Step 6: 编辑页接入保存 mutation**

修改 `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`：删除三行 `void` 占位，新增 imports：

```tsx
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SaveDialog } from "@/features/editor/save-dialog";
import { fileQuery, treeQuery } from "@/features/explorer/queries";
import { getOctokit } from "@/features/auth/session";
import { classifyGithubError, saveFileContent } from "@/lib/github";
```

`EditPage` 组件内，在 `dirty` 声明之后加入：

```tsx
const [saveOpen, setSaveOpen] = useState(false);
const queryClient = useQueryClient();
const fileName = filePath.split("/").at(-1) ?? filePath;

const save = useMutation({
  mutationFn: (message: string) =>
    saveFileContent(getOctokit(), {
      owner,
      repo,
      path: filePath,
      branch: ref,
      content: text,
      sha,
      message,
    }),
  onSuccess: (newSha) => {
    setSha(newSha);
    setSavedText(text);
    setSaveOpen(false);
    toast.success("已提交到 GitHub");
    queryClient.setQueryData(fileQuery(owner, repo, filePath, ref).queryKey, {
      text,
      sha: newSha,
    });
    void queryClient.invalidateQueries({ queryKey: treeQuery(owner, repo, ref).queryKey });
  },
  onError: (err) => {
    const kind = classifyGithubError(err);
    if (kind === "conflict") {
      toast.error("远端已更新，请刷新获取最新内容后重试", {
        action: {
          label: "刷新（丢弃本地改动）",
          onClick: () => {
            void queryClient
              .invalidateQueries({ queryKey: fileQuery(owner, repo, filePath, ref).queryKey })
              .then(() => window.location.reload());
          },
        },
      });
    } else if (kind === "rate-limited") {
      toast.error("GitHub API 触发限流，请稍后重试");
    } else {
      toast.error(`提交失败：${err instanceof Error ? err.message : String(err)}`);
    }
  },
});
```

保存按钮替换为：

```tsx
<Button disabled={!dirty} onClick={() => setSaveOpen(true)}>
  保存
</Button>
```

组件 JSX 末尾（`</div>` 结束双栏 grid 之后、最外层 `</div>` 之前）加入：

```tsx
<SaveDialog
  open={saveOpen}
  onOpenChange={setSaveOpen}
  defaultMessage={`docs: update ${fileName}`}
  pending={save.isPending}
  onConfirm={(message) => save.mutate(message)}
/>
```

`dirty` 基于 `savedText`（Task 8 已定义），保存成功后 `setSavedText(text)` 使按钮回到禁用态。

- [ ] **Step 7: main.tsx 加全局 401 处理**

`src/main.tsx` 中 QueryClient 创建替换为：

```tsx
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearToken } from "@/features/auth/session";
import { classifyGithubError } from "@/lib/github";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      if (classifyGithubError(err) === "unauthorized") {
        clearToken();
        window.location.assign("/auth");
      }
    },
  }),
});
```

- [ ] **Step 8: 手动验证 + 检查**

Run: `vp dev`
手动验证清单：

1. 修改文档 → 保存 → 对话框默认 message `docs: update <文件名>` → 提交 → toast 成功，GitHub 仓库出现对应 commit；
2. 提交后再次保存按钮回到禁用态；继续编辑再次可用；
3. 在 GitHub 网页端改同一文件后，本地再提交 → toast 提示「远端已更新」；
4. 在 GitHub 撤销 PAT 后刷新页面 → 自动回到 `/auth`。
   停掉 dev server。

Run: `vp check && vp test`
预期：全部通过。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "feat: 保存提交流程与全局错误处理"
```

---

### Task 10: README 实施细则与收尾验证

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: spec `docs/superpowers/specs/2026-07-03-openapi-doc-manager-design.md` 的第 2、3、4、5、9 节内容。

- [ ] **Step 1: 更新 README**

1. 第 3 行状态从 `**状态：** 提案` 改为 `**状态：** 实施中`。
2. 文件末尾追加「实施细则」章节，内容从 spec 摘录（保持提案原文不动）：

```markdown
---

## 7. 实施细则（2026-07 确认）

完整设计文档见 `docs/superpowers/specs/2026-07-03-openapi-doc-manager-design.md`。

### 7.1 分期计划

- **MVP（已实现）：** PAT 登录 → 仓库列表 → 分支 + OpenAPI 文件树 → Monaco + swagger-ui 双栏编辑 → 提交保存。
- **二期：** 版本时间轴（listCommits + 历史 diff + 一键回滚）、Spectral 实时校验、OAuth Exchange 函数（可选）、部署上线（GitHub Pages / Vercel）。
- **三期：** 409 冲突三方可视化合并（jsdiff）、多分支协作（前端发起 PR）、Webhooks 通知联动。

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
```

- [ ] **Step 2: 全量验证**

Run: `vp check && vp test && vp build`
预期：全部通过，产物在 `dist/`。

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: README 补充实施细则并更新状态"
```
