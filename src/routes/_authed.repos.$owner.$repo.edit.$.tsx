import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/repos/$owner/$repo/edit/$")({
  validateSearch: (search: Record<string, unknown>): { ref: string } => ({
    ref: typeof search.ref === "string" && search.ref !== "" ? search.ref : "main",
  }),
  component: () => <div className="p-6">编辑器（Task 8 实现）</div>,
});
