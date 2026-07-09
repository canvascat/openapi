// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import VisualView from "./visual-view";

const source = `openapi: 3.1.0
info:
  title: 宠物店
paths:
  /pets:
    get:
      summary: 列出宠物
      responses:
        "200":
          description: OK
`;

describe("VisualView", () => {
  it("接口导航侧栏与详情区之间可调整宽度", () => {
    render(<VisualView source={source} />);
    expect(screen.getByText("宠物店")).toBeTruthy();
    expect(screen.getByRole("separator", { name: "调整可视模式侧栏宽度" })).toBeTruthy();
  });
});
