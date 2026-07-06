// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { TagGroup } from "@/lib/openapi-ir";
import { ApiNav } from "./api-nav";

const groups: TagGroup[] = [
  {
    tag: "宠物",
    operations: [
      {
        id: "get /pets",
        method: "get",
        path: "/pets",
        summary: "列出宠物",
        deprecated: false,
        tags: ["宠物"],
      },
      {
        id: "delete /pets",
        method: "delete",
        path: "/pets",
        summary: "清空",
        deprecated: true,
        tags: ["宠物"],
      },
    ],
  },
];

describe("ApiNav", () => {
  it("渲染分组标题、method 徽标与 path", () => {
    render(<ApiNav groups={groups} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("宠物")).toBeTruthy();
    expect(screen.getByText("get")).toBeTruthy();
    expect(screen.getAllByText("/pets")).toHaveLength(2);
  });

  it("deprecated 条目带删除线样式", () => {
    render(<ApiNav groups={groups} selectedId={null} onSelect={() => {}} />);
    const del = screen.getAllByText("/pets")[1];
    expect(del.className).toContain("line-through");
  });

  it("点击条目回传 OperationSummary", () => {
    const onSelect = vi.fn();
    render(<ApiNav groups={groups} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("列出宠物"));
    expect(onSelect).toHaveBeenCalledWith(groups[0].operations[0]);
  });
});
