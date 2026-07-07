import { ScrollArea } from "@/components/ui/scroll-area";
import { isRecord, resolveSchema } from "@/lib/openapi-ir";
import { MethodBadge } from "./api-nav";
import { SchemaTree } from "./schema-tree";

export function ModelDetailPanel({
  doc,
  name,
  refIndex,
  onGotoOperation,
}: {
  doc: Record<string, unknown>;
  name: string;
  refIndex: Record<string, string[]>;
  onGotoOperation: (id: string) => void;
}) {
  const components = isRecord(doc.components) ? doc.components : {};
  const schemas = isRecord(components.schemas) ? components.schemas : {};
  const node = resolveSchema(doc, schemas[name]);
  const refs = refIndex[name] ?? [];

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-6">
        <h2 className="font-mono text-lg font-semibold">{name}</h2>

        <section>
          <h3 className="mb-2 text-sm font-semibold">字段结构</h3>
          <SchemaTree key={name} node={node} />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">被以下接口引用</h3>
          {refs.length === 0 ? (
            <p className="text-sm text-muted-foreground">未被任何接口直接引用。</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {refs.map((id) => {
                const spaceIndex = id.indexOf(" ");
                const method = id.slice(0, spaceIndex);
                const path = id.slice(spaceIndex + 1);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
                      onClick={() => onGotoOperation(id)}
                    >
                      <MethodBadge method={method} />
                      <span className="truncate font-mono text-sm">{path}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
