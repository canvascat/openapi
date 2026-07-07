import { describe, expect, it } from "vite-plus/test";
import {
  buildApiOverview,
  buildSchemaRefIndex,
  getOperationDetail,
  listSchemaNames,
  resolveSchema,
} from "./openapi-ir";

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

describe("resolveSchema", () => {
  const doc = {
    components: {
      schemas: {
        Pet: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", description: "名称" },
            status: { type: "string", enum: ["在售", "已售"] },
            owner: { $ref: "#/components/schemas/Owner" },
          },
        },
        Owner: {
          type: "object",
          properties: { pet: { $ref: "#/components/schemas/Pet" } },
        },
      },
    },
  };

  it("object properties 与 required 列表", () => {
    const node = resolveSchema(doc, { $ref: "#/components/schemas/Pet" });
    expect(node.type).toBe("object");
    expect(node.refName).toBe("Pet");
    const name = node.children?.find((c) => c.name === "name");
    expect(name?.required).toBe(true);
    expect(name?.type).toBe("string");
    expect(name?.description).toBe("名称");
    const status = node.children?.find((c) => c.name === "status");
    expect(status?.required).toBe(false);
    expect(status?.enumValues).toEqual(["在售", "已售"]);
  });

  it("循环引用截断并标记 circular", () => {
    const node = resolveSchema(doc, { $ref: "#/components/schemas/Pet" });
    const owner = node.children?.find((c) => c.name === "owner");
    const petAgain = owner?.children?.find((c) => c.name === "pet");
    expect(petAgain?.circular).toBe(true);
    expect(petAgain?.children).toBeNull();
  });

  it("未知/跨文件 $ref → type unknown + refName 保留", () => {
    const node = resolveSchema(doc, { $ref: "./other.yaml#/X" });
    expect(node.type).toBe("unknown");
    expect(node.refName).toBe("X");
  });

  it("array items 作为单元素 children", () => {
    const node = resolveSchema(doc, { type: "array", items: { type: "integer" } });
    expect(node.type).toBe("array");
    expect(node.children).toHaveLength(1);
    expect(node.children?.[0].type).toBe("integer");
  });

  it("oneOf 显示为组合关键字，分支为 children", () => {
    const node = resolveSchema(doc, {
      oneOf: [{ type: "string" }, { type: "integer" }],
    });
    expect(node.type).toBe("oneOf");
    expect(node.children).toHaveLength(2);
  });

  it("深度上限 8 层后 children 截断为 null", () => {
    let deep: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 12; i += 1) {
      deep = { type: "object", properties: { next: deep } };
    }
    let node = resolveSchema(doc, deep);
    let depth = 0;
    while (node.children && node.children.length > 0) {
      node = node.children[0];
      depth += 1;
    }
    expect(depth).toBeLessThanOrEqual(8);
  });

  it("纯 $ref 链也计入深度上限", () => {
    const chainDoc: Record<string, unknown> = { components: { schemas: {} } };
    const schemas = (chainDoc.components as Record<string, unknown>).schemas as Record<
      string,
      unknown
    >;
    for (let i = 0; i < 20; i += 1) {
      schemas[`S${i}`] =
        i === 19
          ? { type: "object", properties: { leaf: { type: "string" } } }
          : { $ref: `#/components/schemas/S${i + 1}` };
    }
    const node = resolveSchema(chainDoc, { $ref: "#/components/schemas/S0" });
    expect(node.children).toBeNull();
  });
});

describe("getOperationDetail", () => {
  const doc = {
    openapi: "3.1.0",
    paths: {
      "/pets/{id}": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "verbose", in: "query", schema: { type: "boolean" }, description: "路径级" },
        ],
        get: {
          description: "查询宠物",
          parameters: [
            { name: "verbose", in: "query", schema: { type: "string" }, description: "接口级" },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { a: { type: "string" } } },
              },
            },
          },
          responses: {
            default: { description: "兜底" },
            "404": { description: "未找到" },
            "200": {
              description: "成功",
              content: { "application/json": { schema: { type: "string" } } },
            },
          },
        },
      },
    },
  };

  it("合并 path 级与 operation 级参数，同名同 in 以 operation 级覆盖", () => {
    const d = getOperationDetail(doc, "get", "/pets/{id}");
    expect(d?.parameters).toHaveLength(2);
    const verbose = d?.parameters.find((p) => p.name === "verbose");
    expect(verbose?.description).toBe("接口级");
    expect(verbose?.type).toBe("string");
    const id = d?.parameters.find((p) => p.name === "id");
    expect(id?.required).toBe(true);
    expect(id?.location).toBe("path");
  });

  it("requestBody 取第一个 media type", () => {
    const d = getOperationDetail(doc, "get", "/pets/{id}");
    expect(d?.requestBody?.mediaType).toBe("application/json");
    expect(d?.requestBody?.schema?.type).toBe("object");
  });

  it("responses 按状态码升序、default 置尾", () => {
    const d = getOperationDetail(doc, "get", "/pets/{id}");
    expect(d?.responses.map((r) => r.status)).toEqual(["200", "404", "default"]);
    expect(d?.responses[0].schema?.type).toBe("string");
    expect(d?.responses[1].schema).toBeNull();
  });

  it("找不到 operation 返回 null", () => {
    expect(getOperationDetail(doc, "post", "/pets/{id}")).toBeNull();
    expect(getOperationDetail(doc, "get", "/none")).toBeNull();
  });
});

describe("listSchemaNames", () => {
  it("保持定义顺序", () => {
    expect(listSchemaNames({ components: { schemas: { B: {}, A: {} } } })).toEqual(["B", "A"]);
  });

  it("无 components/schemas → 空数组", () => {
    expect(listSchemaNames({})).toEqual([]);
    expect(listSchemaNames({ components: {} })).toEqual([]);
  });
});

describe("buildSchemaRefIndex", () => {
  const doc = {
    openapi: "3.1.0",
    components: {
      schemas: { Pet: { type: "object" }, Err: { type: "object" }, Unused: { type: "string" } },
    },
    paths: {
      "/pets": {
        parameters: [{ name: "f", in: "query", schema: { $ref: "#/components/schemas/Err" } }],
        get: {
          responses: {
            "200": {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
            },
          },
        },
        post: {
          requestBody: {
            content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
          },
          responses: {
            "200": {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
            },
          },
        },
      },
      "/x": {
        get: {
          responses: {
            "200": {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Ghost" } } },
            },
          },
        },
      },
    },
  };

  it("直接引用归属 operation，同接口多处引用去重", () => {
    const index = buildSchemaRefIndex(doc);
    expect(index.Pet).toEqual(["get /pets", "post /pets"]);
  });

  it("path 级 parameters 引用归属该 path 全部 operations", () => {
    const index = buildSchemaRefIndex(doc);
    expect(index.Err).toEqual(["get /pets", "post /pets"]);
  });

  it("悬空引用与无引用 schema 不出现键", () => {
    const index = buildSchemaRefIndex(doc);
    expect(index.Ghost).toBeUndefined();
    expect(index.Unused).toBeUndefined();
  });

  it("无 paths → 空索引", () => {
    expect(buildSchemaRefIndex({ components: { schemas: { A: {} } } })).toEqual({});
  });
});
