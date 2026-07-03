import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import Editor from "@monaco-editor/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SwaggerPreview } from "@/features/editor/swagger-preview";
import { useDebouncedValue } from "@/features/editor/use-debounced-value";
import { fileQuery } from "@/features/explorer/queries";

export const Route = createFileRoute("/_authed/repos/$owner/$repo/edit/$")({
  validateSearch: (search: Record<string, unknown>): { ref: string } => ({
    ref: typeof search.ref === "string" && search.ref !== "" ? search.ref : "main",
  }),
  loaderDeps: ({ search }) => ({ ref: search.ref }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      fileQuery(params.owner, params.repo, params._splat ?? "", deps.ref),
    ),
  component: EditPage,
});

function EditPage() {
  const { owner, repo, _splat: filePath = "" } = Route.useParams();
  const { ref } = Route.useSearch();

  const { data: file } = useSuspenseQuery(fileQuery(owner, repo, filePath, ref));
  const [text, setText] = useState(file.text);
  const [sha, setSha] = useState(file.sha);
  const [savedText, setSavedText] = useState(file.text);
  void sha;
  void setSha;
  void setSavedText; // 以上三行 Task 9 保存流程接入后删除
  const debouncedText = useDebouncedValue(text, 500);

  const language = filePath.endsWith(".json") ? "json" : "yaml";
  const dirty = text !== savedText;

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/repos/$owner/$repo"
            params={{ owner, repo }}
            search={{ ref }}
            className="shrink-0 text-sm text-muted-foreground hover:underline"
          >
            ← 返回
          </Link>
          <span className="truncate font-mono text-sm">
            {owner}/{repo} · {filePath} @ {ref}
          </span>
        </div>
        <Button disabled={!dirty}>保存{dirty ? "" : "（无改动）"}</Button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="min-w-0 border-r">
          <Editor
            height="100%"
            language={language}
            value={text}
            onChange={(value) => setText(value ?? "")}
            options={{ minimap: { enabled: false }, wordWrap: "on" }}
          />
        </div>
        <div className="min-w-0 overflow-y-auto bg-white">
          <SwaggerPreview source={debouncedText} />
        </div>
      </div>
    </div>
  );
}
