# 可视化编辑第一期（元信息 + 参数行）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 可视模式接口详情页开放编辑（元信息 + 参数行），对话框收集改动、保格式回写 YAML/JSON，走现有保存链路。

**Architecture:** 回写层 `lib/openapi-edit.ts`（applyEdits，YAML 走动态导入的 yaml 包、JSON 走缩进探测，TDD 重点）；IR 的 ParameterRow 加 origin 寻址；两个对话框（EditOperationDialog / ParameterDialog）；详情面板加编辑入口冒泡 onEdit；编辑页一个回调接 applyEdits→setText。

**Tech Stack:** yaml 包（动态导入，随 visual chunk）；shadcn switch/textarea/alert-dialog。

**Spec:** `docs/superpowers/specs/2026-07-05-visual-edit-design.md`

## Global Constraints

- 工具链一律走 `vp`；shadcn 经 `vp exec shadcn add ... --overwrite`。
- tsconfig 开启 `verbatimModuleSyntax`（仅类型导入 `import type` 或内联 `type`）、`erasableSyntaxOnly`（禁 enum，用联合类型）、`noUnusedLocals/Parameters`。
- 组件测试文件顶部加 `// @vitest-environment jsdom`；纯函数测试默认 node 环境；pre-commit 会把 `from "vitest"` 改写为 `from "vite-plus/test"`，属正常。
- 所有面向用户的文案用中文。
- `src/routeTree.gen.ts` 勿手改。
- 回写基于当前 `text`（非 debounced）；YAML `toString({ lineWidth: 0 })` 固定。
- yaml 包只经 `openapi-edit.ts` 动态 `import("yaml")` 引入，不得静态 import 进主 chunk。

---

### Task 1: 回写层 openapi-edit.ts（applyEdits）

**Files:**

- Modify: `package.json`（经 vp add）
- Create: `src/lib/openapi-edit.ts`
- Test: `src/lib/openapi-edit.test.ts`

**Interfaces:**

- Produces:
  - `type EditPath = (string | number)[]`
  - `type Edit = { path: EditPath; value: unknown } | { path: EditPath; delete: true }`
  - `applyEdits(source: string, language: "yaml" | "json", edits: Edit[]): Promise<string>`
  - `detectJsonIndent(source: string): number | "\t"`（导出供测试）

- [ ] **Step 1: 安装依赖**

```bash
vp add yaml
```

预期：安装成功。若触发 pnpm build-script 交互提示卡住，用 `pnpm approve-builds` 全部拒绝后重试。

- [ ] **Step 2: 写失败测试 `src/lib/openapi-edit.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { applyEdits, detectJsonIndent } from "./openapi-edit";

describe("detectJsonIndent", () => {
  it("2 空格", () => {
    expect(detectJsonIndent('{\n  "a": 1\n}')).toBe(2);
  });
  it("4 空格", () => {
    expect(detectJsonIndent('{\n    "a": 1\n}')).toBe(4);
  });
  it("tab", () => {
    expect(detectJsonIndent('{\n\t"a": 1\n}')).toBe("\t");
  });
  it("无缩进默认 2", () => {
    expect(detectJsonIndent("{}")).toBe(2);
  });
});

describe("applyEdits YAML", () => {
  const src = `# 顶部注释
openapi: 3.1.0
info:
  title: "宠物店"   # 行尾注释
paths:
  /pets:
    get:
      summary: 列出宠物
      parameters:
        - name: limit
          in: query
          required: false
