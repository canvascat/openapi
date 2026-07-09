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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Edit } from "@/lib/openapi-edit";
import {
  getOperationDetail,
  isRecord,
  type OperationSummary,
  type ParameterRow,
} from "@/lib/openapi-ir";
import { MethodBadge } from "./api-nav";
import { EditOperationDialog } from "./edit-operation-dialog";
import { ParameterDialog, type ParameterFormValue } from "./parameter-dialog";
import { SchemaTree } from "./schema-tree";

export function OperationDetailPanel({
  doc,
  operation,
  onEdit,
}: {
  doc: Record<string, unknown>;
  operation: OperationSummary;
  onEdit?: (edits: Edit[]) => void;
}) {
  const detail = getOperationDetail(doc, operation.method, operation.path);
  const paths = isRecord(doc.paths) ? doc.paths : {};
  const pathItemValue = paths[operation.path];
  const pathItem = isRecord(pathItemValue) ? pathItemValue : {};
  const rawOperationValue = pathItem[operation.method];
  const rawOperation = isRecord(rawOperationValue) ? rawOperationValue : {};
  const operationParameterCount = Array.isArray(rawOperation.parameters)
    ? rawOperation.parameters.length
    : 0;
  const [editOpOpen, setEditOpOpen] = useState(false);
  const [paramDialog, setParamDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; initial: ParameterFormValue; origin: ParameterRow["origin"] }
    | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<ParameterRow | null>(null);
  if (!detail) {
    return <p className="p-6 text-sm text-muted-foreground">未找到该接口的定义。</p>;
  }
  return (
    <>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-6 p-6">
          <div>
            <div className="flex items-center gap-2">
              <MethodBadge method={operation.method} />
              <span className="font-mono text-lg">{operation.path}</span>
              {operation.deprecated && <Badge variant="destructive">已废弃</Badge>}
            </div>
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setEditOpOpen(true)}
              >
                <Pencil className="size-3.5" />
                编辑接口
              </Button>
            )}
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
                    {onEdit && <TableHead>操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.parameters.map((p) => (
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
                  ))}
                </TableBody>
              </Table>
            )}
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setParamDialog({ mode: "create" })}
              >
                <Plus className="size-3.5" />
                添加参数
              </Button>
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
                  <SchemaTree key={operation.id} node={detail.requestBody.schema} />
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
                      <SchemaTree key={`${operation.id}:${r.status}`} node={r.schema} />
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
      {onEdit && (
        <EditOperationDialog
          open={editOpOpen}
          onOpenChange={setEditOpOpen}
          operation={operation}
          detail={detail}
          onSubmit={onEdit}
        />
      )}
      {onEdit && paramDialog && (
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
          existingCount={operationParameterCount}
          initial={paramDialog.mode === "edit" ? paramDialog.initial : undefined}
          index={paramDialog.mode === "edit" ? paramDialog.origin.index : undefined}
          isPathLevel={paramDialog.mode === "edit" && paramDialog.origin.level === "path"}
          onSubmit={(edits) => {
            onEdit(edits);
            setParamDialog(null);
          }}
        />
      )}
      {onEdit && (
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
      )}
    </>
  );
}
