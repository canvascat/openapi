# 接口浏览（可视化第一期）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 编辑页新增「可视」模式：左侧 tag 分组接口树 + 右侧结构化接口详情（参数表格、schema 树），只读浏览，并建立后续期次复用的 IR 中间结构层。

**Architecture:** `lib/openapi-ir.ts` 纯函数三件套（buildApiOverview / getOperationDetail / resolveSchema，node 单测充分覆盖）；`features/visual/` 四组件（SchemaTree / ApiNav / OperationDetailPanel / VisualView）经 `React.lazy` 懒加载；编辑页只加一个 ToggleGroup 与条件渲染。仅支持 OpenAPI 3.x，Swagger 2.0 显示引导提示。

**Tech Stack:** 纯 TS + React，无新 npm 依赖；shadcn collapsible/table。

**Spec:** `docs/superpowers/specs/2026-07-04-visual-api-browse-design.md`

## Global Constraints

- 工具链一律走 `vp`；shadcn 经 `vp exec shadcn add ... --overwrite`。
- tsconfig 开启 `verbatimModuleSyntax`（仅类型导入必须 `import type` 或内联 `type`）、`erasableSyntaxOnly`（禁 enum）、`noUnusedLocals/Parameters`。
- 组件测试文件顶部加 `// @vitest-environment jsdom`；纯函数测试默认 node 环境；pre-commit 会把 `from "vitest"` 改写为 `from "vite-plus/test"`，属正常。
- 所有面向用户的文案用中文。
- `src/routeTree.gen.ts` 勿手改。
- 仅支持 OpenAPI 3.x；`features/visual/` 只能被编辑页经 `React.lazy` 动态引入，不得静态 import 进主 chunk。
- 无新 npm 依赖。

---

### Task 1: IR 概览层（buildApiOverview）

**Files:**

- Create: `src/lib/openapi-ir.ts`
- Test: `src/lib/openapi-ir.test.ts`

**Interfaces:**

- Produces（后续任务逐字依赖）:
  - `type IrResult = { ok: true; overview: ApiOverview } | { ok: false; reason: "not-openapi" | "swagger-2" | "no-paths" }`
  - `interface ApiOverview { version: string; title: string; groups: TagGroup[] }`
  - `interface TagGroup { tag: string; operations: OperationSummary[] }`
  - `interface OperationSummary { id: string; method: string; path: string; summary: string; deprecated: boolean; tags: string[] }`
  - `buildApiOverview(doc: Record<string, unknown>): IrResult`
  - `isRecord(value: unknown): value is Record<string, unknown>`（模块内工具，导出供同文件后续函数与测试使用）

- [ ] **Step 1: 写失败测试 `src/lib/openapi-ir.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { buildApiOverview } from "./openapi-ir";

const baseDoc = {
  openapi: "3.1.0",
  info: { title: "宠物店" },
  paths: {
    "/pets": {
      get: { summary: "列出宠物", tags: ["宠物"] },
      post: { summary: "创建宠物", tags: ["宠物", "管理"] },
    },
    "/health": {
      get: { summary: "健康检查", deprecated: true },
    },
  },
};

describe("buildApiOverview", () => {
  it("swagger 2.0 文档 → swagger-2", () => {
    expect(buildApiOverview({ swagger: "2.0", paths: { "/a": {} } })).toEqual({
      ok: false,
      reason: "swagger-2",
    });
  });

  it("缺 openapi 字段 → not-openapi", () => {
    expect(buildApiOverview({ info: {} })).toEqual({ ok: false, reason: "not-openapi" });
  });

  it("paths 缺失或为空 → no-paths", () => {
    expect(buildApiOverview({ openapi: "3.0.0" })).toEqual({ ok: false, reason: "no-paths" });
    expect(buildApiOverview({ openapi: "3.0.0", paths: {} })).toEqual({
      ok: false,
      reason: "no-paths",
    });
  });

  it("按 tag 分组：多 tag 出现在多组，无 tag 归「未分组」置尾", () => {
    const r = buildApiOverview(baseDoc);
    if (!r.ok) throw new Error("应当成功");
    expect(r.overview.version).toBe("3.1.0");
    expect(r.overview.title).toBe("宠物店");
    expect(r.overview.groups.map((g) => g.tag)).toEqual(["宠物", "管理", "未分组"]);
    expect(r.overview.groups[0].operations.map((o) => o.id)).toEqual(["get /pets", "post /pets"]);
    expect(r.overview.groups[1].operations.map((o) => o.id)).toEqual(["post /pets"]);
    expect(r.overview.groups[2].operations[0]).toEqual({
      id: "get /health",
      method: "get",
      path: "/health",
      summary: "健康检查",
      deprecated: true,
      tags: [],
    });
  });

  it("info.title 缺失时兜底「未命名文档」", () => {
    const r = buildApiOverview({ openapi: "3.0.0", paths: { "/a": { get: {} } } });
    if (!r.ok) throw new Error("应当成功");
    expect(r.overview.title).toBe("未命名文档");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/lib/openapi-ir.test.ts`
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/lib/openapi-ir.ts`**

```ts
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type IrResult =
  | { ok: true; overview: ApiOverview }
  | { ok: false; reason: "not-openapi" | "swagger-2" | "no-paths" };

