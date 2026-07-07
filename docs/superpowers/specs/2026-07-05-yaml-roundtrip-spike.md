# YAML 保格式回写技术 Spike — 结论

> 日期：2026-07-05 | 结论：**可行，选型 `yaml`（eemeli/yaml）v2 Document API** | 服务于：可视化编辑期（路线图 3.3）

## 1. 验证目标

可视化编辑要把表单改动回写到 YAML 源文本且走现有 Git 保存流。核心风险：回写是否
破坏手写格式（注释/引号风格/键顺序/flow 风格/块标量/锚点），若破坏则每次可视编辑
都会产生大量噪音 diff，摧毁 code review 体验。

## 2. 验证方法与结果

scratchpad 独立环境，`yaml@2.9.0`，`parseDocument` → `setIn/deleteIn` → `toString`。
两轮共 16 项断言全部通过：

| 场景                                                | 结果                                         |
| :-------------------------------------------------- | :------------------------------------------- |
| 顶部注释 / 行尾注释 / flow 内注释                   | ✅ 保留                                      |
| 双引号 / 单引号风格                                 | ✅ 保留（未被改写的节点不动）                |
| flow 映射 `{ type: integer }` / flow 序列 `[宠物]`  | ✅ 风格保留（空白微调 `[ 宠物 ]`）           |
| 键顺序                                              | ✅ 保留；新增键追加到所属映射末尾            |
| 块标量 `\|`（多行 description）                     | ✅ 风格保留                                  |
| 锚点 `&common` / 别名 `*common`                     | ✅ 保留                                      |
| 修改字符串 / 布尔、新增字段、删除字段、改 flow 内值 | ✅ 均精准生效                                |
| 长行折行                                            | ✅ `toString({ lineWidth: 0 })` 可禁用重折行 |

**已知无害偏差**：注释前多个空格会归一为单空格；flow 集合的内部空白会标准化
（`[x]`→`[ x ]`）。属首次编辑时的一次性微噪音，可接受。

## 3. 选型结论

- **采用 `yaml` 包 Document API** 做 YAML 文件的保格式回写：`parseDocument(text)`
  持有 CST 级文档对象，`setIn/deleteIn/addIn`（JSON path 数组寻址）修改后
  `toString({ lineWidth: 0 })` 输出。**不用**「js-yaml 解析→改对象→重序列化」
  方案（会丢全部注释与格式）。
- 新增 npm 依赖：`yaml`（~200KB，可与可视编辑组件同 chunk 懒加载）。js-yaml
  仍保留用于只读解析（现有链路不动）。
- **JSON 文件**（`.json`）：无注释问题，走 `JSON.parse` → 修改 → `JSON.stringify`
  （探测原缩进 2/4/tab），键顺序天然保留。两种文件类型在回写层各走一条路径。
- 编辑寻址：可视编辑的表单字段 → JSON path 数组（如
  `["paths", "/pets", "get", "summary"]`）→ `doc.setIn(path, value)`。与 IR 层
  现有的 method/path/id 结构天然对齐，**IR 无需携带源码行号**（此前路线图猜测
  需要 node→行号映射，spike 证明按 path 寻址即可，行号仅在需要「跳到源码」时
  另行处理）。

## 4. 对可视化编辑期的约束输出

1. 编辑操作全部收敛为 `(jsonPath, newValue | DELETE)` 原语，回写层做成纯函数：
   `applyEdit(source: string, path: (string | number)[], value: unknown | DELETE): string`，
   可 node 单测（round-trip 断言）。
2. 表单提交 → `applyEdit` → `setText(newSource)` → 现有 dirty/保存/409 链路零改动。
3. 用户在源码模式的手改与可视编辑天然串行（同一份 text state，无并行合流问题）。
4. `lineWidth: 0` 固定，避免长 description 被重新折行。

## 5. Spike 残留物

验证脚本在会话 scratchpad（不入库）。本文档为唯一产出。
