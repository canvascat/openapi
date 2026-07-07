# 数据模型管理（可视化第二期）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 可视模式新增「数据模型」Tab：schemas 列表（被引用计数）、字段树、反向引用列表与联动跳转到接口。

**Architecture:** IR 层追加两个纯函数（listSchemaNames / buildSchemaRefIndex，TDD）；两个轻组件（ModelNav / ModelDetailPanel）复用 SchemaTree 与 MethodBadge；VisualView 加 Tabs 与联动。顺手修上期遗留的 SchemaTree 折叠态残留（key）。

**Tech Stack:** 纯 TS + React；shadcn tabs。无新 npm 依赖。

**Spec:** `docs/superpowers/specs/2026-07-04-visual-models-design.md`

## Global Constraints

- 工具链一律走 `vp`；shadcn 经 `vp exec shadcn add ... --overwrite`。
- tsconfig 开启 `verbatimModuleSyntax`（仅类型导入 `import type` 或内联 `type`）、`erasableSyntaxOnly`、`noUnusedLocals/Parameters`。
- 组件测试文件顶部加 `// @vitest-environment jsdom`；纯函数测试默认 node 环境；pre-commit 会把 `from "vitest"` 改写为 `from "vite-plus/test"`，属正常。
- 所有面向用户的文案用中文。
- `src/routeTree.gen.ts` 勿手改。
- refIndex 语义：**只含有引用的 schema 键**，消费端一律 `refIndex[name] ?? []`。
- `features/visual/` 仍只经编辑页 React.lazy 引入（本期不改编辑页）。

---

### Task 1: IR 层 schemas 索引（listSchemaNames + buildSchemaRefIndex）

**Files:**

- Modify: `src/lib/openapi-ir.ts`（末尾追加）
- Test: `src/lib/openapi-ir.test.ts`（末尾追加）

**Interfaces:**

- Consumes: `isRecord`、模块内常量 `HTTP_METHODS`（同文件已有）。
- Produces:
  - `listSchemaNames(doc: Record<string, unknown>): string[]`（定义序；无则 []）
  - `buildSchemaRefIndex(doc: Record<string, unknown>): Record<string, string[]>`（只含有引用的键；值为去重的 operation id 列表）

- [ ] **Step 1: 在 `src/lib/openapi-ir.test.ts` 末尾追加失败测试**

首行 import 增补两个函数（保持现有导入源 `vite-plus/test` 不变，只改 `./openapi-ir` 的导入清单）：

```ts
import {
  buildApiOverview,
  buildSchemaRefIndex,
  getOperationDetail,
  listSchemaNames,
  resolveSchema,
} from "./openapi-ir";
```

追加：

```ts
describe("listSchemaNames", () => {
  it("保持定义顺序", () => {
    expect(listSchemaNames({ components: { schemas: { B: {}, A: {} } } })).toEqual(["B", "A"]);
  });

  it("无 components/schemas → 空数组", () => {
    expect(listSchemaNames({})).toEqual([]);
    expect(listSchemaNames({ components: {} })).toEqual([]);
  });
});

describe("buildSchemaRefIndex", () => {
  const doc = {
    openapi: "3.1.0",
    components: {
      schemas: { Pet: { type: "object" }, Err: { type: "object" }, Unused: { type: "string" } },
    },
    paths: {
      "/pets": {
        parameters: [{ name: "f", in: "query", schema: { $ref: "#/components/schemas/Err" } }],
        get: {
          responses: {
            "200": {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
            },
          },
        },
        post: {
          requestBody: {
            content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
          },
          responses: {
            "200": {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
            },
          },
        },
      },
      "/x": {
        get: {
          responses: {
            "200": {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Ghost" } } },
            },
          },
        },
      },
    },
  };

  it("直接引用归属 operation，同接口多处引用去重", () => {
    const index = buildSchemaRefIndex(doc);
    expect(index.Pet).toEqual(["get /pets", "post /pets"]);
  });

  it("path 级 parameters 引用归属该 path 全部 operations", () => {
    const index = buildSchemaRefIndex(doc);
    expect(index.Err).toEqual(["get /pets", "post /pets"]);
  });

  it("悬空引用与无引用 schema 不出现键", () => {
    const index = buildSchemaRefIndex(doc);
    expect(index.Ghost).toBeUndefined();
    expect(index.Unused).toBeUndefined();
  });

  it("无 paths → 空索引", () => {
    expect(buildSchemaRefIndex({ components: { schemas: { A: {} } } })).toEqual({});
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/lib/openapi-ir.test.ts`
预期：FAIL（两函数未导出）。

