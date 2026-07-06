import { ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { OperationSummary, TagGroup } from "@/lib/openapi-ir";

const methodColor: Record<string, string> = {
  get: "bg-green-600",
  post: "bg-blue-600",
  put: "bg-orange-500",
  delete: "bg-red-600",
  patch: "bg-purple-600",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-block w-14 shrink-0 rounded px-1 text-center font-mono text-xs font-bold text-white",
        methodColor[method] ?? "bg-gray-500",
      )}
    >
      {method}
    </span>
  );
}

export function ApiNav({
  groups,
  selectedId,
  onSelect,
}: {
  groups: TagGroup[];
  selectedId: string | null;
  onSelect: (operation: OperationSummary) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <nav className="flex flex-col gap-2 p-2">
        {groups.map((group) => (
          <Collapsible key={group.tag} defaultOpen>
            <CollapsibleTrigger className="group flex w-full items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent">
              <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
              <span>{group.tag}</span>
              <span>({group.operations.length})</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="flex flex-col gap-0.5">
                {group.operations.map((op) => (
                  <li key={`${group.tag}:${op.id}`}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent",
                        selectedId === op.id && "bg-accent",
                      )}
                      onClick={() => onSelect(op)}
                    >
                      <MethodBadge method={op.method} />
                      <span
                        className={cn(
                          "shrink-0 font-mono text-xs",
                          op.deprecated && "line-through opacity-60",
                        )}
                      >
                        {op.path}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{op.summary}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>
    </ScrollArea>
  );
}
