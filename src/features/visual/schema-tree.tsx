import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SchemaNode } from "@/lib/openapi-ir";

const typeColor: Record<string, string> = {
  object: "text-blue-600",
  array: "text-purple-600",
  string: "text-green-600",
  number: "text-orange-600",
  integer: "text-orange-600",
  boolean: "text-pink-600",
};

export function SchemaTree({ node, depth = 0 }: { node: SchemaNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children !== null && node.children.length > 0;

  return (
    <div className="text-sm">
      <div className="flex items-start gap-2 py-0.5">
        {hasChildren ? (
          <button
            type="button"
            className="mt-0.5 shrink-0 text-muted-foreground"
            aria-label={open ? "折叠" : "展开"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {node.name !== "" && (
          <span className="font-mono">
            {node.name}
            {node.required && <span className="text-destructive">*</span>}
          </span>
        )}
        <span
          className={cn(
            "font-mono text-xs leading-5",
            typeColor[node.type] ?? "text-muted-foreground",
          )}
        >
          {node.type}
        </span>
        {node.refName !== null && (
          <Badge variant="outline" className="font-mono text-xs">
            {node.refName}
          </Badge>
        )}
        {node.circular && <span className="text-xs text-muted-foreground">↻ 循环引用已截断</span>}
        {node.description !== "" && (
          <span className="truncate text-muted-foreground">{node.description}</span>
        )}
      </div>
      {node.enumValues !== null && (
        <div className="pl-6 text-xs text-muted-foreground">枚举：{node.enumValues.join("、")}</div>
      )}
      {hasChildren && open && (
        <div className="ml-1.5 border-l pl-4">
          {node.children?.map((child, i) => (
            <SchemaTree key={`${child.name}:${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
