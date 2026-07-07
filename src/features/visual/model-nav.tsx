import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function ModelNav({
  names,
  refIndex,
  selected,
  onSelect,
}: {
  names: string[];
  refIndex: Record<string, string[]>;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  if (names.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">该文档没有定义数据模型。</p>;
  }
  return (
    <ScrollArea className="h-full">
      <ul className="flex flex-col gap-0.5 p-2">
        {names.map((name) => (
          <li key={name}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent",
                selected === name && "bg-accent",
              )}
              onClick={() => onSelect(name)}
            >
              <span className="truncate font-mono">{name}</span>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {(refIndex[name] ?? []).length}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
