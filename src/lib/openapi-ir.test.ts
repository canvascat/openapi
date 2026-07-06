import { describe, expect, it } from "vite-plus/test";
import { buildApiOverview } from "./openapi-ir";

const baseDoc = {
  openapi: "3.1.0",
  info: { title: "宠物店" },
  paths: {
    "/pets": {
      get: { summary: "列出宠物", tags: ["宠物"] },
      post: { summary: "创建宠物", tags: ["宠物", "管理"] },
    },
    "/health": {
      get: { summary: "健康检查", deprecated: true },
    },
  },
};

describe("buildApiOverview", () => {
  it("swagger 2.0 文档 → swagger-2", () => {
    expect(buildApiOverview({ swagger: "2.0", paths: { "/a": {} } })).toEqual({
      ok: false,
      reason: "swagger-2",
    });
  });

  it("缺 openapi 字段 → not-openapi", () => {
    expect(buildApiOverview({ info: {} })).toEqual({ ok: false, reason: "not-openapi" });
  });

  it("paths 缺失或为空 → no-paths", () => {
    expect(buildApiOverview({ openapi: "3.0.0" })).toEqual({ ok: false, reason: "no-paths" });
    expect(buildApiOverview({ openapi: "3.0.0", paths: {} })).toEqual({
      ok: false,
      reason: "no-paths",
    });
  });

  it("按 tag 分组：多 tag 出现在多组，无 tag 归「未分组」置尾", () => {
    const r = buildApiOverview(baseDoc);
    if (!r.ok) throw new Error("应当成功");
    expect(r.overview.version).toBe("3.1.0");
    expect(r.overview.title).toBe("宠物店");
    expect(r.overview.groups.map((g) => g.tag)).toEqual(["宠物", "管理", "未分组"]);
    expect(r.overview.groups[0].operations.map((o) => o.id)).toEqual(["get /pets", "post /pets"]);
    expect(r.overview.groups[1].operations.map((o) => o.id)).toEqual(["post /pets"]);
    expect(r.overview.groups[2].operations[0]).toEqual({
      id: "get /health",
      method: "get",
      path: "/health",
      summary: "健康检查",
      deprecated: true,
      tags: [],
    });
  });

  it("info.title 缺失时兜底「未命名文档」", () => {
    const r = buildApiOverview({ openapi: "3.0.0", paths: { "/a": { get: {} } } });
    if (!r.ok) throw new Error("应当成功");
    expect(r.overview.title).toBe("未命名文档");
  });
});