`;

  it("改字符串值保留注释与引号风格", async () => {
    const out = await applyEdits(src, "yaml", [
      { path: ["paths", "/pets", "get", "summary"], value: "获取宠物列表" },
    ]);
    expect(out).toContain("# 顶部注释");
    expect(out).toContain('title: "宠物店"');
    expect(out).toContain("# 行尾注释");
    expect(out).toContain("获取宠物列表");
  });

  it("改布尔值", async () => {
    const out = await applyEdits(src, "yaml", [
      { path: ["paths", "/pets", "get", "parameters", 0, "required"], value: true },
    ]);
    expect(out).toContain("required: true");
  });

  it("新增键", async () => {
    const out = await applyEdits(src, "yaml", [
      { path: ["paths", "/pets", "get", "description"], value: "新描述" },
    ]);
    expect(out).toContain("description: 新描述");
  });

  it("删除键", async () => {
    const out = await applyEdits(src, "yaml", [{ path: ["info", "title"], delete: true }]);
    expect(out).not.toContain("宠物店");
  });

  it("数组末尾追加参数", async () => {
    const out = await applyEdits(src, "yaml", [
      {
        path: ["paths", "/pets", "get", "parameters", 1],
        value: { name: "offset", in: "query" },
      },
    ]);
    expect(out).toContain("name: offset");
    expect(out).toContain("name: limit");
  });

  it("删除数组元素", async () => {
    const out = await applyEdits(src, "yaml", [
      { path: ["paths", "/pets", "get", "parameters", 0], delete: true },
    ]);
    expect(out).not.toContain("name: limit");
  });
});

describe("applyEdits JSON", () => {
  const src = '{\n  "openapi": "3.1.0",\n  "info": {\n    "title": "T"\n  }\n}';

  it("改值并保留 2 空格缩进", async () => {
    const out = await applyEdits(src, "json", [{ path: ["info", "title"], value: "新" }]);
    expect(out).toContain('"title": "新"');
    expect(out).toContain('  "openapi"');
    expect(JSON.parse(out).info.title).toBe("新");
  });

  it("删除键", async () => {
    const out = await applyEdits(src, "json", [{ path: ["info", "title"], delete: true }]);
    expect(JSON.parse(out).info.title).toBeUndefined();
  });

  it("数组追加与删除", async () => {
    const arrSrc = '{\n  "list": [1, 2]\n}';
    const added = await applyEdits(arrSrc, "json", [{ path: ["list", 2], value: 3 }]);
    expect(JSON.parse(added).list).toEqual([1, 2, 3]);
    const removed = await applyEdits(arrSrc, "json", [{ path: ["list", 0], delete: true }]);
    expect(JSON.parse(removed).list).toEqual([2]);
  });
});

describe("applyEdits 失败", () => {
  it("YAML 解析失败抛错", async () => {
    await expect(applyEdits("a: [1, 2", "yaml", [])).rejects.toThrow();
  });
  it("JSON 解析失败抛错", async () => {
    await expect(applyEdits("{bad", "json", [])).rejects.toThrow();
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `vp test src/lib/openapi-edit.test.ts`
预期：FAIL（模块不存在）。

- [ ] **Step 4: 实现 `src/lib/openapi-edit.ts`**

```ts
export type EditPath = (string | number)[];
export type Edit = { path: EditPath; value: unknown } | { path: EditPath; delete: true };

