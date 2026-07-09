// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { OperationSummary } from "@/lib/openapi-ir";
import { OperationDetailPanel } from "./operation-detail-panel";

const operation: OperationSummary = {
  id: "get /pets",
  method: "get",
  path: "/pets",
  summary: "列出宠物",
  deprecated: false,
  tags: ["宠物"],
};

const doc = {
  openapi: "3.1.0",
  paths: {
    "/pets": {
      parameters: [
        {
          name: "tenant",
          in: "header",
          schema: { type: "string" },
        },
      ],
      get: {
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer" },
          },
        ],
        responses: {},
      },
    },
  },
};

describe("OperationDetailPanel", () => {
  it("添加参数时追加到 operation 级 parameters 的真实末尾", () => {
    const onEdit = vi.fn();
    render(<OperationDetailPanel doc={doc} operation={operation} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "添加参数" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "offset" } });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    const edits = onEdit.mock.calls[0][0];
    expect(edits).toHaveLength(1);
    expect(edits[0].path).toEqual(["paths", "/pets", "get", "parameters", 1]);
  });
});
