export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type IrResult =
  | { ok: true; overview: ApiOverview }
  | { ok: false; reason: "not-openapi" | "swagger-2" | "no-paths" };

export interface ApiOverview {
  version: string;
  title: string;
  groups: TagGroup[];
}

export interface TagGroup {
  tag: string;
  operations: OperationSummary[];
}

export interface OperationSummary {
  id: string;
  method: string;
  path: string;
  summary: string;
  deprecated: boolean;
  tags: string[];
}

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const UNGROUPED = "未分组";

export function buildApiOverview(doc: Record<string, unknown>): IrResult {
  if (typeof doc.openapi !== "string") {
    return "swagger" in doc
      ? { ok: false, reason: "swagger-2" }
      : { ok: false, reason: "not-openapi" };
  }
  const paths = doc.paths;
  if (!isRecord(paths) || Object.keys(paths).length === 0) {
    return { ok: false, reason: "no-paths" };
  }
  const info = isRecord(doc.info) ? doc.info : {};
  const title = typeof info.title === "string" ? info.title : "未命名文档";

  const groups = new Map<string, OperationSummary[]>();
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isRecord(op)) {
        continue;
      }
      const tags = Array.isArray(op.tags)
        ? op.tags.filter((t): t is string => typeof t === "string")
        : [];
      const summary: OperationSummary = {
        id: `${method} ${path}`,
        method,
        path,
        summary: typeof op.summary === "string" ? op.summary : "",
        deprecated: op.deprecated === true,
        tags,
      };
      for (const tag of tags.length > 0 ? tags : [UNGROUPED]) {
        const list = groups.get(tag) ?? [];
        list.push(summary);
        groups.set(tag, list);
      }
    }
  }

  const result: TagGroup[] = [...groups.entries()]
    .filter(([tag]) => tag !== UNGROUPED)
    .map(([tag, operations]) => ({ tag, operations }));
  const ungrouped = groups.get(UNGROUPED);
  if (ungrouped) {
    result.push({ tag: UNGROUPED, operations: ungrouped });
  }
  return { ok: true, overview: { version: doc.openapi, title, groups: result } };
}
