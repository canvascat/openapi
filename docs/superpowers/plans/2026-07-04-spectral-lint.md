# Spectral 实时校验实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 编辑页对当前文档实时跑 Spectral `oas` 规范校验，Monaco 行内 marker + 底部可折叠问题面板（点击跳转），非阻塞保存。

**Architecture:** `features/lint/` 四文件——纯映射 `diagnostics.ts`（隔离 Spectral 结构，可 node 单测）、动态导入的 `spectral.ts` 运行时封装、`use-lint.ts` 竞态安全 hook、`problems-panel.tsx` 折叠面板；编辑页拿 Monaco 引用打 marker、左列改 grid 加面板。Spectral 三包动态 `import()`，不进首屏 chunk。

**Tech Stack:** @stoplight/spectral-core + spectral-parsers + spectral-rulesets（oas），Monaco setModelMarkers，React hook。

**Spec:** `docs/superpowers/specs/2026-07-04-spectral-lint-design.md`

## Global Constraints

- 包管理与脚本一律走 `vp`（`vp add` / `vp check` / `vp test` / `vp build` / `vp dev`）。
- tsconfig 开启 `verbatimModuleSyntax`（仅类型导入必须 `import type` 或内联 `type`）、`erasableSyntaxOnly`、`noUnusedLocals/Parameters`。
- 组件测试文件顶部加 `// @vitest-environment jsdom`；纯函数测试用默认 node 环境；pre-commit 会把 `from "vitest"` 自动改写为 `from "vite-plus/test"`，属正常。
- 所有面向用户的文案用中文。
- `src/routeTree.gen.ts` 勿手改。
- Spectral 三包只经 `spectral.ts` 动态 `import()` 引入，不得静态 import 进任何进首屏的模块。

---

### Task 1: 依赖安装与诊断映射纯函数（diagnostics.ts）

**Files:**

- Modify: `package.json`（经 vp add）
- Create: `src/features/lint/diagnostics.ts`
- Test: `src/features/lint/diagnostics.test.ts`

**Interfaces:**

- Produces:
  - `interface LintDiagnostic { line: number; column: number; endLine: number; endColumn: number; message: string; code: string; severity: "error" | "warning" | "info" }`（行列 1-based）
  - `type SpectralSeverity = 0 | 1 | 2 | 3`
  - `mapSeverity(s: number): LintDiagnostic["severity"]`
  - `interface RawResult { code: string | number; message: string; severity: number; range: { start: { line: number; character: number }; end?: { line: number; character: number } } }`
  - `mapSpectralResult(raw: RawResult): LintDiagnostic`
  - `severityRank(s: LintDiagnostic["severity"]): number`

- [ ] **Step 1: 安装依赖**

```bash
vp add @stoplight/spectral-core @stoplight/spectral-parsers @stoplight/spectral-rulesets
```

预期：安装成功。若触发 pnpm build-script 审批提示（类似 @scarf/scarf），非交互环境默认忽略即可（这些包的原生构建脚本不影响 Spectral 运行）；如命令因交互提示卡住，改用 `pnpm approve-builds` 全部拒绝后重试。

- [ ] **Step 2: 写失败测试 `src/features/lint/diagnostics.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { mapSeverity, mapSpectralResult, severityRank } from "./diagnostics";

describe("mapSeverity", () => {
  it.each([
    [0, "error"],
    [1, "warning"],
    [2, "info"],
    [3, "info"],
  ] as const)("severity %i → %s", (input, expected) => {
    expect(mapSeverity(input)).toBe(expected);
  });
});

describe("mapSpectralResult", () => {
  it("range 0-based → 1-based，code 字符串化", () => {
    expect(
      mapSpectralResult({
        code: "oas3-schema",
        message: "应包含 info 字段",
        severity: 0,
        range: { start: { line: 2, character: 4 }, end: { line: 2, character: 10 } },
      }),
    ).toEqual({
      line: 3,
      column: 5,
      endLine: 3,
      endColumn: 11,
      message: "应包含 info 字段",
      code: "oas3-schema",
      severity: "error",
    });
  });

  it("数字 code 转字符串", () => {
    const r = mapSpectralResult({
      code: 42,
      message: "m",
      severity: 1,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    });
    expect(r.code).toBe("42");
    expect(r.severity).toBe("warning");
  });

  it("缺 end 时用 start 兜底", () => {
    const r = mapSpectralResult({
      code: "x",
      message: "m",
      severity: 2,
      range: { start: { line: 5, character: 3 } },
    });
    expect(r.endLine).toBe(6);
    expect(r.endColumn).toBe(4);
  });
});

describe("severityRank", () => {
  it("error < warning < info", () => {
    expect(severityRank("error")).toBeLessThan(severityRank("warning"));
    expect(severityRank("warning")).toBeLessThan(severityRank("info"));
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `vp test src/features/lint/diagnostics.test.ts`
预期：FAIL（模块不存在）。

- [ ] **Step 4: 实现 `src/features/lint/diagnostics.ts`**

```ts
export interface LintDiagnostic {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  code: string;
  severity: "error" | "warning" | "info";
}

