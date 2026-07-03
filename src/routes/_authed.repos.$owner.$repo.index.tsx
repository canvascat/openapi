import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/repos/$owner/$repo/")({
  component: () => <div className="p-6">仓库详情（Task 7 实现）</div>,
});
