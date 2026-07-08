# 可视化编辑第一期（元信息 + 参数行）— 设计文档

> 日期：2026-07-05 | 状态：已确认 | 路线图：docs/superpowers/specs/2026-07-04-visual-api-management-roadmap.md（3.3）| 前置：接口浏览（984739c）、数据模型（f68af0e）已上线；YAML 回写 spike 结论见 2026-07-05-yaml-roundtrip-spike.md

## 1. 目标

可视模式的接口详情页开放编辑：接口元信息（summary/description/deprecated/tags）与
参数行（增/删/改），通过对话框表单收集改动，回写到 YAML/JSON 源文本（保格式），
走现有 dirty/保存/409 链路。schema 字段编辑留下一期。

## 2. 已确认的决策

| 决策点   | 结论                                                                                                                          |
| :------- | :---------------------------------------------------------------------------------------------------------------------------- |
| 编辑范围 | 接口元信息 + 参数行；不含 schema 字段、requestBody/response、增删整个接口                                                     |
| 交互形态 | 对话框编辑（Dialog 表单，确认才回写）；删除用 AlertDialog 二次确认                                                            |
| 回写选型 | YAML 走 `yaml` 包 Document API（spike 已验证保格式）；JSON 走 JSON.parse/stringify（探测缩进）。`yaml` 随 visual chunk 懒加载 |
| 保存链路 | 零改动：回写产出新 source → `setText` → 现有 dirty/SaveDialog/mutation/409                                                    |
| 范围外   | schema 字段编辑、requestBody/response 编辑、增删接口、tags 自动补全、撤销/重做                                                |

## 3. 回写层 lib/openapi-edit.ts（纯函数，TDD 重点）

```ts
export type EditPath = (string | number)[];
export type Edit =
  | { path: EditPath; value: unknown } // 设值（含新增：path 指向不存在的键/新数组索引）
  | { path: EditPath; delete: true }; // 删除键或数组元素

export async function applyEdits(
  source: string,
  language: "yaml" | "json",
  edits: Edit[],
): Promise<string>;
// YAML：动态 import("yaml") → parseDocument(source) → 逐条 setIn/deleteIn/addIn →
//   toString({ lineWidth: 0 })。数组末尾追加用 addIn(parentPath, value)（path 末位省略）。
// JSON：JSON.parse → 结构化 clone 上按 path 改/删 → JSON.stringify(obj, null, detectIndent(source))。
//   detectIndent：扫描首个缩进行，返回 2/4 或 "\t"，默认 2。
// 失败（path 无法定位、解析异常）→ throw，调用方 catch 提示不写入。
```

**数组语义**：删除参数 = `{ path: [...parentArray, index], delete: true }`；新增参数 =
`{ path: [...parentArray, currentLength], value: newParam }`（yaml 的 addIn 对省略末位
索引会 push；JSON 侧按索引赋值到末尾）。实现层统一：Edit 的 path 显式带目标索引，
回写层判断该索引是否越界决定 set vs push（YAML 用 addIn，JSON 用 splice/赋值）。

## 4. IR 增强（lib/openapi-ir.ts）

`ParameterRow` 增加回写寻址所需的来源信息：

```ts
export interface ParameterRow {
  name: string;
  location: string;
  type: string;
  required: boolean;
  description: string;
  origin: { level: "path" | "operation"; index: number }; // 新增
}
```

- `origin.level`：该参数定义在 path 级还是 operation 级。
- `origin.index`：在其原始数组（`paths[p].parameters` 或 `paths[p][m].parameters`）中的下标。
- 合并去重时，operation 级覆盖 path 级——被覆盖的 path 级行不出现在 detail.parameters
  里，故每个可见行的 origin 唯一确定其源码位置。
- 现有 `getOperationDetail` 的参数合并逻辑相应记录 origin；既有测试断言需同步更新
  （新增字段）。

## 5. UI 组件（features/visual/）

