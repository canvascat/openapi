# 接口浏览（可视化接口管理·第一期）— 设计文档

> 日期：2026-07-04 | 状态：已确认 | 路线图：docs/superpowers/specs/2026-07-04-visual-api-management-roadmap.md（3.1）

## 1. 目标

编辑页新增「可视」模式：左侧按 tag 分组的接口树，右侧结构化接口详情（参数表格、
requestBody 与 response 的 schema 树），只读浏览。建立后续三期（数据模型/可视编辑/
调试）复用的 IR 中间结构层。

## 2. 已确认的决策

| 决策点       | 结论                                                                                                                     |
| :----------- | :----------------------------------------------------------------------------------------------------------------------- |
| 模式切换     | 编辑页 header「源码 / 可视」ToggleGroup，本地 state，默认源码；同一份 `text` 状态，切换无刷新                            |
| 接口树位置   | 可视模式内部左侧栏（占满原双栏区域），文件级导航仍走仓库详情页                                                           |
| OpenAPI 版本 | **仅支持 3.x**；检测到 Swagger 2.0 不渲染，提示「可视模式仅支持 OpenAPI 3.x（2.0 转换功能规划中），请使用源码模式」      |
| `$ref`       | 仅本地 `#/components/...`；跨文件 ref 显示为未解析引用名；循环引用 seen 集合截断并标记                                   |
| 懒加载       | `features/visual/` 经 `React.lazy` + Suspense 加载，不进主 chunk                                                         |
| 范围外       | 编辑能力、schemas 独立管理区、搜索过滤、callbacks/webhooks/security 深度展示（原样 JSON 折叠兜底）、OpenAPI 2.0 兼容映射 |

## 3. IR 中间结构层（lib/openapi-ir.ts，纯函数、node 单测）

```ts
export type IrResult =
  | { ok: true; overview: ApiOverview }
  | { ok: false; reason: "not-openapi" | "swagger-2" | "no-paths" };

export interface ApiOverview {
  version: string; // openapi 字段原文，如 "3.1.0"
  title: string; // info.title ?? "未命名文档"
  groups: TagGroup[];
}
export interface TagGroup {
  tag: string;
  operations: OperationSummary[];
}
// 无 tag 的接口归「未分组」（置于最后）；多 tag 接口在每个组各出现一次
export interface OperationSummary {
  id: string; // `${method} ${path}`
  method: string; // 小写：get/post/put/delete/patch/head/options/trace
  path: string;
  summary: string; // summary ?? ""
  deprecated: boolean;
  tags: string[];
}

export function buildApiOverview(doc: Record<string, unknown>): IrResult;
// 判定顺序：无 openapi 字段但有 swagger 字段 → "swagger-2"；
// 无 openapi 字段 → "not-openapi"；无 paths 或为空 → "no-paths"。

export interface OperationDetail {
  description: string;
  parameters: ParameterRow[]; // 合并 path 级 + operation 级（同名同 in 以 operation 级覆盖）
  requestBody: { mediaType: string; schema: SchemaNode | null } | null; // 取第一个 media type
  responses: ResponseEntry[]; // 按状态码升序，default 置尾
}
export interface ParameterRow {
  name: string;
  location: string; // path/query/header/cookie
  type: string; // schema.type ?? "unknown"
  required: boolean;
  description: string;
}
export interface ResponseEntry {
  status: string; // "200" | "default" 等
  description: string;
  schema: SchemaNode | null; // 取第一个 media type 的 schema
}

export function getOperationDetail(
  doc: Record<string, unknown>,
  method: string,
  path: string,
): OperationDetail | null; // 找不到该 operation 返回 null

export interface SchemaNode {
  name: string; // 属性名或 ""（根）
  type: string; // object/array/string/number/integer/boolean/null/
  // 组合关键字（oneOf/anyOf/allOf 显示为该关键字）/unknown
  required: boolean; // 相对父对象的 required 列表
  description: string;
  enumValues: string[] | null;
  refName: string | null; // $ref 目标短名（components/schemas/Pet → "Pet"）
  circular: boolean; // 循环引用截断标记
  children: SchemaNode[] | null; // object properties / array items（单元素）/ 组合分支
}

export function resolveSchema(
  doc: Record<string, unknown>,
  schema: unknown,
  seenRefs?: Set<string>,
  depth?: number,
): SchemaNode;
// 本地 $ref 查 components；未知/跨文件 ref → type "unknown" + refName 原样；
// 循环 → circular: true 且 children: null；深度上限 8 层后截断为 children: null。
```

