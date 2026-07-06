// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import type { SchemaNode } from "@/lib/openapi-ir";
import { SchemaTree } from "./schema-tree";

const leaf = (name: string, extra: Partial<SchemaNode> = {}): SchemaNode => ({
  name,
  type: "string",
  required: false,
  description: "",
  enumValues: null,
  refName: null,
  circular: false,
  children: null,
  ...extra,
});

describe("SchemaTree", () => {
  it("渲染名称、类型、必填星标与描述", () => {
    render(<SchemaTree node={leaf("name", { required: true, description: "宠物名称" })} />);
    expect(screen.getByText("name")).toBeTruthy();
    expect(screen.getByText("string")).toBeTruthy();
    expect(screen.getByText("*")).toBeTruthy();
    expect(screen.getByText("宠物名称")).toBeTruthy();
  });

  it("枚举值与循环截断文案", () => {
    render(<SchemaTree node={leaf("status", { enumValues: ["在售", "已售"], circular: true })} />);
    expect(screen.getByText(/在售、已售/)).toBeTruthy();
    expect(screen.getByText("↻ 循环引用已截断")).toBeTruthy();
  });

  it("点击折叠按钮隐藏子级", () => {
    const parent: SchemaNode = {
      ...leaf("pet", { type: "object" }),
      children: [leaf("childField")],
    };
    render(<SchemaTree node={parent} />);
    expect(screen.getByText("childField")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("折叠"));
    expect(screen.queryByText("childField")).toBeNull();
  });
});
