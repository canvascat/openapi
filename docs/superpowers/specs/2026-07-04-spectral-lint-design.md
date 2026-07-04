# Spectral 实时校验 — 设计文档（二期·子项目 3）

> 日期：2026-07-04 | 状态：已确认 | 前置：MVP、部署上线、版本时间轴均已上线（https://canvascat.github.io/openapi/）

## 1. 目标

编辑页对当前文档实时跑 Spectral OpenAPI 规范校验：左栏 Monaco 行内波浪线 +
悬停提示，底部可折叠问题面板列出违规项、点击跳转。非阻塞——只提示不拦截保存。

## 2. 已确认的决策

| 决策点   | 结论                                                                                                   |
| :------- | :----------------------------------------------------------------------------------------------------- |
| 展示方式 | Monaco 行内 marker（`setModelMarkers`）+ 底部可折叠问题面板（点击跳转）                                |
| 规则集   | 内置 `spectral:oas`（官方 OpenAPI 规范规则集，自动识别 2/3），不读仓库自定义规则                       |
| 保存门禁 | 不阻止保存，仅提示（诊断本身可能误报；回滚/草稿场景需放行）                                            |
| 运行位置 | 主线程 + 500ms 防抖（复用现有 `useDebouncedValue`）；Spectral 包动态 `import()` 懒加载，不进首屏 chunk |
| 范围外   | 自定义 `.spectral.yaml`、Web Worker、保存门禁、quick-fix                                               |

## 3. 模块结构（features/lint/）

新建 `src/features/lint/`，与现有 `features/{auth,explorer,editor,history}` 分层一致：

- **`diagnostics.ts`**（核心纯函数，无 React/Spectral 运行时依赖，可 node 单测）：
  - `interface LintDiagnostic { line: number; column: number; endLine: number; endColumn: number; message: string; code: string; severity: "error" | "warning" | "info" }`（行列 1-based）
  - `type SpectralSeverity = 0 | 1 | 2 | 3`（Spectral：0=error,1=warn,2=info,3=hint）
  - `mapSeverity(s: SpectralSeverity): LintDiagnostic["severity"]`（0→error，1→warning，2/3→info）
  - `interface RawResult { code: string | number; message: string; severity: number; range: { start: { line: number; character: number }; end: { line: number; character: number } } }`
  - `mapSpectralResult(raw: RawResult): LintDiagnostic`（range 0-based → 1-based：line+1、character+1；code 转字符串；缺 end 时用 start 兜底）
  - `severityRank(s): number`（error=0,warning=1,info=2，供面板排序/计数）
- **`spectral.ts`**（Spectral 运行时封装）：
  - `lintDocument(source: string): Promise<LintDiagnostic[]>`——内部懒建单例 Spectral 实例（`@stoplight/spectral-core` 的 `Spectral` + `oas` ruleset），`spectral.run(source)` 后 `.map(mapSpectralResult)`。空串或纯空白直接返回 `[]`。
- **`use-lint.ts`**：`useLint(source: string): { diagnostics: LintDiagnostic[]; status: "idle" | "linting" | "error" }`——`useEffect` 监听 source 跑 `lintDocument`，带请求竞态保护（忽略过期结果）；catch 置 `error` 态。
- **`problems-panel.tsx`**：`<ProblemsPanel diagnostics status onGoto={(line, column) => void} />`——可折叠底部条，标题 `N 个问题`（error/warning 分色计数），展开列表每项：severity 图标、message、`code` 徽标、`Ln{line}:Col{column}`，点击调 `onGoto`。空诊断显示「无校验问题」；`status === "error"` 显示「校验器异常」。

## 4. 数据流

编辑器 `text` → 现有 `useDebouncedValue(text, 500)` 得 `debouncedText`（swagger 预览已用）→
`useLint(debouncedText)` 跑 Spectral → `diagnostics` → 两处消费：

1. `useEffect` 里经 `mapMarker` 转 Monaco marker，`monaco.editor.setModelMarkers(model, "spectral", markers)`；
2. `<ProblemsPanel diagnostics />` 渲染列表。

`mapMarker(d: LintDiagnostic, monaco): editor.IMarkerData` 放在编辑页（依赖 monaco 命名空间的
`MarkerSeverity`，不进纯函数模块）：severity error→Error(8)、warning→Warning(4)、info→Info(2)。

## 5. 编辑页集成（唯一改动的现有文件）

`src/routes/_authed.repos.$owner.$repo.edit.$.tsx`：

- `onMount` 保存 `editorRef`/`monacoRef`（`useRef`）；
- `const { diagnostics, status } = useLint(debouncedText);`（debouncedText 已存在）；
- `useEffect([diagnostics])`：取当前 model，`setModelMarkers(model, "spectral", diagnostics.map((d) => mapMarker(d, monaco)))`；
- 左列布局由单一 Editor 改为 `grid grid-rows-[1fr_auto]`：上格 Editor，下格 `<ProblemsPanel onGoto={(line, column) => { editorRef.current?.revealLineInCenter(line); editorRef.current?.setPosition({ lineNumber: line, column }); editorRef.current?.focus(); }} />`；
- 右栏 swagger 预览不动；历史抽屉、保存流不动。

## 6. 错误处理

- Spectral 运行异常：`useLint` 置 `status="error"`，面板显示「校验器异常，暂不可用」，编辑不受影响、marker 清空。
- 懒加载失败：同上归入 `error` 态（`lintDocument` 内部 import 失败会抛错被 catch）。
- 解析失败（YAML 语法错）：`spectral.run` 对无法解析的源通常返回解析类诊断；为避免与右栏 swagger 的「解析失败」重复，`spectral.ts` 在调用前不额外拦截，交由 Spectral 输出（其解析诊断带准确 range，比 swagger 兜底更精确）。
- 空文档：返回 `[]`，面板显示「无校验问题」。

## 7. 新增依赖

`@stoplight/spectral-core`、`@stoplight/spectral-rulesets`（提供 `oas`）。如源码级 range
需要额外 parser，加 `@stoplight/spectral-parsers`。均经 `spectral.ts` 动态 `import()`，
构建产物中独立 chunk，不进主 bundle（实现时用 `vp build` 确认 chunk 拆分）。

> 实现注意：Spectral 浏览器端确切 API（`Spectral`/`Document`/`oas` 导入路径、
> `run` 返回结构、severity 枚举值）以实现时查阅当前官方文档为准；本 spec 的字段名
> （range.start.line、severity 数字）基于 Spectral v6 约定，如版本差异以文档为准并在
> `diagnostics.ts` 的映射层吸收。

## 8. 测试策略

- `diagnostics.ts` 单测（node 环境）：`mapSeverity` 全分支、`mapSpectralResult` 的
  0→1 转换与 code 字符串化与 end 兜底、`severityRank` 排序。
- `problems-panel.tsx` 渲染测试（jsdom）：计数文案、空态、error 态、点击项回传
  `onGoto(line, column)`。
- Spectral 实际校验、Monaco marker、跳转：`vp dev` 手动验证（无真实 PAT 时验证
  编译与组件装配，真实交互由用户线上验证）。

## 9. 上线

合并 main 推送后由既有 GitHub Actions 工作流自动部署。观察构建产物中 Spectral 是否
独立成 chunk（未污染主 bundle）、以及 Vite Task 缓存命中情况。