## 4. UI 组件（features/visual/，全部懒加载）

- **`visual-view.tsx`**：装配层。props `{ source: string }`——内部
  `parseDocument(source)` + `buildApiOverview`；三种 `ok: false` 各渲染对应中文降级
  提示（含「请使用源码模式」引导文案）；正常时左 `ApiNav` + 右 `OperationDetailPanel`，
  内部 `selected: OperationSummary | null` 状态（初始选第一个接口）。
- **`api-nav.tsx`**：`<ApiNav groups selectedId onSelect />`。tag 分组 Collapsible
  （默认全展开），条目 = method 徽标 + path + summary 截断；deprecated 显示删除线；
  选中态高亮。method 徽标配色：GET 绿 / POST 蓝 / PUT 橙 / DELETE 红 / PATCH 紫 /
  其他灰。
- **`operation-detail-panel.tsx`**：`<OperationDetailPanel doc operation />`——内部
  `getOperationDetail`；头部（method 徽标 + path + summary + deprecated Badge）、
  描述、「请求参数」表格、「请求体」（mediaType 标注 + SchemaTree）、「响应」
  （按状态码分块，各含描述 + SchemaTree）。detail 为 null 或区块为空时显示
  「无」占位。
- **`schema-tree.tsx`**：`<SchemaTree node />` 递归渲染：名称、类型（着色徽标）、
  必填红星、refName 徽标、描述、枚举值列表；object/array 子级 Collapsible（默认
  展开两层，更深默认折叠）；`circular` 显示「↻ 循环引用已截断」。

## 5. 编辑页集成

`src/routes/_authed.repos.$owner.$repo.edit.$.tsx`：

- header 中部加 ToggleGroup「源码 / 可视」（state `viewMode: "code" | "visual"`，
  默认 `"code"`；lucide 图标 Code / LayoutList）。
- `viewMode === "visual"` 时，原双栏 grid（Monaco + 问题面板 + swagger 预览）整体
  替换为 `<Suspense fallback={加载提示}><VisualView source={debouncedText} /></Suspense>`
  （`VisualView = lazy(() => import("@/features/visual/visual-view"))`）。
- 保存、历史按钮在两种模式下均可用；dirty 徽标行为不变（可视模式下仍可保存
  在源码模式做的未提交修改）。
- 切回源码：Monaco 重建，`text` state 保留（text 为唯一事实源）。

## 6. 错误与边界

- YAML 解析失败：可视区域提示「文档解析失败，请回到源码模式修正」+ 错误信息。
- `swagger-2` / `not-openapi` / `no-paths`：各自的中文提示（见 §3 判定）。
- 编辑中切换：`source` 用 `debouncedText`，可视视图最多滞后 500ms，与 swagger
  预览一致。
- 大文档：纯浏览渲染，schema 默认展开两层控制节点数；不加虚拟滚动（YAGNI，
  出现真实性能问题再说）。

## 7. 新增依赖与组件

- 无新 npm 依赖。
- shadcn 组件：`collapsible`、`table`、`tabs`（如现缺则 `vp exec shadcn add`；
  ToggleGroup/Badge/ScrollArea 已有）。

## 8. 测试策略

- `lib/openapi-ir.ts` 单测（重点，node 环境）：版本判定三分支、tag 分组（无 tag/
  多 tag）、参数合并去重覆盖、requestBody/response 取首 media type、`$ref` 解析、
  循环引用截断、深度上限、oneOf/anyOf/allOf 类型标注。
- `schema-tree` / `api-nav` 渲染测试（jsdom）：method 徽标、deprecated 删除线、
  选中回传、必填星标、循环截断文案。
- 整页交互（模式切换、选中联动）：`vp dev` 手动 + 用户线上验证。

## 9. 上线

合并 main 推送自动部署；`vp build` 确认 `features/visual` 独立 chunk。
