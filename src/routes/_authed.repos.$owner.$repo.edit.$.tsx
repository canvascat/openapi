import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import Editor from "@monaco-editor/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearToken, getOctokit } from "@/features/auth/session";
import { SaveDialog } from "@/features/editor/save-dialog";
import { SwaggerPreview } from "@/features/editor/swagger-preview";
import { useDebouncedValue } from "@/features/editor/use-debounced-value";
import { fileQuery, treeQuery } from "@/features/explorer/queries";
import { classifyGithubError, saveFileContent } from "@/lib/github";

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
  const debouncedText = useDebouncedValue(text, 500);

  const language = filePath.endsWith(".json") ? "json" : "yaml";
  const dirty = text !== savedText;

  const [saveOpen, setSaveOpen] = useState(false);
  const queryClient = useQueryClient();
  const fileName = filePath.split("/").at(-1) ?? filePath;

  const save = useMutation({
    mutationFn: (message: string) =>
      saveFileContent(getOctokit(), {
        owner,
        repo,
        path: filePath,
        branch: ref,
        content: text,
        sha,
        message,
      }),
    onSuccess: (newSha) => {
      setSha(newSha);
      setSavedText(text);
      setSaveOpen(false);
      toast.success("已提交到 GitHub");
      queryClient.setQueryData(fileQuery(owner, repo, filePath, ref).queryKey, {
        text,
        sha: newSha,
      });
      void queryClient.invalidateQueries({ queryKey: treeQuery(owner, repo, ref).queryKey });
    },
    onError: (err) => {
      const kind = classifyGithubError(err);
      if (kind === "unauthorized") {
        clearToken();
        window.location.assign("/auth");
        return;
      }
      if (kind === "conflict") {
        toast.error("远端已更新，请刷新获取最新内容后重试", {
          action: {
            label: "刷新（丢弃本地改动）",
            onClick: () => {
              void queryClient
                .invalidateQueries({ queryKey: fileQuery(owner, repo, filePath, ref).queryKey })
                .then(() => window.location.reload());
            },
          },
        });
      } else if (kind === "rate-limited") {
        toast.error("GitHub 拒绝请求：可能触发限流，或 Token 缺少仓库 Contents 写权限");
      } else {
        toast.error(`提交失败：${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

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
        <Button disabled={!dirty} onClick={() => setSaveOpen(true)}>
          保存
        </Button>
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
      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultMessage={`docs: update ${fileName}`}
        pending={save.isPending}
        onConfirm={(message) => save.mutate(message)}
      />
    </div>
  );
}
