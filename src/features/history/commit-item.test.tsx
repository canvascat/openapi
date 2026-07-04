// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { CommitItem } from "./commit-item";

const commit = {
  sha: "abcdef1234567890",
  shortSha: "abcdef1",
  message: "feat: 新增宠物接口\n\n详细说明不应展示",
  authorName: "张三",
  authorDate: "2026-07-01T08:00:00Z",
  parentSha: "p1",
};

describe("CommitItem", () => {
  it("只展示 message 首行、作者与短 SHA", () => {
    render(<CommitItem commit={commit} onSelect={() => {}} />);
    expect(screen.getByText("feat: 新增宠物接口")).toBeTruthy();
    expect(screen.queryByText(/详细说明不应展示/)).toBeNull();
    expect(screen.getByText("张三")).toBeTruthy();
    expect(screen.getByText("abcdef1")).toBeTruthy();
  });

  it("点击回传该 commit", () => {
    const onSelect = vi.fn();
    render(<CommitItem commit={commit} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(commit);
  });
});
