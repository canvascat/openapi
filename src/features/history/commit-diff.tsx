import { DiffEditor } from "@monaco-editor/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fileQuery } from "@/features/explorer/queries";
import type { CommitSummary } from "@/lib/github";

export type DiffBaseline = "parent" | "current";

export function CommitDiff({
  owner,
  repo,
  path,
  commit,
  currentText,
  baseline,
  onRestore,
}: {
  owner: string;
  repo: string;
  path: string;
  commit: CommitSummary;
  currentText: string;
  baseline: DiffBaseline;
  onRestore: (text: string) => void;
}) {
  const version = useQuery(fileQuery(owner, repo, path, commit.sha));
  const needParent = baseline === "parent" && commit.parentSha !== null;
  const parent = useQuery({
    ...fileQuery(owner, repo, path, commit.parentSha ?? ""),
    enabled: needParent,
  });

  if (version.isError) {
    return (
      <p className="p-4 text-sm text-destructive">加载版本内容失败：{version.error.message}</p>
    );
  }
  if (needParent && parent.isError) {
    return <p className="p-4 text-sm text-destructive">加载对比基准失败：{parent.error.message}</p>;
  }
  if (version.isPending || (needParent && parent.isPending)) {
    return <p className="p-4 text-sm text-muted-foreground">加载版本内容...</p>;
  }

  const original =
    baseline === "parent"
      ? commit.parentSha === null
        ? ""
        : parent.data!.text
      : version.data.text;
  const modified = baseline === "parent" ? version.data.text : currentText;
  const language = path.endsWith(".json") ? "json" : "yaml";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
        <DiffEditor
          height="100%"
          language={language}
          original={original}
          modified={modified}
          options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false } }}
        />
      </div>
      <Button className="shrink-0 self-end" onClick={() => onRestore(version.data.text)}>
        载入此版本到编辑器
      </Button>
    </div>
  );
}
