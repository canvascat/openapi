import { useMemo, useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseDocument } from "@/lib/openapi";
import type { Edit } from "@/lib/openapi-edit";
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

export default function VisualView({
  source,
  onEdit,
}: {
  source: string;
  onEdit?: (edits: Edit[]) => void;
}) {
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
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
      <ResizablePanel defaultSize={28} minSize={20} maxSize={42} className="min-w-0">
        <div className="flex h-full min-h-0 flex-col">
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
      </ResizablePanel>
      <ResizableHandle aria-label="调整可视模式侧栏宽度" withHandle />
      <ResizablePanel defaultSize={72} minSize={45} className="min-w-0">
        <div className="h-full min-h-0">
          {activeTab === "apis" ? (
            current ? (
              <OperationDetailPanel doc={parsed.doc} operation={current} onEdit={onEdit} />
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
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
