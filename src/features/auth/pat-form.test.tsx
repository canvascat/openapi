// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { PatForm } from "./pat-form";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

describe("PatForm", () => {
  it("渲染 token 输入框与登录按钮", () => {
    render(<PatForm />);
    expect(screen.getByLabelText("Fine-grained PAT")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
  });

  it("空 token 提交时提示错误且不发请求", () => {
    render(<PatForm />);
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(screen.getByText("请输入 Token")).toBeTruthy();
  });
});
