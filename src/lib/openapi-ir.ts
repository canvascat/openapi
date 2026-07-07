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

export interface SchemaNode {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enumValues: string[] | null;
  refName: string | null;
  circular: boolean;
  children: SchemaNode[] | null;
}

const MAX_DEPTH = 8;

function refShortName(ref: string): string {
  return ref.split("/").at(-1) ?? ref;
}

function lookupRef(doc: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  let node: unknown = doc;
  for (const seg of ref.slice(2).split("/")) {
    if (!isRecord(node)) {
      return undefined;
    }
    node = node[seg.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  return node;
}

export function resolveSchema(
  doc: Record<string, unknown>,
  schema: unknown,
  seenRefs: Set<string> = new Set(),
  depth = 0,
  name = "",
  required = false,
): SchemaNode {
  const base: SchemaNode = {
    name,
    type: "unknown",
    required,
    description: "",
    enumValues: null,
    refName: null,
    circular: false,
    children: null,
  };
  if (!isRecord(schema)) {
    return base;
  }

  if (typeof schema.$ref === "string") {
    const ref = schema.$ref;
    const short = refShortName(ref);
    if (seenRefs.has(ref)) {
      return { ...base, type: "object", refName: short, circular: true };
    }
    const target = lookupRef(doc, ref);
    if (target === undefined) {
      return { ...base, refName: short };
    }
    const resolved = resolveSchema(
      doc,
      target,
      new Set([...seenRefs, ref]),
      depth + 1,
      name,
      required,
    );
    return { ...resolved, refName: short };
  }

  const description = typeof schema.description === "string" ? schema.description : "";
  const enumValues = Array.isArray(schema.enum) ? schema.enum.map(String) : null;

  for (const keyword of ["oneOf", "anyOf", "allOf"]) {
    const branches = schema[keyword];
    if (Array.isArray(branches)) {
      const children =
        depth >= MAX_DEPTH
          ? null
          : branches.map((b, i) =>
              resolveSchema(doc, b, seenRefs, depth + 1, `选项 ${i + 1}`, false),
            );
      return { ...base, type: keyword, description, enumValues, children };
    }
  }

  const type =
    typeof schema.type === "string"
      ? schema.type
      : isRecord(schema.properties)
        ? "object"
        : "unknown";

  if (type === "object" && isRecord(schema.properties)) {
    const requiredList = Array.isArray(schema.required) ? schema.required : [];
    const children =
      depth >= MAX_DEPTH
        ? null
        : Object.entries(schema.properties).map(([key, prop]) =>
            resolveSchema(doc, prop, seenRefs, depth + 1, key, requiredList.includes(key)),
          );
    return { ...base, type: "object", description, enumValues, children };
  }
  if (type === "array") {
    const children =
      depth >= MAX_DEPTH || schema.items === undefined
        ? null
        : [resolveSchema(doc, schema.items, seenRefs, depth + 1, "items", false)];
    return { ...base, type: "array", description, enumValues, children };
  }
  return { ...base, type, description, enumValues };
}

export interface ParameterRow {
  name: string;
  location: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ResponseEntry {
  status: string;
  description: string;
  schema: SchemaNode | null;
}

export interface OperationDetail {
  description: string;
  parameters: ParameterRow[];
  requestBody: { mediaType: string; schema: SchemaNode | null } | null;
  responses: ResponseEntry[];
}

function toParameterRow(doc: Record<string, unknown>, raw: unknown): ParameterRow | null {
  let p = raw;
  if (isRecord(p) && typeof p.$ref === "string") {
    p = lookupRef(doc, p.$ref);
  }
  if (!isRecord(p) || typeof p.name !== "string") {
    return null;
  }
  const schema = isRecord(p.schema) ? p.schema : null;
  return {
    name: p.name,
    location: typeof p.in === "string" ? p.in : "unknown",
    type: schema && typeof schema.type === "string" ? schema.type : "unknown",
    required: p.required === true,
    description: typeof p.description === "string" ? p.description : "",
  };
}

function firstMediaSchema(
  doc: Record<string, unknown>,
  content: unknown,
): { mediaType: string; schema: SchemaNode | null } | null {
  if (!isRecord(content)) {
    return null;
  }
  const [mediaType] = Object.keys(content);
  if (!mediaType) {
    return null;
  }
  const media = content[mediaType];
  const schema =
    isRecord(media) && media.schema !== undefined ? resolveSchema(doc, media.schema) : null;
  return { mediaType, schema };
}

export function getOperationDetail(
  doc: Record<string, unknown>,
  method: string,
  path: string,
): OperationDetail | null {
  const paths = doc.paths;
  if (!isRecord(paths)) {
    return null;
  }
  const item = paths[path];
  if (!isRecord(item)) {
    return null;
  }
  const op = item[method];
  if (!isRecord(op)) {
    return null;
  }

  const merged = new Map<string, ParameterRow>();
  for (const source of [item.parameters, op.parameters]) {
    if (!Array.isArray(source)) {
      continue;
    }
    for (const raw of source) {
      const row = toParameterRow(doc, raw);
      if (row) {
        merged.set(`${row.location}:${row.name}`, row);
      }
    }
  }

  let requestBody: OperationDetail["requestBody"] = null;
  let rb: unknown = op.requestBody;
  if (isRecord(rb) && typeof rb.$ref === "string") {
    rb = lookupRef(doc, rb.$ref);
  }
  if (isRecord(rb)) {
    requestBody = firstMediaSchema(doc, rb.content);
  }

  const responses: ResponseEntry[] = [];
  if (isRecord(op.responses)) {
    for (const [status, r0] of Object.entries(op.responses)) {
      let r: unknown = r0;
      if (isRecord(r) && typeof r.$ref === "string") {
        r = lookupRef(doc, r.$ref);
      }
      if (!isRecord(r)) {
        continue;
      }
      const media = firstMediaSchema(doc, r.content);
      responses.push({
        status,
        description: typeof r.description === "string" ? r.description : "",
        schema: media?.schema ?? null,
      });
    }
    responses.sort((a, b) =>
      a.status === "default" ? 1 : b.status === "default" ? -1 : a.status.localeCompare(b.status),
    );
  }

  return {
    description: typeof op.description === "string" ? op.description : "",
    parameters: [...merged.values()],
    requestBody,
    responses,
  };
}

const SCHEMA_REF_PREFIX = "#/components/schemas/";

function collectSchemaRefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectSchemaRefs(item, out);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  const ref = node.$ref;
  if (typeof ref === "string" && ref.startsWith(SCHEMA_REF_PREFIX)) {
    out.add(ref.slice(SCHEMA_REF_PREFIX.length));
  }
  for (const value of Object.values(node)) {
    collectSchemaRefs(value, out);
  }
}

export function listSchemaNames(doc: Record<string, unknown>): string[] {
  const components = isRecord(doc.components) ? doc.components : {};
  const schemas = isRecord(components.schemas) ? components.schemas : {};
  return Object.keys(schemas);
}

export function buildSchemaRefIndex(doc: Record<string, unknown>): Record<string, string[]> {
  const known = new Set(listSchemaNames(doc));
  const index: Record<string, string[]> = {};
  const paths = doc.paths;
  if (!isRecord(paths)) {
    return index;
  }
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) {
      continue;
    }
    const pathLevelRefs = new Set<string>();
    collectSchemaRefs(item.parameters, pathLevelRefs);
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isRecord(op)) {
        continue;
      }
      const id = `${method} ${path}`;
      const refs = new Set<string>(pathLevelRefs);
      collectSchemaRefs(op, refs);
      for (const name of refs) {
        if (!known.has(name)) {
          continue;
        }
        const list = index[name] ?? [];
        if (!list.includes(id)) {
          list.push(id);
        }
        index[name] = list;
      }
    }
  }
  return index;
}
