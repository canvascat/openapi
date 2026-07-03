import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/repos/")({
  component: () => <div className="p-6">仓库列表（Task 6 实现）</div>,
});
