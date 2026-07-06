import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearToken, getOctokit } from "@/features/auth/session";
import { HistorySheet } from "@/features/history/history-sheet";
import { SaveDialog } from "@/features/editor/save-dialog";
import { SwaggerPreview } from "@/features/editor/swagger-preview";
import { useDebouncedValue } from "@/features/editor/use-debounced-value";
import { fileQuery, treeQuery } from "@/features/explorer/queries";
import { ProblemsPanel } from "@/features/lint/problems-panel";
import { useLint } from "@/features/lint/use-lint";
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
  component: EditPageWrapper,
});

function EditPageWrapper() {
  const { owner, repo, _splat: filePath = "" } = Route.useParams();
  const { ref } = Route.useSearch();
  return <EditPage key={`${owner}/${repo}/${filePath}@${ref}`} />;
}

function EditPage() {
  const { owner, repo, _splat: filePath = "" } = Route.useParams();
  const { ref } = Route.useSearch();

  const { data: file } = useSuspenseQuery(fileQuery(owner, repo, filePath, ref));
  const [text, setText] = useState(file.text);
  const [sha, setSha] = useState(file.sha);
  const [savedText, setSavedText] = useState(file.text);
  const debouncedText = useDebouncedValue(text, 500);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const { diagnostics, status: lintStatus } = useLint(debouncedText);

  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) {
      return;
    }
    const markers = diagnostics.map((d) => ({
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine,
      endColumn: d.endColumn,
      message: `${d.message} (${d.code})`,
      severity:
        d.severity === "error"
          ? monaco.MarkerSeverity.Error
          : d.severity === "warning"
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
    }));
    monaco.editor.setModelMarkers(model, "spectral", markers);
  }, [diagnostics]);

  const language = filePath.endsWith(".json") ? "json" : "yaml";
  const dirty = text !== savedText;

  const [saveOpen, setSaveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
        window.location.assign(`${import.meta.env.BASE_URL}auth`);
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
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="size-4" />
            历史
          </Button>
          <Button disabled={!dirty} onClick={() => setSaveOpen(true)}>
            保存
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="grid min-w-0 grid-rows-[1fr_auto] border-r">
          <div className="min-h-0">
            <Editor
              height="100%"
              language={language}
              value={text}
              onChange={(value) => setText(value ?? "")}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                monacoRef.current = monaco;
              }}
              options={{ minimap: { enabled: false }, wordWrap: "on" }}
            />
          </div>
          <ProblemsPanel
            diagnostics={diagnostics}
            status={lintStatus}
            onGoto={(line, column) => {
              editorRef.current?.revealLineInCenter(line);
              editorRef.current?.setPosition({ lineNumber: line, column });
              editorRef.current?.focus();
            }}
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
      <HistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        owner={owner}
        repo={repo}
        path={filePath}
        gitRef={ref}
        currentText={text}
        onRestore={(restoredText, shortSha) => {
          setText(restoredText);
          setHistoryOpen(false);
          toast.info(`已载入 ${shortSha} 版本，保存提交后完成回滚`);
        }}
      />
    </div>
  );
}
