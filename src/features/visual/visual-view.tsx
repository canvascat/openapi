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
