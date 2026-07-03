import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="flex min-h-svh items-center justify-center">
      <h1 className="text-2xl font-semibold">OpenAPI 文档管理</h1>
    </div>
  ),
});
