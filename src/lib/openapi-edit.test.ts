import { describe, expect, it } from "vite-plus/test";
import { applyEdits, detectJsonIndent } from "./openapi-edit";

describe("detectJsonIndent", () => {
  it("2 空格", () => {
    expect(detectJsonIndent('{\n  "a": 1\n}')).toBe(2);
  });
  it("4 空格", () => {
    expect(detectJsonIndent('{\n    "a": 1\n}')).toBe(4);
  });
  it("tab", () => {
    expect(detectJsonIndent('{\n\t"a": 1\n}')).toBe("\t");
  });
  it("无缩进默认 2", () => {
    expect(detectJsonIndent("{}")).toBe(2);
  });
});

describe("applyEdits YAML", () => {
  const src = `# 顶部注释
openapi: 3.1.0
info:
  title: "宠物店"   # 行尾注释
paths:
  /pets:
    get:
      summary: 列出宠物
      parameters:
        - name: limit
          in: query
          required: false
`;

  it("改字符串值保留注释与引号风格", async () => {
    const out = await applyEdits(src, "yaml", [
      { path: ["paths", "/pets", "get", "summary"], value: "获取宠物列表" },
    ]);
    expect(out).toContain("# 顶部注释");
    expect(out).toContain('title: "宠物店"');
    expect(out).toContain("# 行尾注释");
    expect(out).toContain("获取宠物列表");
  });

  it("改布尔值", async () => {
    const out = await applyEdits(src, "yaml", [
      { path: ["paths", "/pets", "get", "parameters", 0, "required"], value: true },
    ]);
    expect(out).toContain("required: true");
  });

  it("新增键", async () => {
    const out = await applyEdits(src, "yaml", [
      { path: ["paths", "/pets", "get", "description"], value: "新描述" },
    ]);
    expect(out).toContain("description: 新描述");
  });

  it("删除键", async () => {
    const out = await applyEdits(src, "yaml", [{ path: ["info", "title"], delete: true }]);
    expect(out).not.toContain("宠物店");
  });

  it("数组末尾追加参数", async () => {
    const out = await applyEdits(src, "yaml", [
      {
        path: ["paths", "/pets", "get", "parameters", 1],
        value: { name: "offset", in: "query" },
      },
    ]);
    expect(out).toContain("name: offset");
    expect(out).toContain("name: limit");
  });

  it("删除数组元素", async () => {
    const out = await applyEdits(src, "yaml", [
      { path: ["paths", "/pets", "get", "parameters", 0], delete: true },
    ]);
    expect(out).not.toContain("name: limit");
  });
});

describe("applyEdits JSON", () => {
  const src = '{\n  "openapi": "3.1.0",\n  "info": {\n    "title": "T"\n  }\n}';

  it("改值并保留 2 空格缩进", async () => {
    const out = await applyEdits(src, "json", [{ path: ["info", "title"], value: "新" }]);
    expect(out).toContain('"title": "新"');
    expect(out).toContain('  "openapi"');
    expect(JSON.parse(out).info.title).toBe("新");
  });

  it("删除键", async () => {
    const out = await applyEdits(src, "json", [{ path: ["info", "title"], delete: true }]);
    expect(JSON.parse(out).info.title).toBeUndefined();
  });

  it("数组追加与删除", async () => {
    const arrSrc = '{\n  "list": [1, 2]\n}';
    const added = await applyEdits(arrSrc, "json", [{ path: ["list", 2], value: 3 }]);
    expect(JSON.parse(added).list).toEqual([1, 2, 3]);
    const removed = await applyEdits(arrSrc, "json", [{ path: ["list", 0], delete: true }]);
    expect(JSON.parse(removed).list).toEqual([2]);
  });
});

describe("applyEdits 失败", () => {
  it("YAML 解析失败抛错", async () => {
    await expect(applyEdits("a: [1, 2", "yaml", [])).rejects.toThrow();
  });
  it("JSON 解析失败抛错", async () => {
    await expect(applyEdits("{bad", "json", [])).rejects.toThrow();
  });
});
