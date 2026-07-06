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
