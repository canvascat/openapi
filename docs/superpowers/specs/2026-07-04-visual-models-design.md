# 数据模型管理（可视化接口管理·第二期）— 设计文档

> 日期：2026-07-04 | 状态：已确认 | 路线图：docs/superpowers/specs/2026-07-04-visual-api-management-roadmap.md（3.2）| 前置：第一期接口浏览已上线（984739c）

## 1. 目标

可视模式新增「数据模型」区：`components/schemas` 列表（含被引用计数）、单个 schema
的字段树（复用 SchemaTree）、「被哪些接口引用」反向索引，点击引用条目联动跳转到
对应接口详情。

## 2. 已确认的决策

| 决策点       | 结论                                                                                                              |
| :----------- | :---------------------------------------------------------------------------------------------------------------- |
| 入口布局     | 可视模式左栏顶部 Tabs「接口 / 数据模型」（shadcn tabs）；接口 Tab 维持现状                                        |
| 反向引用点击 | 联动跳转：切回「接口」Tab 并选中该接口                                                                            |
| 顺手修复     | 上期终审 Minor #1——`operation-detail-panel.tsx` 的 SchemaTree 消费处加 `key={operation.id}`，消除折叠态切接口残留 |
| 范围外       | schema 间相互引用图谱、间接引用追踪（operation → components/responses/X → schema Y）、schema 搜索、编辑能力       |

## 3. IR 层新增（lib/openapi-ir.ts 末尾追加，纯函数 TDD）

```ts
export function listSchemaNames(doc: Record<string, unknown>): string[];
// components.schemas 的键，保持定义顺序；无 components/schemas → []

export function buildSchemaRefIndex(doc: Record<string, unknown>): Record<string, string[]>;
// schema 名 → 引用它的 operation id 列表（"get /pets" 格式，去重、按遍历出现序）。
// 收集规则：
//   1) 递归遍历每个 operation 对象子树，收集所有 `$ref` 字符串中前缀为
//      "#/components/schemas/" 的目标名，归属到该 operation id；
//   2) path 级 parameters 子树的引用归属到该 path 下全部 operations；
//   3) 仅统计 components/schemas 中实际存在的名字（悬空引用不入索引）；
//   4) 间接引用不追（见范围外）。
```

## 4. UI 组件（features/visual/ 内新增两个 + 装配层改造）

- **`model-nav.tsx`**：`<ModelNav names={string[]} refIndex={Record<string, string[]>} selected={string | null} onSelect={(name) => void} />`。
  列表项 = schema 名（font-mono）+ 被引用计数 Badge（`refIndex[name]?.length ?? 0`）；
  选中高亮；空列表显示「该文档没有定义数据模型」。
- **`model-detail-panel.tsx`**：`<ModelDetailPanel doc={Record<string, unknown>} name={string} refIndex onGotoOperation={(id: string) => void} />`。
  标题（name）+ `SchemaTree`（`resolveSchema(doc, schemas[name])`，key={name} 避免
  折叠态跨模型残留）+「被以下接口引用」区：每条 = MethodBadge + path 按钮
  （从 id 拆出 method/path），点击回传 `onGotoOperation(id)`；无引用显示
  「未被任何接口直接引用」。
- **`visual-view.tsx` 改造**：
  - 左栏顶部（标题下方）加 Tabs「接口 / 数据模型」，state `activeTab: "apis" | "models"`；
  - `models` Tab：左列 `ModelNav` + 右侧 `ModelDetailPanel`（`selectedModel` 状态，
    初始选第一个 schema）；
  - `useMemo` 计算 `listSchemaNames` / `buildSchemaRefIndex`（依赖 parsed.doc）；
  - 联动：`onGotoOperation(id)` → 在 `all` 中按 id 查找 OperationSummary →
    `setSelected(op)` + `setActiveTab("apis")`；找不到（编辑中被删）则 toast 级别
    以内的静默降级（直接切 Tab 不选中，走既有回退第一个接口逻辑）。

## 5. 错误与边界

- 无 `components/schemas`：数据模型 Tab 显示空态文案，不报错。
- schema 值非法（非对象）：`resolveSchema` 已有 unknown 兜底，正常渲染。
- 编辑中文档变化：names/refIndex 随 `parsed.doc` 的 useMemo 重算；`selectedModel`
  失效时回退第一个 schema（与接口侧 selected 回退同模式）。
- 引用联动目标接口已不存在：切 Tab 后走既有 `all[0]` 回退。

## 6. 新增依赖与组件

- 无新 npm 依赖。
- shadcn 组件：`tabs`（`vp exec shadcn add tabs --overwrite`）。

## 7. 测试策略

- `listSchemaNames` / `buildSchemaRefIndex` 单测（node）：定义序保持、无 components
  空数组；直接引用（requestBody/response/参数 schema 内 `$ref`）、path 级参数归属
  全部 operations、同 schema 多处引用去重、悬空引用不入索引；**语义敲定**：refIndex
  只含有引用的 schema 键（无引用 schema 不出现在索引中），消费端一律 `refIndex[name] ?? []`。
- `model-nav` 渲染测试（jsdom）：名称、计数徽标、选中回传、空态文案。
- Tabs 切换、联动跳转：`vp dev` 手动 + 用户线上验证。

## 8. 上线

合并 main 推送自动部署；确认 visual chunk 体积增长在合理范围（新增两个轻组件）。