- **`edit-operation-dialog.tsx`**：`<EditOperationDialog open onOpenChange operation detail onSubmit={(edits: Edit[]) => void} />`。
  表单字段：summary（Input）、description（Textarea）、deprecated（Switch）、
  tags（Input，逗号分隔）。提交时对比原值只为**变化的字段**生成 Edit（path 形如
  `["paths", path, method, "summary"]`；tags 空则 delete 该键；deprecated=false 时
  delete 键以保持文档简洁）。
- **`parameter-dialog.tsx`**：`<ParameterDialog open onOpenChange mode={"create" | "edit"} initial? operationPath operationMethod origin? onSubmit={(edits: Edit[]) => void} />`。
  字段：name（Input）、location（Select：query/path/header/cookie）、type（Select：
  string/number/integer/boolean/array/object）、required（Switch）、description
  （Textarea）。create → 生成追加 Edit（append 到 operation 级 parameters，
  必要时先建空数组）；edit → 按 origin 生成该行各字段的 set/delete Edit。
- **`operation-detail-panel.tsx` 改造**：头部加「编辑接口」按钮（开
  EditOperationDialog）；参数表格加操作列（每行「编辑」「删除」图标）+ 表格下方
  「添加参数」按钮；path 级参数行加「路径级」Badge；删除/编辑 path 级参数时对话框
  顶部提示「该参数定义在路径级，修改将影响此路径下所有接口」。所有 Dialog 的
  onSubmit 汇聚为一个 `onEdit(edits)` 冒泡到 VisualView。
- **`visual-view.tsx` 改造**：新增 prop `onEdit?: (edits: Edit[]) => void`，透传给
  OperationDetailPanel；只在接口 Tab 生效（数据模型 Tab 本期只读）。

## 6. 编辑页集成（src/routes/\_authed.repos.$owner.$repo.edit.$.tsx）

VisualView 的 `onEdit` 回调：

```ts
onEdit={(edits) => {
  applyEdits(text, language, edits)
    .then((next) => setText(next))
    .catch(() => toast.error("应用修改失败，请在源码模式确认文档结构"));
}}
```

`language`（"yaml" | "json"）编辑页已有（按扩展名）。回写基于**当前 `text`**（非
debounced），避免防抖窗口内的竞态；setText 后 dirty 自然置真。

## 7. 错误与边界

- 回写失败（path 失效/解析异常）：toast 提示，不改 text。
- 可视编辑与源码手改串行（同一 text 状态，无并行）。
- path 级参数编辑：明确提示影响面；不阻止（用户知情即可）。
- 新增参数与已有同名同位置冲突：本期不做去重校验（OpenAPI 允许，交由 Spectral 校验
  提示）。
- 数据模型 Tab、只读浏览：无 onEdit 时零行为变化。

## 8. 新增依赖

`yaml`（~200KB）。经 `openapi-edit.ts` 动态 `import("yaml")` 引入，随 visual chunk
懒加载，不进主 bundle。js-yaml 保留用于只读解析。

## 9. 测试策略

- `lib/openapi-edit.ts` round-trip 单测（node，重点）：YAML 改字符串/布尔保留注释与
  引号风格、新增键、删除键、数组元素删除、数组追加；JSON 缩进探测（2/4/tab）与
  增删改；path 失效抛错。
- `getOperationDetail` 的 origin 字段单测（path 级/operation 级/覆盖场景）。
- `edit-operation-dialog` / `parameter-dialog` 渲染 + 提交回传 Edit 的测试（jsdom）：
  只为变化字段生成 Edit、tags 逗号拆分、create/edit 模式路径。
- 端到端（改 summary→保存→diff 仅一行、加参数、删 path 级参数）：`vp dev` 手动 +
  用户线上验证。

## 10. 上线

合并 main 推送自动部署；`vp build` 确认 `yaml` 落入 visual chunk（不进主 bundle）。
