// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { LintDiagnostic } from "./diagnostics";
import { ProblemsPanel } from "./problems-panel";

const diagnostics: LintDiagnostic[] = [
  {
    line: 3,
    column: 5,
    endLine: 3,
    endColumn: 11,
    message: "应包含 info 字段",
    code: "oas3-schema",
    severity: "error",
  },
];

describe("ProblemsPanel", () => {
  it("展示问题数量", () => {
    render(<ProblemsPanel diagnostics={diagnostics} status="idle" onGoto={() => {}} />);
    expect(screen.getByText("1 个问题")).toBeTruthy();
  });

  it("无诊断时展示空态文案", () => {
    render(<ProblemsPanel diagnostics={[]} status="idle" onGoto={() => {}} />);
    expect(screen.getByText("无校验问题")).toBeTruthy();
  });

  it("error 状态展示校验器异常", () => {
    render(<ProblemsPanel diagnostics={[]} status="error" onGoto={() => {}} />);
    expect(screen.getByText("校验器异常，暂不可用")).toBeTruthy();
  });

  it("展开后点击条目回传 onGoto(line, column)", () => {
    const onGoto = vi.fn();
    render(<ProblemsPanel diagnostics={diagnostics} status="idle" onGoto={onGoto} />);
    fireEvent.click(screen.getByText("1 个问题"));
    fireEvent.click(screen.getByText("应包含 info 字段"));
    expect(onGoto).toHaveBeenCalledWith(3, 5);
  });
});