export function detectJsonIndent(source: string): number | "\t" {
  const match = source.match(/\n([ \t]+)\S/);
  if (!match) {
    return 2;
  }
  const ws = match[1];
  if (ws.startsWith("\t")) {
    return "\t";
  }
  return ws.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyJsonEdit(root: unknown, edit: Edit): void {
  const { path } = edit;
  if (path.length === 0) {
    throw new Error("空路径不支持");
  }
  let node: unknown = root;
  for (const seg of path.slice(0, -1)) {
    if (Array.isArray(node)) {
      node = node[seg as number];
    } else if (isRecord(node)) {
      node = node[seg as string];
    } else {
      throw new Error(`路径无法定位：${path.join("/")}`);
    }
  }
  const last = path[path.length - 1];
  if (Array.isArray(node)) {
    const index = last as number;
    if ("delete" in edit) {
      node.splice(index, 1);
    } else {
      node[index] = edit.value;
    }
  } else if (isRecord(node)) {
    const key = last as string;
    if ("delete" in edit) {
      delete node[key];
    } else {
      node[key] = edit.value;
    }
  } else {
    throw new Error(`路径无法定位：${path.join("/")}`);
  }
}

export async function applyEdits(
  source: string,
  language: "yaml" | "json",
  edits: Edit[],
): Promise<string> {
  if (language === "yaml") {
    const { parseDocument } = await import("yaml");
    const doc = parseDocument(source);
    if (doc.errors.length > 0) {
      throw new Error(doc.errors[0].message);
    }
    for (const edit of edits) {
      if ("delete" in edit) {
        doc.deleteIn(edit.path);
      } else {
        doc.setIn(edit.path, edit.value);
      }
    }
    return doc.toString({ lineWidth: 0 });
  }
  const root = JSON.parse(source) as unknown;
  for (const edit of edits) {
    applyJsonEdit(root, edit);
  }
  return `${JSON.stringify(root, null, detectJsonIndent(source))}\n`;
}
```

说明：yaml 的 `setIn` 对 seq 用等于长度的索引会追加，对已有索引会替换；`deleteIn` 对 seq 索引会 splice。批次内 edits 按数组序应用；本期各对话框只产出「全 set」「单 delete」「单 append」之一，不混排。JSON 侧 `\n` 收尾与项目现有文件习惯一致。

- [ ] **Step 5: 运行确认通过**

Run: `vp test src/lib/openapi-edit.test.ts`
预期：PASS（全部用例）。

- [ ] **Step 6: 全量检查后提交**

Run: `vp check && vp test`
预期：全绿。

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml src/lib/openapi-edit.ts src/lib/openapi-edit.test.ts
git commit -m "feat: 保格式回写层 applyEdits（YAML Document API + JSON 缩进探测）"
```

---

### Task 2: IR ParameterRow.origin

**Files:**

- Modify: `src/lib/openapi-ir.ts`（ParameterRow 接口、toParameterRow、getOperationDetail 的合并循环）
- Test: `src/lib/openapi-ir.test.ts`（更新既有 getOperationDetail 参数断言 + 新增 origin 用例）

**Interfaces:**

- Produces: `ParameterRow` 增加 `origin: { level: "path" | "operation"; index: number }`。

- [ ] **Step 1: 更新既有测试并加 origin 断言**

打开 `src/lib/openapi-ir.test.ts`，在 `getOperationDetail` 的 describe 块内，把「合并 path 级与 operation 级参数」用例整体替换为（补 origin 断言）：

```ts
it("合并 path 级与 operation 级参数，同名同 in 以 operation 级覆盖，并记录 origin", () => {
  const d = getOperationDetail(doc, "get", "/pets/{id}");
  expect(d?.parameters).toHaveLength(2);
  const verbose = d?.parameters.find((p) => p.name === "verbose");
  expect(verbose?.description).toBe("接口级");
  expect(verbose?.type).toBe("string");
  expect(verbose?.origin).toEqual({ level: "operation", index: 0 });
  const id = d?.parameters.find((p) => p.name === "id");
  expect(id?.required).toBe(true);
  expect(id?.location).toBe("path");
  expect(id?.origin).toEqual({ level: "path", index: 0 });
});
```

（该 describe 顶部的 `doc` 常量已存在，无需改；其中 path 级 parameters 首项是 id、query 的 verbose 被 operation 级覆盖，故 id 的 origin 为 path:0，verbose 为 operation:0。）

- [ ] **Step 2: 运行确认失败**

Run: `vp test src/lib/openapi-ir.test.ts`
预期：FAIL（origin 未定义）。

- [ ] **Step 3: 实现——改接口、toParameterRow、合并循环**

`ParameterRow` 接口（约 201 行）改为：

```ts
export interface ParameterRow {
  name: string;
  location: string;
  type: string;
  required: boolean;
  description: string;
  origin: { level: "path" | "operation"; index: number };
}
```

`toParameterRow`（约 222 行）签名与返回加 origin 参数：

```ts
function toParameterRow(
  doc: Record<string, unknown>,
  raw: unknown,
  origin: { level: "path" | "operation"; index: number },
): ParameterRow | null {
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
    origin,
  };
}
```

`getOperationDetail` 的合并循环（约 275-286 行）改为显式带 level：

```ts
const merged = new Map<string, ParameterRow>();
for (const [level, source] of [
  ["path", item.parameters],
  ["operation", op.parameters],
] as const) {
  if (!Array.isArray(source)) {
    continue;
  }
  for (const [index, raw] of source.entries()) {
    const row = toParameterRow(doc, raw, { level, index });
    if (row) {
      merged.set(`${row.location}:${row.name}`, row);
    }
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `vp test src/lib/openapi-ir.test.ts`
预期：PASS。

- [ ] **Step 5: 全量检查后提交**

Run: `vp check && vp test`
预期：全绿。

```bash
git add src/lib/openapi-ir.ts src/lib/openapi-ir.test.ts
git commit -m "feat: ParameterRow 记录 origin 供回写寻址"
```

---

### Task 3: 编辑对话框（EditOperationDialog + ParameterDialog）

**Files:**

- Create: `src/features/visual/edit-operation-dialog.tsx`
- Create: `src/features/visual/parameter-dialog.tsx`
- Test: `src/features/visual/parameter-dialog.test.tsx`

**Interfaces:**

- Consumes: `Edit/EditPath`（Task 1）、`ParameterRow/OperationDetail/OperationSummary`（IR）。
- Produces:
  - `<EditOperationDialog open onOpenChange operation detail onSubmit={(edits: Edit[]) => void} />`
  - `<ParameterDialog open onOpenChange mode basePath existingCount initial? index? isPathLevel? onSubmit={(edits: Edit[]) => void} />`（`basePath` 为 parameters 数组的 EditPath，如 `["paths","/pets","get","parameters"]`）
  - `type ParameterFormValue = { name: string; location: string; type: string; required: boolean; description: string }`（parameter-dialog.tsx 导出）

- [ ] **Step 1: 拉取 shadcn 组件**

```bash
vp exec shadcn add switch textarea alert-dialog --overwrite
```

预期：生成 `src/components/ui/{switch,textarea,alert-dialog}.tsx`（select/dialog/input/label/button/badge 已存在）。

- [ ] **Step 2: 写失败测试 `src/features/visual/parameter-dialog.test.tsx`**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ParameterDialog } from "./parameter-dialog";

const OP_BASE = ["paths", "/pets", "get", "parameters"];

describe("ParameterDialog", () => {
  it("create 模式提交生成追加 Edit（append 到 basePath 末尾）", () => {
    const onSubmit = vi.fn();
    render(
      <ParameterDialog
        open
        onOpenChange={() => {}}
        mode="create"
        basePath={OP_BASE}
        existingCount={2}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "offset" } });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const edits = onSubmit.mock.calls[0][0];
    expect(edits).toHaveLength(1);
    expect(edits[0].path).toEqual(["paths", "/pets", "get", "parameters", 2]);
    expect(edits[0].value).toMatchObject({ name: "offset", in: "query" });
  });

  it("edit 模式按 basePath+index 生成字段 set Edit", () => {
    const onSubmit = vi.fn();
    render(
      <ParameterDialog
        open
        onOpenChange={() => {}}
        mode="edit"
        basePath={OP_BASE}
        index={1}
        existingCount={2}
        initial={{
          name: "limit",
          location: "query",
          type: "integer",
          required: false,
          description: "",
        }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByLabelText("必填"));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    const edits = onSubmit.mock.calls[0][0];
    const requiredEdit = edits.find(
      (e: { path: (string | number)[] }) => e.path.at(-1) === "required",
    );
    expect(requiredEdit.path).toEqual(["paths", "/pets", "get", "parameters", 1, "required"]);
    expect(requiredEdit.value).toBe(true);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `vp test src/features/visual/parameter-dialog.test.tsx`
预期：FAIL（模块不存在）。

- [ ] **Step 4: 实现 `src/features/visual/parameter-dialog.tsx`**

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Edit } from "@/lib/openapi-edit";

export interface ParameterFormValue {
  name: string;
  location: string;
  type: string;
  required: boolean;
  description: string;
}

const EMPTY: ParameterFormValue = {
  name: "",
  location: "query",
  type: "string",
  required: false,
  description: "",
};

const LOCATIONS = ["query", "path", "header", "cookie"];
const TYPES = ["string", "number", "integer", "boolean", "array", "object"];

export function ParameterDialog({
  open,
  onOpenChange,
  mode,
  basePath,
  existingCount,
  initial,
  index,
  isPathLevel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  basePath: (string | number)[];
  existingCount: number;
  initial?: ParameterFormValue;
  index?: number;
  isPathLevel?: boolean;
  onSubmit: (edits: Edit[]) => void;
}) {
  const [form, setForm] = useState<ParameterFormValue>(initial ?? EMPTY);

  useEffect(() => {
    if (open) {
      setForm(initial ?? EMPTY);
    }
  }, [open, initial]);

  const set = <K extends keyof ParameterFormValue>(key: K, value: ParameterFormValue[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function handleSubmit() {
    if (form.name.trim() === "") {
      return;
    }
    if (mode === "create") {
      onSubmit([
        {
          path: [...basePath, existingCount],
          value: {
            name: form.name.trim(),
            in: form.location,
            required: form.required,
            description: form.description,
            schema: { type: form.type },
          },
        },
      ]);
    } else if (index !== undefined) {
      const row = [...basePath, index];
      onSubmit([
        { path: [...row, "name"], value: form.name.trim() },
        { path: [...row, "in"], value: form.location },
        { path: [...row, "required"], value: form.required },
        { path: [...row, "description"], value: form.description },
        { path: [...row, "schema", "type"], value: form.type },
      ]);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "添加参数" : "编辑参数"}</DialogTitle>
          {isPathLevel && (
            <DialogDescription className="text-destructive">
              该参数定义在路径级，修改将影响此路径下所有接口。
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="param-name">名称</Label>
            <Input
              id="param-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>位置</Label>
            <Select value={form.location} onValueChange={(v) => set("location", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>类型</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="param-required"
              checked={form.required}
              onCheckedChange={(v) => set("required", v)}
            />
            <Label htmlFor="param-required">必填</Label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="param-desc">说明</Label>
            <Textarea
              id="param-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={form.name.trim() === ""} onClick={handleSubmit}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: 运行确认通过**

Run: `vp test src/features/visual/parameter-dialog.test.tsx`
预期：PASS（2 个用例）。

- [ ] **Step 6: 实现 `src/features/visual/edit-operation-dialog.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Edit } from "@/lib/openapi-edit";
import type { OperationDetail, OperationSummary } from "@/lib/openapi-ir";