export type SpectralSeverity = 0 | 1 | 2 | 3;

export function mapSeverity(s: number): LintDiagnostic["severity"] {
  if (s === 0) {
    return "error";
  }
  if (s === 1) {
    return "warning";
  }
  return "info";
}

export interface RawResult {
  code: string | number;
  message: string;
  severity: number;
  range: {
    start: { line: number; character: number };
    end?: { line: number; character: number };
  };
}

export function mapSpectralResult(raw: RawResult): LintDiagnostic {
  const start = raw.range.start;
  const end = raw.range.end ?? start;
  return {
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
    message: raw.message,
    code: String(raw.code),
    severity: mapSeverity(raw.severity),
  };
}

export function severityRank(s: LintDiagnostic["severity"]): number {
  return s === "error" ? 0 : s === "warning" ? 1 : 2;
}
```

- [ ] **Step 5: 运行确认通过**

Run: `vp test src/features/lint/diagnostics.test.ts`
预期：PASS。

- [ ] **Step 6: 全量检查后提交**

Run: `vp check && vp test`
预期：全绿。

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml src/features/lint
git commit -m "feat: Spectral 诊断映射纯函数与依赖"
```

---

### Task 2: Spectral 运行时封装与 hook（spectral.ts / use-lint.ts）

**Files:**

- Create: `src/features/lint/spectral.ts`
- Create: `src/features/lint/use-lint.ts`

**Interfaces:**

- Consumes: `mapSpectralResult`、`RawResult`、`LintDiagnostic`（Task 1）。
- Produces:
  - `lintDocument(source: string): Promise<LintDiagnostic[]>`
  - `type LintStatus = "idle" | "linting" | "error"`
  - `useLint(source: string): { diagnostics: LintDiagnostic[]; status: LintStatus }`

- [ ] **Step 1: 实现 `src/features/lint/spectral.ts`**

```ts
import { type LintDiagnostic, mapSpectralResult, type RawResult } from "./diagnostics";

interface Linter {
  run: (source: string) => Promise<RawResult[]>;
}

let linterPromise: Promise<Linter> | null = null;

async function createLinter(): Promise<Linter> {
  const [core, parsers, rulesets] = await Promise.all([
    import("@stoplight/spectral-core"),
    import("@stoplight/spectral-parsers"),
    import("@stoplight/spectral-rulesets"),
  ]);
  const spectral = new core.Spectral();
  spectral.setRuleset(rulesets.oas);
  return {
    run: async (source: string) => {
      const document = new core.Document(source, parsers.Yaml);
      const results = await spectral.run(document);
      return results as unknown as RawResult[];
    },
  };
}

export async function lintDocument(source: string): Promise<LintDiagnostic[]> {
  if (source.trim() === "") {
    return [];
  }
  linterPromise ??= createLinter();
  const linter = await linterPromise;
  const results = await linter.run(source);
  return results.map(mapSpectralResult);
}
```

**实现者核对点（重要）**：安装后打开 `node_modules/@stoplight/spectral-core/dist/…` 的类型声明或 `node_modules/@stoplight/spectral-parsers`，核对以下四项，与上面代码不符时按实际调整并在报告中说明：

1. `Spectral`、`Document` 是否从 `@stoplight/spectral-core` 具名导出；
2. `Yaml` parser 是否从 `@stoplight/spectral-parsers` 具名导出，`new Document(source, Yaml)` 构造签名；
3. `oas` 是否从 `@stoplight/spectral-rulesets` 具名导出且可直接 `setRuleset(oas)`（无需 bundleAndLoadRuleset）；
4. `spectral.run()` 返回数组元素是否具备 `{ code, message, severity, range: { start: { line, character }, end } }` 结构（severity 为数字 0-3，range 为 0-based）。若 `run` 需要额外 await 或 `spectral.run` 的结果字段名不同，只需保证传给 `mapSpectralResult` 的对象满足 Task 1 的 `RawResult`（可在 `run` 内做一层字段拾取，不改 diagnostics.ts）。

若核对发现 API 差异较大导致无法在本任务内稳定跑通，报告 BLOCKED 并附实际类型声明，不要猜测硬凑。

- [ ] **Step 2: 实现 `src/features/lint/use-lint.ts`**

