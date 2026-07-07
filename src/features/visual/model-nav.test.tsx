// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { ModelNav } from "./model-nav";

const refIndex = { Pet: ["get /pets", "post /pets"] };

describe("ModelNav", () => {
  it("渲染名称与被引用计数", () => {
    render(
      <ModelNav names={["Pet", "Err"]} refIndex={refIndex} selected={null} onSelect={() => {}} />,
    );
    expect(screen.getByText("Pet")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Err")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("点击回传名称", () => {
    const onSelect = vi.fn();
    render(<ModelNav names={["Pet"]} refIndex={refIndex} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Pet"));
    expect(onSelect).toHaveBeenCalledWith("Pet");
  });

  it("空列表显示空态文案", () => {
    render(<ModelNav names={[]} refIndex={{}} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("该文档没有定义数据模型。")).toBeTruthy();
  });
});