export function EditOperationDialog({
  open,
  onOpenChange,
  operation,
  detail,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: OperationSummary;
  detail: OperationDetail;
  onSubmit: (edits: Edit[]) => void;
}) {
  const [summary, setSummary] = useState(operation.summary);
  const [description, setDescription] = useState(detail.description);
  const [deprecated, setDeprecated] = useState(operation.deprecated);
  const [tags, setTags] = useState(operation.tags.join(", "));

  useEffect(() => {
    if (open) {
      setSummary(operation.summary);
      setDescription(detail.description);
      setDeprecated(operation.deprecated);
      setTags(operation.tags.join(", "));
    }
  }, [open, operation, detail]);

  function handleSubmit() {
    const base = ["paths", operation.path, operation.method] as const;
    const edits: Edit[] = [];
    if (summary !== operation.summary) {
      edits.push({ path: [...base, "summary"], value: summary });
    }
    if (description !== detail.description) {
      edits.push({ path: [...base, "description"], value: description });
    }
    if (deprecated !== operation.deprecated) {
      if (deprecated) {
        edits.push({ path: [...base, "deprecated"], value: true });
      } else {
        edits.push({ path: [...base, "deprecated"], delete: true });
      }
    }
    const nextTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "");
    if (nextTags.join(",") !== operation.tags.join(",")) {
      if (nextTags.length > 0) {
        edits.push({ path: [...base, "tags"], value: nextTags });
      } else {
        edits.push({ path: [...base, "tags"], delete: true });
      }
    }
    if (edits.length > 0) {
      onSubmit(edits);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑接口</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-summary">摘要</Label>
            <Input id="op-summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-desc">描述</Label>
            <Textarea
              id="op-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="op-deprecated" checked={deprecated} onCheckedChange={setDeprecated} />
            <Label htmlFor="op-deprecated">已废弃</Label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-tags">标签（逗号分隔）</Label>
            <Input id="op-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: 全量检查后提交**

Run: `vp check && vp test`
预期：全绿（EditOperationDialog 暂无单测，装配组件；两 Dialog 暂无消费者属正常）。

```bash
git add src/features/visual/edit-operation-dialog.tsx src/features/visual/parameter-dialog.tsx src/features/visual/parameter-dialog.test.tsx "src/components/ui/switch.tsx" "src/components/ui/textarea.tsx" "src/components/ui/alert-dialog.tsx"
git commit -m "feat: 接口与参数编辑对话框"
```

---

### Task 4: 详情面板编辑入口与 VisualView 冒泡

**Files:**

- Modify: `src/features/visual/operation-detail-panel.tsx`
- Modify: `src/features/visual/visual-view.tsx`

**Interfaces:**

- Consumes: `EditOperationDialog`/`ParameterDialog`（Task 3）、`Edit`（Task 1）。
- Produces: `OperationDetailPanel` 新增可选 `onEdit?: (edits: Edit[]) => void`；`VisualView` 新增可选 `onEdit?: (edits: Edit[]) => void`。

- [ ] **Step 1: operation-detail-panel.tsx 加编辑入口**

在文件顶部 imports 增补：

```tsx
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Edit } from "@/lib/openapi-edit";
import type { ParameterRow } from "@/lib/openapi-ir";
import { EditOperationDialog } from "./edit-operation-dialog";
import { ParameterDialog, type ParameterFormValue } from "./parameter-dialog";
```

`OperationDetailPanel` 的 props 类型加 `onEdit?: (edits: Edit[]) => void;`，函数体开头（`const detail = ...` 之后）加对话框状态：

```tsx
const [editOpOpen, setEditOpOpen] = useState(false);
const [paramDialog, setParamDialog] = useState<
  | { mode: "create" }
  | { mode: "edit"; initial: ParameterFormValue; origin: ParameterRow["origin"] }
  | null
>(null);
const [deleteTarget, setDeleteTarget] = useState<ParameterRow | null>(null);
```

在头部 method+path 那一行右侧加「编辑接口」按钮（仅当 `onEdit` 提供时）：把头部块
`<div className="flex items-center gap-2">...method+path...</div>` 之后、`summary`
之前插入：

```tsx
{
  onEdit && (
    <Button variant="outline" size="sm" className="mt-2" onClick={() => setEditOpOpen(true)}>
      <Pencil className="size-3.5" />
      编辑接口
    </Button>
  );
}
```

「请求参数」表格：表头行末加一列（仅 `onEdit` 时）`<TableHead>操作</TableHead>`；每行末加
操作单元格；path 级行的名称后加「路径级」Badge。把参数 `<TableRow>` 内容改为：

```tsx
<TableRow key={`${p.location}:${p.name}`}>
  <TableCell className="font-mono">
    {p.name}
    {p.origin.level === "path" && (
      <Badge variant="outline" className="ml-2 text-xs">
        路径级
      </Badge>
    )}
  </TableCell>
  <TableCell>{p.location}</TableCell>
  <TableCell className="font-mono">{p.type}</TableCell>
  <TableCell>{p.required ? "是" : "否"}</TableCell>
  <TableCell className="text-muted-foreground">{p.description}</TableCell>
  {onEdit && (
    <TableCell>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label={`编辑参数 ${p.name}`}
          className="text-muted-foreground hover:text-foreground"
          onClick={() =>
            setParamDialog({
              mode: "edit",
              initial: {
                name: p.name,
                location: p.location,
                type: p.type,
                required: p.required,
                description: p.description,
              },
              origin: p.origin,
            })
          }
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`删除参数 ${p.name}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteTarget(p)}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </TableCell>
  )}
