import { Badge } from "@/components/ui/badge";
import type { CommitSummary } from "@/lib/github";

export function CommitItem({
  commit,
  onSelect,
}: {
  commit: CommitSummary;
  onSelect: (commit: CommitSummary) => void;
}) {
  const title = commit.message.split("\n")[0];
  return (
    <button
      type="button"
      className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left hover:bg-accent"
      onClick={() => onSelect(commit)}
    >
      <span className="truncate text-sm font-medium">{title}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{commit.authorName}</span>
        <span>{commit.authorDate ? new Date(commit.authorDate).toLocaleString() : "未知时间"}</span>
        <Badge variant="secondary" className="font-mono">
          {commit.shortSha}
        </Badge>
      </span>
    </button>
  );
}