export interface ApiOverview {
  version: string;
  title: string;
  groups: TagGroup[];
}

export interface TagGroup {
  tag: string;
  operations: OperationSummary[];
}

export interface OperationSummary {
  id: string;
  method: string;
  path: string;
  summary: string;
  deprecated: boolean;
  tags: string[];
}

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const UNGROUPED = "未分组";

export function buildApiOverview(doc: Record<string, unknown>): IrResult {
  if (typeof doc.openapi !== "string") {
    return "swagger" in doc
      ? { ok: false, reason: "swagger-2" }
      : { ok: false, reason: "not-openapi" };
  }
  const paths = doc.paths;
  if (!isRecord(paths) || Object.keys(paths).length === 0) {
    return { ok: false, reason: "no-paths" };
  }
  const info = isRecord(doc.info) ? doc.info : {};
  const title = typeof info.title === "string" ? info.title : "未命名文档";

  const groups = new Map<string, OperationSummary[]>();
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isRecord(op)) {
        continue;
      }
      const tags = Array.isArray(op.tags)
        ? op.tags.filter((t): t is string => typeof t === "string")
        : [];
      const summary: OperationSummary = {
        id: `${method} ${path}`,
        method,
        path,
        summary: typeof op.summary === "string" ? op.summary : "",
        deprecated: op.deprecated === true,
        tags,
      };
      for (const tag of tags.length > 0 ? tags : [UNGROUPED]) {
        const list = groups.get(tag) ?? [];
        list.push(summary);
        groups.set(tag, list);
      }
    }
  }

  const result: TagGroup[] = [...groups.entries()]
    .filter(([tag]) => tag !== UNGROUPED)
    .map(([tag, operations]) => ({ tag, operations }));
  const ungrouped = groups.get(UNGROUPED);
  if (ungrouped) {
    result.push({ tag: UNGROUPED, operations: ungrouped });
  }
  return { ok: true, overview: { version: doc.openapi, title, groups: result } };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/lib/openapi-ir.test.ts`
预期：PASS（5 个用例）。

- [ ] **Step 5: 全量检查后提交**

Run: `vp check && vp test`
预期：全绿。

```bash
git add src/lib/openapi-ir.ts src/lib/openapi-ir.test.ts
git commit -m "feat: OpenAPI IR 概览层——版本判定与 tag 分组"
```

---

### Task 2: IR 详情层（resolveSchema + getOperationDetail）

**Files:**

- Modify: `src/lib/openapi-ir.ts`（末尾追加）
- Test: `src/lib/openapi-ir.test.ts`（末尾追加）

**Interfaces:**

- Consumes: `isRecord`（Task 1，同文件）。
- Produces:
  - `interface SchemaNode { name: string; type: string; required: boolean; description: string; enumValues: string[] | null; refName: string | null; circular: boolean; children: SchemaNode[] | null }`
  - `resolveSchema(doc: Record<string, unknown>, schema: unknown, seenRefs?: Set<string>, depth?: number, name?: string, required?: boolean): SchemaNode`
  - `interface ParameterRow { name: string; location: string; type: string; required: boolean; description: string }`
  - `interface ResponseEntry { status: string; description: string; schema: SchemaNode | null }`
  - `interface OperationDetail { description: string; parameters: ParameterRow[]; requestBody: { mediaType: string; schema: SchemaNode | null } | null; responses: ResponseEntry[] }`
  - `getOperationDetail(doc: Record<string, unknown>, method: string, path: string): OperationDetail | null`

- [ ] **Step 1: 在 `src/lib/openapi-ir.test.ts` 末尾追加失败测试**

首行 import 改为：

```ts
import { buildApiOverview, getOperationDetail, resolveSchema } from "./openapi-ir";
```

追加：

```ts
describe("resolveSchema", () => {
  const doc = {
    components: {
      schemas: {
        Pet: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", description: "名称" },
            status: { type: "string", enum: ["在售", "已售"] },
            owner: { $ref: "#/components/schemas/Owner" },
          },
        },
        Owner: {
          type: "object",
          properties: { pet: { $ref: "#/components/schemas/Pet" } },
        },
      },
    },
  };

  it("object properties 与 required 列表", () => {
    const node = resolveSchema(doc, { $ref: "#/components/schemas/Pet" });
    expect(node.type).toBe("object");
    expect(node.refName).toBe("Pet");
    const name = node.children?.find((c) => c.name === "name");
    expect(name?.required).toBe(true);
    expect(name?.type).toBe("string");
    expect(name?.description).toBe("名称");
    const status = node.children?.find((c) => c.name === "status");
    expect(status?.required).toBe(false);
    expect(status?.enumValues).toEqual(["在售", "已售"]);
  });

  it("循环引用截断并标记 circular", () => {
    const node = resolveSchema(doc, { $ref: "#/components/schemas/Pet" });
    const owner = node.children?.find((c) => c.name === "owner");
    const petAgain = owner?.children?.find((c) => c.name === "pet");
    expect(petAgain?.circular).toBe(true);
    expect(petAgain?.children).toBeNull();
  });

  it("未知/跨文件 $ref → type unknown + refName 保留", () => {
    const node = resolveSchema(doc, { $ref: "./other.yaml#/X" });
    expect(node.type).toBe("unknown");
    expect(node.refName).toBe("X");
  });

  it("array items 作为单元素 children", () => {
    const node = resolveSchema(doc, { type: "array", items: { type: "integer" } });
    expect(node.type).toBe("array");
    expect(node.children).toHaveLength(1);
    expect(node.children?.[0].type).toBe("integer");
  });

  it("oneOf 显示为组合关键字，分支为 children", () => {
    const node = resolveSchema(doc, {
      oneOf: [{ type: "string" }, { type: "integer" }],
    });
    expect(node.type).toBe("oneOf");
    expect(node.children).toHaveLength(2);
  });

  it("深度上限 8 层后 children 截断为 null", () => {
    let deep: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i += 1) {
      deep = { type: "object", properties: { next: deep } };
    }
    let node = resolveSchema(doc, deep);
    let depth = 0;
    while (node.children && node.children.length > 0) {
      node = node.children[0];
      depth += 1;
    }
    expect(depth).toBeLessThanOrEqual(8);
  });
});

