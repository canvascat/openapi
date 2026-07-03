import { describe, expect, it } from "vite-plus/test";
import { buildFileTree } from "./file-tree";

describe("buildFileTree", () => {
  it("按目录分组，目录在前、同级按名称排序", () => {
    const tree = buildFileTree(["b.yaml", "docs/v1/pet.json", "docs/user.yaml", "a.json"]);
    expect(tree).toEqual([
      {
        name: "docs",
        path: "docs",
        children: [
          {
            name: "v1",
            path: "docs/v1",
            children: [{ name: "pet.json", path: "docs/v1/pet.json", children: null }],
          },
          { name: "user.yaml", path: "docs/user.yaml", children: null },
        ],
      },
      { name: "a.json", path: "a.json", children: null },
      { name: "b.yaml", path: "b.yaml", children: null },
    ]);
  });

  it("空输入返回空数组", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});