</TableRow>
```

「请求参数」section 内、表格之后（仅 `onEdit` 时）加「添加参数」按钮：

```tsx
{
  onEdit && (
    <Button
      variant="outline"
      size="sm"
      className="mt-2"
      onClick={() => setParamDialog({ mode: "create" })}
    >
      <Plus className="size-3.5" />
      添加参数
    </Button>
  );
}
```

组件 return 的最外层 `</ScrollArea>` 之后（同一父 fragment 内）挂对话框。为此把
`return (<ScrollArea ...>...</ScrollArea>)` 包成 fragment，并在其后加：

```tsx
{
  onEdit && (
    <EditOperationDialog
      open={editOpOpen}
      onOpenChange={setEditOpOpen}
      operation={operation}
      detail={detail}
      onSubmit={onEdit}
    />
  );
}
{
  onEdit && paramDialog && (
    <ParameterDialog
      open
      onOpenChange={(next) => {
        if (!next) {
          setParamDialog(null);
        }
      }}
      mode={paramDialog.mode}
      basePath={
        paramDialog.mode === "edit" && paramDialog.origin.level === "path"
          ? ["paths", operation.path, "parameters"]
          : ["paths", operation.path, operation.method, "parameters"]
      }
      existingCount={detail.parameters.length}
      initial={paramDialog.mode === "edit" ? paramDialog.initial : undefined}
      index={paramDialog.mode === "edit" ? paramDialog.origin.index : undefined}
      isPathLevel={paramDialog.mode === "edit" && paramDialog.origin.level === "path"}
      onSubmit={(edits) => {
        onEdit(edits);
        setParamDialog(null);
      }}
    />
  );
}
{
  onEdit && (
    <AlertDialog
      open={deleteTarget !== null}
      onOpenChange={(next) => {
        if (!next) {
          setDeleteTarget(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除参数</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除参数「{deleteTarget?.name}」？
            {deleteTarget?.origin.level === "path" &&
              "该参数定义在路径级，删除将影响此路径下所有接口。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (deleteTarget) {
                const paramsPath =
                  deleteTarget.origin.level === "path"
                    ? ["paths", operation.path, "parameters"]
                    : ["paths", operation.path, operation.method, "parameters"];
                onEdit([{ path: [...paramsPath, deleteTarget.origin.index], delete: true }]);
              }
              setDeleteTarget(null);
            }}
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

寻址要点（上面代码已体现）：path 级参数在 `["paths", path, "parameters"]`（无 method 段），
operation 级在 `["paths", path, method, "parameters"]`。删除、编辑均按 `origin.level` 选择
基路径；create 恒为 operation 级。ParameterDialog 的 `basePath` prop（Task 3 已定义）就是
这个 parameters 数组路径。

- [ ] **Step 2: visual-view.tsx 透传 onEdit**

`VisualView` 的 props 加 `onEdit?: (edits: Edit[]) => void;`（import type `Edit`）。接口 Tab
渲染 `OperationDetailPanel` 处传 `onEdit={onEdit}`：

```tsx
<OperationDetailPanel doc={parsed.doc} operation={current} onEdit={onEdit} />
```

（数据模型 Tab 的 ModelDetailPanel 不传，保持只读。）

- [ ] **Step 3: 全量检查与测试**

Run: `vp check && vp test`
预期：全绿。

- [ ] **Step 4: 提交**

```bash
git add src/features/visual/operation-detail-panel.tsx src/features/visual/visual-view.tsx
git commit -m "feat: 详情面板编辑入口与 onEdit 冒泡"
```

---

### Task 5: 编辑页接入 applyEdits

**Files:**

- Modify: `src/routes/_authed.repos.$owner.$repo.edit.$.tsx`

**Interfaces:**

- Consumes: `applyEdits`（Task 1）、VisualView 的 `onEdit`（Task 4）。

- [ ] **Step 1: 编辑页 VisualView 传 onEdit**

在编辑页顶部 imports 增补：

```tsx
import { applyEdits } from "@/lib/openapi-edit";
```

把 `viewMode === "visual"` 分支的 `<VisualView source={debouncedText} />` 改为：

```tsx
<VisualView
  source={debouncedText}
  onEdit={(edits) => {
    void applyEdits(text, language, edits)
      .then((next) => setText(next))
      .catch(() => toast.error("应用修改失败，请在源码模式确认文档结构"));
  }}
/>
```

（`text`、`language`、`setText`、`toast` 编辑页均已有。回写基于当前 `text` 而非
debouncedText。）

- [ ] **Step 2: 全量检查、测试与 chunk 验证**

Run: `vp check && vp test`
预期：全绿。

Run: `vp build`
预期：构建成功；`yaml` 落入 visual 相关的懒加载 chunk，未进主 index chunk（grep 产物确认
主 chunk 无 yaml 库代码）。在报告记录 chunk 情况与体积。

- [ ] **Step 3: 本地手验（无真实 PAT，编译级）**

`vp dev` 后台启动确认编译无错、守卫重定向正常；验证完停掉 dev server、确认端口无残留
（用工具 run_in_background）。真实编辑→回写→保存链路由用户线上验证。

- [ ] **Step 4: 提交**

```bash
git add "src/routes/_authed.repos.\$owner.\$repo.edit.\$.tsx"
git commit -m "feat: 编辑页接入可视化编辑回写"
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

打开 3.x YAML 文件 → 可视模式 → 接口详情「编辑接口」改 summary → 保存 → 确认 diff 仅
一行且注释/格式保留；「添加参数」新增一个 query 参数并保存；删除一个 operation 级参数；
对 path 级参数确认提示文案并验证影响面。JSON 文件重复改 summary 验证缩进保留。