```ts
import { useEffect, useState } from "react";
import type { LintDiagnostic } from "./diagnostics";
import { lintDocument } from "./spectral";

export type LintStatus = "idle" | "linting" | "error";

export function useLint(source: string): {
  diagnostics: LintDiagnostic[];
  status: LintStatus;
} {
  const [diagnostics, setDiagnostics] = useState<LintDiagnostic[]>([]);
  const [status, setStatus] = useState<LintStatus>("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("linting");
    lintDocument(source)
      .then((result) => {
        if (!cancelled) {
          setDiagnostics(result);
          setStatus("idle");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiagnostics([]);
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return { diagnostics, status };
}
```

- [ ] **Step 3: 检查（含 build chunk 验证）**

Run: `vp check`
预期：0 errors。

Run: `vp build`
预期：构建成功；产物中 Spectral 独立成 chunk（不在主 index chunk）。核对方式：`vp build` 输出的 chunk 列表里应出现 spectral 相关的独立 js 文件，或 `dist/assets/` 下有明显大于其他的 spectral chunk。在报告中记录 chunk 情况；若 Spectral 被打进主 chunk（说明动态 import 未生效），检查是否有别处静态 import 了 spectral 模块。

- [ ] **Step 4: 提交**

```bash
git add src/features/lint/spectral.ts src/features/lint/use-lint.ts
git commit -m "feat: Spectral 运行时封装与 useLint hook"
```

---

### Task 3: 问题面板组件（problems-panel.tsx）

**Files:**

- Create: `src/features/lint/problems-panel.tsx`
- Test: `src/features/lint/problems-panel.test.tsx`

**Interfaces:**

- Consumes: `LintDiagnostic`（Task 1）、`LintStatus`（Task 2）。
- Produces: `<ProblemsPanel diagnostics status onGoto={(line: number, column: number) => void} />`

- [ ] **Step 1: 写失败测试 `src/features/lint/problems-panel.test.tsx`**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LintDiagnostic } from "./diagnostics";
import { ProblemsPanel } from "./problems-panel";

const diagnostics: LintDiagnostic[] = [
  {
    line: 3,
    column: 5,
    endLine: 3,
    endColumn: 11,
    message: "应包含 info 字段",
    code: "oas3-schema",
    severity: "error",
  },
];

