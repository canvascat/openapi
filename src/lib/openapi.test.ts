import { describe, expect, it } from "vite-plus/test";
import { hasOpenApiRoot, isOpenApiCandidate, parseDocument } from "./openapi";

describe("isOpenApiCandidate", () => {
  it.each(["api.json", "docs/v1/api.yaml", "a.yml", "A.YAML"])("%s → true", (p) => {
    expect(isOpenApiCandidate(p)).toBe(true);
  });
  it.each(["readme.md", "openapi.txt", "yaml", "api.json.bak"])("%s → false", (p) => {
    expect(isOpenApiCandidate(p)).toBe(false);
  });
});

describe("parseDocument", () => {
  it("解析 YAML 对象", () => {
    const r = parseDocument("openapi: 3.1.0\ninfo:\n  title: demo");
    expect(r).toEqual({ ok: true, doc: { openapi: "3.1.0", info: { title: "demo" } } });
  });
  it("解析 JSON 对象", () => {
    const r = parseDocument('{"swagger": "2.0"}');
    expect(r).toEqual({ ok: true, doc: { swagger: "2.0" } });
  });
  it("语法错误返回 error", () => {
    const r = parseDocument("a: [1, 2");
    expect(r.ok).toBe(false);
  });
  it("根节点非对象返回 error", () => {
    expect(parseDocument("42").ok).toBe(false);
    expect(parseDocument("- 1\n- 2").ok).toBe(false);
  });
});

describe("hasOpenApiRoot", () => {
  it("openapi / swagger 字段 → true", () => {
    expect(hasOpenApiRoot({ openapi: "3.0.0" })).toBe(true);
    expect(hasOpenApiRoot({ swagger: "2.0" })).toBe(true);
  });
  it("其他对象 → false", () => {
    expect(hasOpenApiRoot({ name: "package.json" })).toBe(false);
  });
});
