// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { ParameterDialog } from "./parameter-dialog";

const OP_BASE = ["paths", "/pets", "get", "parameters"];

describe("ParameterDialog", () => {
  it("create 模式提交生成追加 Edit（append 到 basePath 末尾）", () => {
    const onSubmit = vi.fn();
    render(
      <ParameterDialog
        open
        onOpenChange={() => {}}
        mode="create"
        basePath={OP_BASE}
        existingCount={2}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "offset" } });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const edits = onSubmit.mock.calls[0][0];
    expect(edits).toHaveLength(1);
    expect(edits[0].path).toEqual(["paths", "/pets", "get", "parameters", 2]);
    expect(edits[0].value).toMatchObject({ name: "offset", in: "query" });
  });

  it("edit 模式按 basePath+index 生成字段 set Edit", () => {
    const onSubmit = vi.fn();
    render(
      <ParameterDialog
        open
        onOpenChange={() => {}}
        mode="edit"
        basePath={OP_BASE}
        index={1}
        existingCount={2}
        initial={{
          name: "limit",
          location: "query",
          type: "integer",
          required: false,
          description: "",
        }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByLabelText("必填"));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    const edits = onSubmit.mock.calls[0][0];
    const requiredEdit = edits.find(
      (e: { path: (string | number)[] }) => e.path.at(-1) === "required",
    );
    expect(requiredEdit.path).toEqual(["paths", "/pets", "get", "parameters", 1, "required"]);
    expect(requiredEdit.value).toBe(true);
  });
});