- [ ] **Step 3: 在 `src/lib/openapi-ir.ts` 末尾追加实现**

```ts
const SCHEMA_REF_PREFIX = "#/components/schemas/";

function collectSchemaRefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectSchemaRefs(item, out);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  const ref = node.$ref;
  if (typeof ref === "string" && ref.startsWith(SCHEMA_REF_PREFIX)) {
    out.add(ref.slice(SCHEMA_REF_PREFIX.length));
  }
  for (const value of Object.values(node)) {
    collectSchemaRefs(value, out);
  }
}

export function listSchemaNames(doc: Record<string, unknown>): string[] {
  const components = isRecord(doc.components) ? doc.components : {};
  const schemas = isRecord(components.schemas) ? components.schemas : {};
  return Object.keys(schemas);
}

export function buildSchemaRefIndex(doc: Record<string, unknown>): Record<string, string[]> {
  const known = new Set(listSchemaNames(doc));
  const index: Record<string, string[]> = {};
  const paths = doc.paths;
  if (!isRecord(paths)) {
    return index;
  }
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) {
      continue;
    }
    const pathLevelRefs = new Set<string>();
    collectSchemaRefs(item.parameters, pathLevelRefs);
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isRecord(op)) {
        continue;
      }
      const id = `${method} ${path}`;
      const refs = new Set<string>(pathLevelRefs);
      collectSchemaRefs(op, refs);
      for (const name of refs) {
        if (!known.has(name)) {
          continue;
        }
        const list = index[name] ?? [];
        if (!list.includes(id)) {
          list.push(id);
        }
        index[name] = list;
      }
    }
  }
  return index;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/lib/openapi-ir.test.ts`
预期：PASS（原 16 个 + 新 6 个）。

- [ ] **Step 5: 全量检查后提交**

Run: `vp check && vp test`
预期：全绿。

```bash
git add src/lib/openapi-ir.ts src/lib/openapi-ir.test.ts
git commit -m "feat: IR 层 schemas 列表与接口反向引用索引"
```

---

### Task 2: ModelNav 与 ModelDetailPanel

**Files:**

- Create: `src/features/visual/model-nav.tsx`
- Test: `src/features/visual/model-nav.test.tsx`
- Create: `src/features/visual/model-detail-panel.tsx`

**Interfaces:**

- Consumes: `listSchemaNames/buildSchemaRefIndex` 产出的数据形态（Task 1）、`resolveSchema/isRecord`（IR 既有）、`SchemaTree`、`MethodBadge`（api-nav.tsx 导出）。
- Produces:
  - `<ModelNav names={string[]} refIndex={Record<string, string[]>} selected={string | null} onSelect={(name: string) => void} />`
  - `<ModelDetailPanel doc={Record<string, unknown>} name={string} refIndex={Record<string, string[]>} onGotoOperation={(id: string) => void} />`

- [ ] **Step 1: 拉取 shadcn tabs**

```bash
vp exec shadcn add tabs --overwrite
```

预期：生成 `src/components/ui/tabs.tsx`（Task 3 使用；本任务顺带拉取）。

- [ ] **Step 2: 写失败测试 `src/features/visual/model-nav.test.tsx`**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelNav } from "./model-nav";

const refIndex = { Pet: ["get /pets", "post /pets"] };