describe("ProblemsPanel", () => {
  it("展示问题数量", () => {
    render(<ProblemsPanel diagnostics={diagnostics} status="idle" onGoto={() => {}} />);
    expect(screen.getByText("1 个问题")).toBeTruthy();
  });

  it("无诊断时展示空态文案", () => {
    render(<ProblemsPanel diagnostics={[]} status="idle" onGoto={() => {}} />);
    expect(screen.getByText("无校验问题")).toBeTruthy();
  });

  it("error 状态展示校验器异常", () => {
    render(<ProblemsPanel diagnostics={[]} status="error" onGoto={() => {}} />);
    expect(screen.getByText("校验器异常，暂不可用")).toBeTruthy();
  });

  it("展开后点击条目回传 onGoto(line, column)", () => {
    const onGoto = vi.fn();
    render(<ProblemsPanel diagnostics={diagnostics} status="idle" onGoto={onGoto} />);
    fireEvent.click(screen.getByText("1 个问题"));
    fireEvent.click(screen.getByText("应包含 info 字段"));
    expect(onGoto).toHaveBeenCalledWith(3, 5);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/features/lint/problems-panel.test.tsx`
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/features/lint/problems-panel.tsx`**

```tsx
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { useState } from "react";
import type { LintDiagnostic } from "./diagnostics";
import type { LintStatus } from "./use-lint";

const severityIcon = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function ProblemsPanel({
  diagnostics,
  status,
  onGoto,
}: {
  diagnostics: LintDiagnostic[];
  status: LintStatus;
  onGoto: (line: number, column: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;

  return (
    <div className="flex max-h-64 flex-col border-t text-sm">
      <button
        type="button"
        className="flex shrink-0 items-center gap-2 px-3 py-1.5 hover:bg-accent"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {status === "error" ? (
          <span className="text-destructive">校验器异常，暂不可用</span>
        ) : (
          <span className="flex items-center gap-2">
            <span>{diagnostics.length === 0 ? "无校验问题" : `${diagnostics.length} 个问题`}</span>
            {errorCount > 0 && <span className="text-destructive">{errorCount} 错误</span>}
            {warningCount > 0 && <span className="text-amber-600">{warningCount} 警告</span>}
          </span>
        )}
      </button>
      {open && status !== "error" && diagnostics.length > 0 && (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {diagnostics.map((d, i) => {
            const Icon = severityIcon[d.severity];
            return (
              <li key={`${d.line}:${d.column}:${d.code}:${i}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-accent"
                  onClick={() => onGoto(d.line, d.column)}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <span className="flex-1">{d.message}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{d.code}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    Ln{d.line}:Col{d.column}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/features/lint/problems-panel.test.tsx`
预期：PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/features/lint/problems-panel.tsx src/features/lint/problems-panel.test.tsx
git commit -m "feat: Spectral 问题面板组件"
```

---

### Task 4: 编辑页集成与本地验证

**Files:**

- Modify: `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`

**Interfaces:**

- Consumes: `useLint`（Task 2）、`ProblemsPanel`（Task 3）。

- [ ] **Step 1: 新增 imports 与 refs**

`src/routes/_authed.repos.$owner.$repo.edit.$.tsx` 顶部，把现有的 `import Editor from "@monaco-editor/react";` 改为：

```tsx
import Editor, { type OnMount } from "@monaco-editor/react";
```

并新增（放在其他 `@/features` import 附近）：

```tsx
import { ProblemsPanel } from "@/features/lint/problems-panel";
import { useLint } from "@/features/lint/use-lint";
```

把现有 `import { useState } from "react";` 改为（一步到位，含本任务后续要用的 useEffect/useRef）：

```tsx
import { useEffect, useRef, useState } from "react";
```

- [ ] **Step 2: 组件内加 refs、useLint 与 marker 副作用**

`EditPage` 组件内，`const debouncedText = useDebouncedValue(text, 500);` 之后加：

```tsx
const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
const { diagnostics, status: lintStatus } = useLint(debouncedText);

useEffect(() => {
  const monaco = monacoRef.current;
  const model = editorRef.current?.getModel();
  if (!monaco || !model) {
    return;
  }
  const markers = diagnostics.map((d) => ({
    startLineNumber: d.line,
    startColumn: d.column,
    endLineNumber: d.endLine,
    endColumn: d.endColumn,
    message: `${d.message} (${d.code})`,
    severity:
      d.severity === "error"
        ? monaco.MarkerSeverity.Error
        : d.severity === "warning"
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
  }));
  monaco.editor.setModelMarkers(model, "spectral", markers);
}, [diagnostics]);
```

（`useEffect`/`useRef` 已在 Step 1 的 react import 中就位。）

- [ ] **Step 3: 左列布局改为 Editor + 面板**

把现有左列：

```tsx
<div className="min-w-0 border-r">
  <Editor
    height="100%"
    language={language}
    value={text}
    onChange={(value) => setText(value ?? "")}
    options={{ minimap: { enabled: false }, wordWrap: "on" }}
  />
</div>
```

整体替换为：

```tsx
<div className="grid min-w-0 grid-rows-[1fr_auto] border-r">
  <div className="min-h-0">
    <Editor
      height="100%"
      language={language}
      value={text}
      onChange={(value) => setText(value ?? "")}
      onMount={(editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
      }}
      options={{ minimap: { enabled: false }, wordWrap: "on" }}
    />
  </div>
  <ProblemsPanel
    diagnostics={diagnostics}
    status={lintStatus}
    onGoto={(line, column) => {
      editorRef.current?.revealLineInCenter(line);
      editorRef.current?.setPosition({ lineNumber: line, column });
      editorRef.current?.focus();
    }}
  />
</div>
```

- [ ] **Step 4: 检查与测试**

Run: `vp check && vp test`
预期：全绿（问题面板与 diagnostics 测试计入，总数以实际输出为准）。

- [ ] **Step 5: 本地手验**

`vp dev` 后台启动：确认编辑页路由编译无错、无 token 时守卫重定向正常。若能在无 token 下访问登录页且控制台无报错即可（真实校验交互——marker 波浪线、面板计数、点击跳转——需登录后由用户线上验证）。验证完停掉 dev server、确认端口无残留监听（用工具 run_in_background，勿用 shell `&`）。

- [ ] **Step 6: 提交**

```bash
git add "src/routes/_authed.repos.\$owner.\$repo.edit.\$.tsx"
git commit -m "feat: 编辑页接入 Spectral 实时校验"
```

---

### Task 5: 合并上线与观察（控制器执行）

**Files:** 无代码改动。

- [ ] **Step 1: 全分支终审后合并 main 并推送**

```bash
git checkout main && git merge <feature-branch> && git push origin main
```

- [ ] **Step 2: 观察 Actions**

确认 Deploy to GitHub Pages 工作流绿灯；观察构建日志中 Spectral 是否独立 chunk、以及 Vite Task 缓存命中情况（上期遗留观察项——若本次无关联源码变更命中则记录）。

- [ ] **Step 3: 线上冒烟（用户配合）**

登录后打开一个有规范问题的 OpenAPI 文件：确认左栏出现波浪线、悬停显示 Spectral 规则提示、底部面板显示问题计数、点击条目跳转到对应行、改正后问题消失、保存不被拦截。
