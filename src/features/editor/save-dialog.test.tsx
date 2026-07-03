// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { SaveDialog } from "./save-dialog";

describe("SaveDialog", () => {
  it("显示默认 commit message，确认时回传", () => {
    const onConfirm = vi.fn();
    render(
      <SaveDialog
        open
        onOpenChange={() => {}}
        defaultMessage="docs: update pet.yaml"
        pending={false}
        onConfirm={onConfirm}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>("提交说明");
    expect(input.value).toBe("docs: update pet.yaml");
    fireEvent.change(input, { target: { value: "docs: 调整宠物接口" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(onConfirm).toHaveBeenCalledWith("docs: 调整宠物接口");
  });

  it("message 为空时禁用提交按钮", () => {
    render(
      <SaveDialog
        open
        onOpenChange={() => {}}
        defaultMessage=""
        pending={false}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "提交" }).disabled).toBe(true);
  });
});
