import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CommitSummary } from "@/lib/github";
import { CommitDiff, type DiffBaseline } from "./commit-diff";
import { CommitItem } from "./commit-item";
import { commitsInfiniteQuery } from "./queries";

export function HistorySheet({
  open,
  onOpenChange,
  owner,
  repo,
  path,
  gitRef,
  currentText,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: string;
  repo: string;
  path: string;
  gitRef: string;
  currentText: string;
  onRestore: (text: string, shortSha: string) => void;
}) {
  const [selected, setSelected] = useState<CommitSummary | null>(null);
  const [baseline, setBaseline] = useState<DiffBaseline>("parent");
  const commits = useInfiniteQuery({
    ...commitsInfiniteQuery(owner, repo, path, gitRef),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setSelected(null);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-4 p-4 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"
      >
        <SheetHeader className="p-0">
          <SheetTitle>
            {selected ? `${selected.shortSha} · ${selected.message.split("\n")[0]}` : "提交历史"}
          </SheetTitle>
          <SheetDescription className="truncate font-mono">
            {path} @ {gitRef}
          </SheetDescription>
        </SheetHeader>

        {selected === null ? (
          <ScrollArea className="min-h-0 flex-1">
            {commits.isPending && <p className="text-sm text-muted-foreground">加载提交历史...</p>}
            {commits.isError && (
              <div className="text-sm text-destructive">
                <p>加载失败：{commits.error.message}</p>
                <Button variant="outline" className="mt-2" onClick={() => void commits.refetch()}>
                  重试
                </Button>
              </div>
            )}
            {commits.isSuccess && (
              <>
                {commits.data.pages.flat().length === 0 && (
                  <p className="text-sm text-muted-foreground">该文件在当前分支暂无提交记录。</p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {commits.data.pages.flat().map((c) => (
                    <li key={c.sha}>
                      <CommitItem commit={c} onSelect={setSelected} />
                    </li>
                  ))}
                </ul>
                {commits.hasNextPage && (
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={commits.isFetchingNextPage}
                    onClick={() => void commits.fetchNextPage()}
                  >
                    {commits.isFetchingNextPage ? "加载中..." : "加载更多"}
                  </Button>
                )}
              </>
            )}
          </ScrollArea>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                ← 返回列表
              </Button>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={baseline}
                onValueChange={(value) => {
                  if (value) {
                    setBaseline(value as DiffBaseline);
                  }
                }}
              >
                <ToggleGroupItem value="parent">此次变更</ToggleGroupItem>
                <ToggleGroupItem value="current">对比当前</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="min-h-0 flex-1">
              <CommitDiff
                owner={owner}
                repo={repo}
                path={path}
                commit={selected}
                currentText={currentText}
                baseline={baseline}
                onRestore={(text) => onRestore(text, selected.shortSha)}
              />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
