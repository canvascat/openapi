import { load } from "js-yaml";

export function isOpenApiCandidate(path: string): boolean {
  return /\.(json|ya?ml)$/i.test(path);
}

export type ParseResult = { ok: true; doc: Record<string, unknown> } | { ok: false; error: string };

export function parseDocument(source: string): ParseResult {
  try {
    const doc = load(source);
    if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
      return { ok: false, error: "文档根节点必须是对象" };
    }
    return { ok: true, doc: doc as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function hasOpenApiRoot(doc: Record<string, unknown>): boolean {
  return "openapi" in doc || "swagger" in doc;
}