describe("getOperationDetail", () => {
  const doc = {
    openapi: "3.1.0",
    paths: {
      "/pets/{id}": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "verbose", in: "query", schema: { type: "boolean" }, description: "路径级" },
        ],
        get: {
          description: "查询宠物",
          parameters: [
            { name: "verbose", in: "query", schema: { type: "string" }, description: "接口级" },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { a: { type: "string" } } },
              },
            },
          },
          responses: {
            default: { description: "兜底" },
            "404": { description: "未找到" },
            "200": {
              description: "成功",
              content: { "application/json": { schema: { type: "string" } } },
            },
          },
        },
      },
    },
  };

  it("合并 path 级与 operation 级参数，同名同 in 以 operation 级覆盖", () => {
    const d = getOperationDetail(doc, "get", "/pets/{id}");
    expect(d?.parameters).toHaveLength(2);
    const verbose = d?.parameters.find((p) => p.name === "verbose");
    expect(verbose?.description).toBe("接口级");
    expect(verbose?.type).toBe("string");
    const id = d?.parameters.find((p) => p.name === "id");
    expect(id?.required).toBe(true);
    expect(id?.location).toBe("path");
  });

  it("requestBody 取第一个 media type", () => {
    const d = getOperationDetail(doc, "get", "/pets/{id}");
    expect(d?.requestBody?.mediaType).toBe("application/json");
    expect(d?.requestBody?.schema?.type).toBe("object");
  });

  it("responses 按状态码升序、default 置尾", () => {
    const d = getOperationDetail(doc, "get", "/pets/{id}");
    expect(d?.responses.map((r) => r.status)).toEqual(["200", "404", "default"]);
    expect(d?.responses[0].schema?.type).toBe("string");
    expect(d?.responses[1].schema).toBeNull();
  });

  it("找不到 operation 返回 null", () => {
    expect(getOperationDetail(doc, "post", "/pets/{id}")).toBeNull();
    expect(getOperationDetail(doc, "get", "/none")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/lib/openapi-ir.test.ts`
预期：FAIL（resolveSchema/getOperationDetail 未导出）。

- [ ] **Step 3: 在 `src/lib/openapi-ir.ts` 末尾追加实现**

```ts
export interface SchemaNode {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enumValues: string[] | null;
  refName: string | null;
  circular: boolean;
  children: SchemaNode[] | null;
}

const MAX_DEPTH = 8;

function refShortName(ref: string): string {
  return ref.split("/").at(-1) ?? ref;
}

function lookupRef(doc: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  let node: unknown = doc;
  for (const seg of ref.slice(2).split("/")) {
    if (!isRecord(node)) {
      return undefined;
    }
    node = node[seg.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  return node;
}

export function resolveSchema(
  doc: Record<string, unknown>,
  schema: unknown,
  seenRefs: Set<string> = new Set(),
  depth = 0,
  name = "",
  required = false,
): SchemaNode {
  const base: SchemaNode = {
    name,
    type: "unknown",
    required,
    description: "",
    enumValues: null,
    refName: null,
    circular: false,
    children: null,
  };
  if (!isRecord(schema)) {
    return base;
  }

  if (typeof schema.$ref === "string") {
    const ref = schema.$ref;
    const short = refShortName(ref);
    if (seenRefs.has(ref)) {
      return { ...base, type: "object", refName: short, circular: true };
    }
    const target = lookupRef(doc, ref);
    if (target === undefined) {
      return { ...base, refName: short };
    }
    const resolved = resolveSchema(doc, target, new Set([...seenRefs, ref]), depth, name, required);
    return { ...resolved, refName: short };
  }

  const description = typeof schema.description === "string" ? schema.description : "";
  const enumValues = Array.isArray(schema.enum) ? schema.enum.map(String) : null;

  for (const keyword of ["oneOf", "anyOf", "allOf"]) {
    const branches = schema[keyword];
    if (Array.isArray(branches)) {
      const children =
        depth >= MAX_DEPTH
          ? null
          : branches.map((b, i) =>
              resolveSchema(doc, b, seenRefs, depth + 1, `选项 ${i + 1}`, false),
            );
      return { ...base, type: keyword, description, enumValues, children };
    }
  }

  const type =
    typeof schema.type === "string"
      ? schema.type
      : isRecord(schema.properties)
        ? "object"
        : "unknown";

  if (type === "object" && isRecord(schema.properties)) {
    const requiredList = Array.isArray(schema.required) ? schema.required : [];
    const children =
      depth >= MAX_DEPTH
        ? null
        : Object.entries(schema.properties).map(([key, prop]) =>
            resolveSchema(doc, prop, seenRefs, depth + 1, key, requiredList.includes(key)),
          );
    return { ...base, type: "object", description, enumValues, children };
  }
  if (type === "array") {
    const children =
      depth >= MAX_DEPTH || schema.items === undefined
        ? null
        : [resolveSchema(doc, schema.items, seenRefs, depth + 1, "items", false)];
    return { ...base, type: "array", description, enumValues, children };
  }
  return { ...base, type, description, enumValues };
}

export interface ParameterRow {
  name: string;
  location: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ResponseEntry {
  status: string;
  description: string;
  schema: SchemaNode | null;
}

export interface OperationDetail {
  description: string;
  parameters: ParameterRow[];
  requestBody: { mediaType: string; schema: SchemaNode | null } | null;
  responses: ResponseEntry[];
}

function toParameterRow(doc: Record<string, unknown>, raw: unknown): ParameterRow | null {
  let p = raw;
  if (isRecord(p) && typeof p.$ref === "string") {
    p = lookupRef(doc, p.$ref);
  }
  if (!isRecord(p) || typeof p.name !== "string") {
    return null;
  }
  const schema = isRecord(p.schema) ? p.schema : null;
  return {
    name: p.name,
    location: typeof p.in === "string" ? p.in : "unknown",
    type: schema && typeof schema.type === "string" ? schema.type : "unknown",
    required: p.required === true,
    description: typeof p.description === "string" ? p.description : "",
  };
}

function firstMediaSchema(
  doc: Record<string, unknown>,
  content: unknown,
): { mediaType: string; schema: SchemaNode | null } | null {
  if (!isRecord(content)) {
    return null;
  }
  const [mediaType] = Object.keys(content);
  if (!mediaType) {
    return null;
  }
  const media = content[mediaType];
  const schema =
    isRecord(media) && media.schema !== undefined ? resolveSchema(doc, media.schema) : null;
  return { mediaType, schema };
}

export function getOperationDetail(
  doc: Record<string, unknown>,
  method: string,
  path: string,
): OperationDetail | null {
  const paths = doc.paths;
  if (!isRecord(paths)) {
    return null;
  }
  const item = paths[path];
  if (!isRecord(item)) {
    return null;
  }
  const op = item[method];
  if (!isRecord(op)) {
    return null;
  }

  const merged = new Map<string, ParameterRow>();
  for (const source of [item.parameters, op.parameters]) {
    if (!Array.isArray(source)) {
      continue;
    }
    for (const raw of source) {
      const row = toParameterRow(doc, raw);
      if (row) {
        merged.set(`${row.location}:${row.name}`, row);
      }
    }
  }

  let requestBody: OperationDetail["requestBody"] = null;
  let rb: unknown = op.requestBody;
  if (isRecord(rb) && typeof rb.$ref === "string") {
    rb = lookupRef(doc, rb.$ref);
  }
  if (isRecord(rb)) {
    requestBody = firstMediaSchema(doc, rb.content);
  }

  const responses: ResponseEntry[] = [];
  if (isRecord(op.responses)) {
    for (const [status, r0] of Object.entries(op.responses)) {
      let r: unknown = r0;
      if (isRecord(r) && typeof r.$ref === "string") {
        r = lookupRef(doc, r.$ref);
      }
      if (!isRecord(r)) {
        continue;
      }
      const media = firstMediaSchema(doc, r.content);
      responses.push({
        status,
        description: typeof r.description === "string" ? r.description : "",
        schema: media?.schema ?? null,
      });
    }
    responses.sort((a, b) =>
      a.status === "default" ? 1 : b.status === "default" ? -1 : a.status.localeCompare(b.status),
    );
  }

  return {
    description: typeof op.description === "string" ? op.description : "",
    parameters: [...merged.values()],
    requestBody,
    responses,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/lib/openapi-ir.test.ts`
预期：PASS（Task 1 的 5 个 + 新 10 个）。

- [ ] **Step 5: 全量检查后提交**

Run: `vp check && vp test`
预期：全绿。

```bash
git add src/lib/openapi-ir.ts src/lib/openapi-ir.test.ts
git commit -m "feat: OpenAPI IR 详情层——schema 解析与接口详情"
```

---

### Task 3: SchemaTree 组件

**Files:**

- Create: `src/features/visual/schema-tree.tsx`
- Test: `src/features/visual/schema-tree.test.tsx`

**Interfaces:**

- Consumes: `SchemaNode`（Task 2）。
- Produces: `<SchemaTree node={SchemaNode} />`（内部递归，depth 默认 0，前两层默认展开）。

- [ ] **Step 1: 写失败测试 `src/features/visual/schema-tree.test.tsx`**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SchemaNode } from "@/lib/openapi-ir";
import { SchemaTree } from "./schema-tree";

const leaf = (name: string, extra: Partial<SchemaNode> = {}): SchemaNode => ({
  name,
  type: "string",
  required: false,
  description: "",
  enumValues: null,
  refName: null,
  circular: false,
  children: null,
  ...extra,
});

describe("SchemaTree", () => {
  it("渲染名称、类型、必填星标与描述", () => {
    render(<SchemaTree node={leaf("name", { required: true, description: "宠物名称" })} />);
    expect(screen.getByText("name")).toBeTruthy();
    expect(screen.getByText("string")).toBeTruthy();
    expect(screen.getByText("*")).toBeTruthy();
    expect(screen.getByText("宠物名称")).toBeTruthy();
  });

  it("枚举值与循环截断文案", () => {
    render(<SchemaTree node={leaf("status", { enumValues: ["在售", "已售"], circular: true })} />);
    expect(screen.getByText(/在售、已售/)).toBeTruthy();
    expect(screen.getByText("↻ 循环引用已截断")).toBeTruthy();
  });

  it("点击折叠按钮隐藏子级", () => {
    const parent: SchemaNode = {
      ...leaf("pet", { type: "object" }),
      children: [leaf("childField")],
    };
    render(<SchemaTree node={parent} />);
    expect(screen.getByText("childField")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("折叠"));
    expect(screen.queryByText("childField")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/features/visual/schema-tree.test.tsx`
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/features/visual/schema-tree.tsx`**

```tsx
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SchemaNode } from "@/lib/openapi-ir";

const typeColor: Record<string, string> = {
  object: "text-blue-600",
  array: "text-purple-600",
  string: "text-green-600",
  number: "text-orange-600",
  integer: "text-orange-600",
  boolean: "text-pink-600",
};

export function SchemaTree({ node, depth = 0 }: { node: SchemaNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children !== null && node.children.length > 0;

  return (
    <div className="text-sm">
      <div className="flex items-start gap-2 py-0.5">
        {hasChildren ? (
          <button
            type="button"
            className="mt-0.5 shrink-0 text-muted-foreground"
            aria-label={open ? "折叠" : "展开"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {node.name !== "" && (
          <span className="font-mono">
            {node.name}
            {node.required && <span className="text-destructive">*</span>}
          </span>
        )}
        <span
          className={cn(
            "font-mono text-xs leading-5",
            typeColor[node.type] ?? "text-muted-foreground",
          )}
        >
          {node.type}
        </span>
        {node.refName !== null && (
          <Badge variant="outline" className="font-mono text-xs">
            {node.refName}
          </Badge>
        )}
        {node.circular && <span className="text-xs text-muted-foreground">↻ 循环引用已截断</span>}
        {node.description !== "" && (
          <span className="truncate text-muted-foreground">{node.description}</span>
        )}
      </div>
      {node.enumValues !== null && (
        <div className="pl-6 text-xs text-muted-foreground">枚举：{node.enumValues.join("、")}</div>
      )}
      {hasChildren && open && (
        <div className="ml-1.5 border-l pl-4">
          {node.children?.map((child, i) => (
            <SchemaTree key={`${child.name}:${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/features/visual/schema-tree.test.tsx`
预期：PASS（3 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/features/visual/schema-tree.tsx src/features/visual/schema-tree.test.tsx
git commit -m "feat: SchemaTree 递归 schema 展示组件"
```

---

### Task 4: ApiNav、OperationDetailPanel 与 VisualView

**Files:**

- Create: `src/features/visual/api-nav.tsx`
- Test: `src/features/visual/api-nav.test.tsx`
- Create: `src/features/visual/operation-detail-panel.tsx`
- Create: `src/features/visual/visual-view.tsx`

**Interfaces:**

- Consumes: `TagGroup/OperationSummary/getOperationDetail`（Tasks 1-2）、`SchemaTree`（Task 3）、`parseDocument`（lib/openapi 既有）。
- Produces:
  - `<ApiNav groups={TagGroup[]} selectedId={string | null} onSelect={(op: OperationSummary) => void} />` 与 `<MethodBadge method={string} />`（api-nav.tsx 导出）
  - `<OperationDetailPanel doc={Record<string, unknown>} operation={OperationSummary} />`
  - `visual-view.tsx` **default export** `VisualView({ source: string })`（Task 5 经 `React.lazy` 使用）。

- [ ] **Step 1: 拉取 shadcn 组件**

```bash
vp exec shadcn add collapsible table --overwrite
```

预期：生成 `src/components/ui/collapsible.tsx`、`src/components/ui/table.tsx`。

- [ ] **Step 2: 写失败测试 `src/features/visual/api-nav.test.tsx`**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TagGroup } from "@/lib/openapi-ir";
import { ApiNav } from "./api-nav";

const groups: TagGroup[] = [
  {
    tag: "宠物",
    operations: [
      {
        id: "get /pets",
        method: "get",
        path: "/pets",
        summary: "列出宠物",
        deprecated: false,
        tags: ["宠物"],
      },
      {
        id: "delete /pets",
        method: "delete",
        path: "/pets",
        summary: "清空",
        deprecated: true,
        tags: ["宠物"],
      },
    ],
  },
];

describe("ApiNav", () => {
  it("渲染分组标题、method 徽标与 path", () => {
    render(<ApiNav groups={groups} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("宠物")).toBeTruthy();
    expect(screen.getByText("get")).toBeTruthy();
    expect(screen.getAllByText("/pets")).toHaveLength(2);
  });

  it("deprecated 条目带删除线样式", () => {
    render(<ApiNav groups={groups} selectedId={null} onSelect={() => {}} />);
    const del = screen.getAllByText("/pets")[1];
    expect(del.className).toContain("line-through");
  });

  it("点击条目回传 OperationSummary", () => {
    const onSelect = vi.fn();
    render(<ApiNav groups={groups} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("列出宠物"));
    expect(onSelect).toHaveBeenCalledWith(groups[0].operations[0]);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `vp test src/features/visual/api-nav.test.tsx`
预期：FAIL（模块不存在）。

- [ ] **Step 4: 实现 `src/features/visual/api-nav.tsx`**

```tsx
import { ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { OperationSummary, TagGroup } from "@/lib/openapi-ir";

const methodColor: Record<string, string> = {
  get: "bg-green-600",
  post: "bg-blue-600",
  put: "bg-orange-500",
  delete: "bg-red-600",
  patch: "bg-purple-600",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-block w-14 shrink-0 rounded px-1 text-center font-mono text-xs font-bold text-white",
        methodColor[method] ?? "bg-gray-500",
      )}
    >
      {method}
    </span>
  );
}

export function ApiNav({
  groups,
  selectedId,
  onSelect,
}: {
  groups: TagGroup[];
  selectedId: string | null;
  onSelect: (operation: OperationSummary) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <nav className="flex flex-col gap-2 p-2">
        {groups.map((group) => (
          <Collapsible key={group.tag} defaultOpen>
            <CollapsibleTrigger className="group flex w-full items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent">
              <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
              <span>{group.tag}</span>
              <span>({group.operations.length})</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="flex flex-col gap-0.5">
                {group.operations.map((op) => (
                  <li key={`${group.tag}:${op.id}`}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent",
                        selectedId === op.id && "bg-accent",
                      )}
                      onClick={() => onSelect(op)}
                    >
                      <MethodBadge method={op.method} />
                      <span
                        className={cn(
                          "shrink-0 font-mono text-xs",
                          op.deprecated && "line-through opacity-60",
                        )}
                      >
                        {op.path}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{op.summary}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>
    </ScrollArea>
  );
}
```

- [ ] **Step 5: 运行确认通过**

Run: `vp test src/features/visual/api-nav.test.tsx`
预期：PASS（3 个用例）。

- [ ] **Step 6: 实现 `src/features/visual/operation-detail-panel.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOperationDetail, type OperationSummary } from "@/lib/openapi-ir";
import { MethodBadge } from "./api-nav";
import { SchemaTree } from "./schema-tree";

export function OperationDetailPanel({
  doc,
  operation,
}: {
  doc: Record<string, unknown>;
  operation: OperationSummary;
}) {
  const detail = getOperationDetail(doc, operation.method, operation.path);
  if (!detail) {
    return <p className="p-6 text-sm text-muted-foreground">未找到该接口的定义。</p>;
  }
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-6">
        <div>
          <div className="flex items-center gap-2">
            <MethodBadge method={operation.method} />
            <span className="font-mono text-lg">{operation.path}</span>
            {operation.deprecated && <Badge variant="destructive">已废弃</Badge>}
          </div>
          {operation.summary !== "" && <p className="mt-1 font-medium">{operation.summary}</p>}
          {detail.description !== "" && (
            <p className="mt-1 text-sm text-muted-foreground">{detail.description}</p>
          )}
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold">请求参数</h3>
          {detail.parameters.length === 0 ? (
            <p className="text-sm text-muted-foreground">无</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>位置</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>必填</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.parameters.map((p) => (
                  <TableRow key={`${p.location}:${p.name}`}>
                    <TableCell className="font-mono">{p.name}</TableCell>
                    <TableCell>{p.location}</TableCell>
                    <TableCell className="font-mono">{p.type}</TableCell>
                    <TableCell>{p.required ? "是" : "否"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">请求体</h3>
          {detail.requestBody ? (
            <div className="flex flex-col gap-2">
              <Badge variant="outline" className="w-fit font-mono text-xs">
                {detail.requestBody.mediaType}
              </Badge>
              {detail.requestBody.schema ? (
                <SchemaTree node={detail.requestBody.schema} />
              ) : (
                <p className="text-sm text-muted-foreground">无 schema 定义</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">无</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">响应</h3>
          {detail.responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">无</p>
          ) : (
            <div className="flex flex-col gap-4">
              {detail.responses.map((r) => (
                <div key={r.status} className="rounded-md border p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {r.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{r.description}</span>
                  </div>
                  {r.schema ? (
                    <SchemaTree node={r.schema} />
                  ) : (
                    <p className="text-sm text-muted-foreground">无响应体 schema</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 7: 实现 `src/features/visual/visual-view.tsx`（default export，供 lazy）**

```tsx
import { useMemo, useState } from "react";
import { parseDocument } from "@/lib/openapi";
import { buildApiOverview, type OperationSummary } from "@/lib/openapi-ir";
import { ApiNav } from "./api-nav";
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
  const [selected, setSelected] = useState<OperationSummary | null>(null);

  if (!parsed.ok) {
    return <Notice text={`文档解析失败，请回到源码模式修正：${parsed.error}`} />;
  }
  if (!ir || !ir.ok) {
    return <Notice text={REASON_TEXT[ir?.reason ?? "not-openapi"]} />;
  }

  const all = ir.overview.groups.flatMap((g) => g.operations);
  const current = (selected && all.find((o) => o.id === selected.id)) ?? all[0] ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_1fr]">
      <div className="flex min-h-0 flex-col border-r">
        <div className="shrink-0 truncate border-b px-3 py-2 text-sm font-semibold">
          {ir.overview.title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            OpenAPI {ir.overview.version}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <ApiNav
            groups={ir.overview.groups}
            selectedId={current?.id ?? null}
            onSelect={setSelected}
          />
        </div>
      </div>
      <div className="min-h-0">
        {current ? (
          <OperationDetailPanel doc={parsed.doc} operation={current} />
        ) : (
          <Notice text="选择左侧接口查看详情。" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: 全量检查与测试**

Run: `vp check && vp test`
预期：全绿（visual-view/operation-detail-panel 暂无消费者属正常）。

- [ ] **Step 9: 提交**

```bash
git add src/features/visual src/components/ui/collapsible.tsx src/components/ui/table.tsx
git commit -m "feat: 可视模式组件——接口树、详情面板与装配视图"
```

---

### Task 5: 编辑页集成与本地验证

**Files:**

- Modify: `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`

**Interfaces:**

- Consumes: `visual-view.tsx` 的 default export（Task 4，经 `React.lazy`）。

- [ ] **Step 1: 新增 imports 与 lazy 定义**

把 `import { useEffect, useRef, useState } from "react";` 改为：

```tsx
import { lazy, Suspense, useEffect, useRef, useState } from "react";
```

把 `import { History } from "lucide-react";` 改为：

```tsx
import { Code, History, LayoutList } from "lucide-react";
```

新增 import（放在其他 `@/components/ui` import 附近）：

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
```

在 `export const Route = ...` 之前（imports 之后）加模块级 lazy 定义：

```tsx
const VisualView = lazy(() => import("@/features/visual/visual-view"));
```

- [ ] **Step 2: 组件内加 viewMode 状态与 header 切换**

`EditPage` 组件内，`const [historyOpen, setHistoryOpen] = useState(false);` 之后加：

```tsx
const [viewMode, setViewMode] = useState<"code" | "visual">("code");
```

header 的右侧按钮容器（`<div className="flex shrink-0 items-center gap-2">`）内、「历史」按钮之前加：

```tsx
<ToggleGroup
  type="single"
  variant="outline"
  size="sm"
  value={viewMode}
  onValueChange={(value) => {
    if (value) {
      setViewMode(value as "code" | "visual");
    }
  }}
>
  <ToggleGroupItem value="code" aria-label="源码模式">
    <Code className="size-4" />
    源码
  </ToggleGroupItem>
  <ToggleGroupItem value="visual" aria-label="可视模式">
    <LayoutList className="size-4" />
    可视
  </ToggleGroupItem>
</ToggleGroup>
```

- [ ] **Step 3: 双栏区域按 viewMode 条件渲染**

把现有的双栏容器：

```tsx
<div className="grid min-h-0 flex-1 grid-cols-2">
  ...（左列 Editor+ProblemsPanel、右列 SwaggerPreview 原样）...
</div>
```

整体改为：

```tsx
{
  viewMode === "code" ? (
    <div className="grid min-h-0 flex-1 grid-cols-2">...（原有左右两列内容一字不动）...</div>
  ) : (
    <div className="min-h-0 flex-1">
      <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">加载可视化视图...</p>}>
        <VisualView source={debouncedText} />
      </Suspense>
    </div>
  );
}
```

（SaveDialog 与 HistorySheet 保持在条件块之外，两种模式都可用。）

- [ ] **Step 4: 全量检查、测试与 chunk 验证**

Run: `vp check && vp test`
预期：全绿。

Run: `vp build`
预期：构建成功；产物中出现 `visual-view` 相关的独立 chunk（lazy 动态 import 生效），编辑路由 chunk 体积无明显异常增长。在报告中记录 chunk 名称与体积。

- [ ] **Step 5: 本地手验（无真实 PAT，编译级）**

`vp dev` 后台启动：编辑页路由编译无错、无 token 守卫重定向正常。验证完停掉 dev server、确认端口无残留监听（用工具 run_in_background，勿用 shell &）。真实交互（模式切换、接口树选中联动、schema 展开）由用户线上验证。

- [ ] **Step 6: 提交**

```bash
git add "src/routes/_authed.repos.\$owner.\$repo.edit.\$.tsx"
git commit -m "feat: 编辑页接入可视模式切换"
```

---

### Task 6: 合并上线与观察（控制器执行）

**Files:** 无代码改动。

- [ ] **Step 1: 全分支终审后合并 main 并推送**

```bash
git checkout main && git merge <feature-branch> && git push origin main
```

- [ ] **Step 2: 观察 Actions 与线上生效**

Deploy to GitHub Pages 绿灯；主页 200 且 bundle hash 更新。

- [ ] **Step 3: 线上冒烟（用户配合）**

登录后打开 OpenAPI 3.x 文件 → 切「可视」：接口树分组正确、点击联动详情、参数表格与 schema 树渲染、必填星标/枚举/循环截断如期；编辑源码后切回可视内容跟随（500ms 防抖）；打开 Swagger 2.0 文件确认引导提示；保存/历史在可视模式下可用。