describe("ModelNav", () => {
  it("渲染名称与被引用计数", () => {
    render(
      <ModelNav names={["Pet", "Err"]} refIndex={refIndex} selected={null} onSelect={() => {}} />,
    );
    expect(screen.getByText("Pet")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Err")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("点击回传名称", () => {
    const onSelect = vi.fn();
    render(<ModelNav names={["Pet"]} refIndex={refIndex} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Pet"));
    expect(onSelect).toHaveBeenCalledWith("Pet");
  });

  it("空列表显示空态文案", () => {
    render(<ModelNav names={[]} refIndex={{}} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("该文档没有定义数据模型。")).toBeTruthy();
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `vp test src/features/visual/model-nav.test.tsx`
预期：FAIL（模块不存在）。

- [ ] **Step 4: 实现 `src/features/visual/model-nav.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function ModelNav({
  names,
  refIndex,
  selected,
  onSelect,
}: {
  names: string[];
  refIndex: Record<string, string[]>;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  if (names.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">该文档没有定义数据模型。</p>;
  }
  return (
    <ScrollArea className="h-full">
      <ul className="flex flex-col gap-0.5 p-2">
        {names.map((name) => (
          <li key={name}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent",
                selected === name && "bg-accent",
              )}
              onClick={() => onSelect(name)}
            >
              <span className="truncate font-mono">{name}</span>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {(refIndex[name] ?? []).length}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
```

- [ ] **Step 5: 运行确认通过**

Run: `vp test src/features/visual/model-nav.test.tsx`
预期：PASS（3 个用例）。

- [ ] **Step 6: 实现 `src/features/visual/model-detail-panel.tsx`**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { isRecord, resolveSchema } from "@/lib/openapi-ir";
import { MethodBadge } from "./api-nav";
import { SchemaTree } from "./schema-tree";

export function ModelDetailPanel({
  doc,
  name,
  refIndex,
  onGotoOperation,
}: {
  doc: Record<string, unknown>;
  name: string;
  refIndex: Record<string, string[]>;
  onGotoOperation: (id: string) => void;
}) {
  const components = isRecord(doc.components) ? doc.components : {};
  const schemas = isRecord(components.schemas) ? components.schemas : {};
  const node = resolveSchema(doc, schemas[name]);
  const refs = refIndex[name] ?? [];

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-6">
        <h2 className="font-mono text-lg font-semibold">{name}</h2>

        <section>
          <h3 className="mb-2 text-sm font-semibold">字段结构</h3>
          <SchemaTree key={name} node={node} />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">被以下接口引用</h3>
          {refs.length === 0 ? (
            <p className="text-sm text-muted-foreground">未被任何接口直接引用。</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {refs.map((id) => {
                const spaceIndex = id.indexOf(" ");
                const method = id.slice(0, spaceIndex);
                const path = id.slice(spaceIndex + 1);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
                      onClick={() => onGotoOperation(id)}
                    >
                      <MethodBadge method={method} />
                      <span className="truncate font-mono text-sm">{path}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 7: 全量检查后提交**

Run: `vp check && vp test`
预期：全绿（ModelDetailPanel 暂无消费者属正常）。

```bash
git add src/features/visual/model-nav.tsx src/features/visual/model-nav.test.tsx src/features/visual/model-detail-panel.tsx src/components/ui/tabs.tsx
git commit -m "feat: 数据模型导航与详情面板组件"
```

---

### Task 3: VisualView 装配改造与折叠态修复

**Files:**

- Modify: `src/features/visual/visual-view.tsx`（整体替换）
- Modify: `src/features/visual/operation-detail-panel.tsx`（两处 SchemaTree 加 key）

**Interfaces:**

- Consumes: Task 1 两函数、Task 2 两组件、shadcn Tabs。

- [ ] **Step 1: 整体替换 `src/features/visual/visual-view.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseDocument } from "@/lib/openapi";
import {
  buildApiOverview,
  buildSchemaRefIndex,
  listSchemaNames,
  type OperationSummary,
} from "@/lib/openapi-ir";
import { ApiNav } from "./api-nav";
import { ModelDetailPanel } from "./model-detail-panel";
import { ModelNav } from "./model-nav";
import { OperationDetailPanel } from "./operation-detail-panel";

const REASON_TEXT: Record<string, string> = {
  "swagger-2": "可视模式仅支持 OpenAPI 3.x（2.0 转换功能规划中），请使用源码模式。",
  "not-openapi": "该文档缺少 openapi 字段，不是 OpenAPI 3.x 文档，请使用源码模式。",
  "no-paths": "该文档没有任何接口（paths 为空）。",
};

function Notice({ text }: { text: string }) {
  return <p className="p-6 text-sm text-muted-foreground">{text}</p>;
}

export default function VisualView({ source }: { source: string }) {
  const parsed = useMemo(() => parseDocument(source), [source]);
  const ir = useMemo(() => (parsed.ok ? buildApiOverview(parsed.doc) : null), [parsed]);
  const schemaNames = useMemo(() => (parsed.ok ? listSchemaNames(parsed.doc) : []), [parsed]);
  const refIndex = useMemo(() => (parsed.ok ? buildSchemaRefIndex(parsed.doc) : {}), [parsed]);
  const [selected, setSelected] = useState<OperationSummary | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"apis" | "models">("apis");

  if (!parsed.ok) {
    return <Notice text={`文档解析失败，请回到源码模式修正：${parsed.error}`} />;
  }
  if (!ir || !ir.ok) {
    return <Notice text={REASON_TEXT[ir?.reason ?? "not-openapi"]} />;
  }

  const all = ir.overview.groups.flatMap((g) => g.operations);
  const current = (selected && all.find((o) => o.id === selected.id)) ?? all[0] ?? null;
  const currentModel =
    selectedModel !== null && schemaNames.includes(selectedModel)
      ? selectedModel
      : (schemaNames[0] ?? null);

  const gotoOperation = (id: string) => {
    const target = all.find((o) => o.id === id);
    if (target) {
      setSelected(target);
    }
    setActiveTab("apis");
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_1fr]">
      <div className="flex min-h-0 flex-col border-r">
        <div className="shrink-0 truncate border-b px-3 py-2 text-sm font-semibold">
          {ir.overview.title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            OpenAPI {ir.overview.version}
          </span>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "apis" | "models")}
          className="shrink-0 border-b px-2 py-1.5"
        >
          <TabsList className="w-full">
            <TabsTrigger value="apis" className="flex-1">
              接口
            </TabsTrigger>
            <TabsTrigger value="models" className="flex-1">
              数据模型
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-h-0 flex-1">
          {activeTab === "apis" ? (
            <ApiNav
              groups={ir.overview.groups}
              selectedId={current?.id ?? null}
              onSelect={setSelected}
            />
          ) : (
            <ModelNav
              names={schemaNames}
              refIndex={refIndex}
              selected={currentModel}
              onSelect={setSelectedModel}
            />
          )}
        </div>
      </div>
      <div className="min-h-0">
        {activeTab === "apis" ? (
          current ? (
            <OperationDetailPanel doc={parsed.doc} operation={current} />
          ) : (
            <Notice text="选择左侧接口查看详情。" />
          )
        ) : currentModel !== null ? (
          <ModelDetailPanel
            doc={parsed.doc}
            name={currentModel}
            refIndex={refIndex}
            onGotoOperation={gotoOperation}
          />
        ) : (
          <Notice text="该文档没有定义数据模型。" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: operation-detail-panel.tsx 两处 SchemaTree 加 key（修上期折叠态残留）**

requestBody 处：

```tsx
<SchemaTree key={operation.id} node={detail.requestBody.schema} />
```

responses 循环内：

```tsx
<SchemaTree key={`${operation.id}:${r.status}`} node={r.schema} />
```

（只加 key 属性，其余不动。）

- [ ] **Step 3: 全量检查、测试与 build**

Run: `vp check && vp test`
预期：全绿。

Run: `vp build`
预期：构建成功；visual chunk 体积较上版（14.65 kB）增长有限（新增两个轻组件 + tabs）。在报告记录 chunk 名称与体积。

- [ ] **Step 4: 本地手验（无真实 PAT，编译级）**

`vp dev` 后台启动确认编译无错、守卫重定向正常；验证完停掉 dev server、确认端口无残留（用工具 run_in_background）。Tabs 切换、联动跳转由用户线上验证。

- [ ] **Step 5: 提交**

```bash
git add src/features/visual/visual-view.tsx src/features/visual/operation-detail-panel.tsx
git commit -m "feat: 可视模式数据模型 Tab 与引用联动"
```

---

### Task 4: 合并上线与观察（控制器执行）

**Files:** 无代码改动。

- [ ] **Step 1: 全分支终审后合并 main 并推送**

```bash
git checkout main && git merge <feature-branch> && git push origin main
```

- [ ] **Step 2: 观察 Actions 与线上生效**

Deploy to GitHub Pages 绿灯；主页 200 且 bundle hash 更新。

- [ ] **Step 3: 线上冒烟（用户配合）**

打开 3.x 文档 → 可视模式 → 「数据模型」Tab：schema 列表与计数正确、字段树渲染、点击「被以下接口引用」条目跳回接口 Tab 并选中；切换不同接口确认 schema 折叠态不再残留（上期修复生效）。
