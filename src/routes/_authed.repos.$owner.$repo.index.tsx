import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildFileTree, FileTree } from "@/features/explorer/file-tree";
import { branchesQuery, reposQuery, treeQuery } from "@/features/explorer/queries";

export const Route = createFileRoute("/_authed/repos/$owner/$repo/")({
  validateSearch: (search: Record<string, unknown>): { ref?: string } => ({
    ref: typeof search.ref === "string" && search.ref !== "" ? search.ref : undefined,
  }),
  loaderDeps: ({ search }) => ({ ref: search.ref }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(reposQuery()),
      context.queryClient.ensureQueryData(branchesQuery(params.owner, params.repo)),
    ]);
  },
  component: RepoPage,
});

function RepoPage() {
  const { owner, repo } = Route.useParams();
  const { ref: refParam } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: repos } = useSuspenseQuery(reposQuery());
  const { data: branches } = useSuspenseQuery(branchesQuery(owner, repo));
  const defaultBranch =
    repos.find((r) => r.owner === owner && r.name === repo)?.defaultBranch ?? "main";
  const ref = refParam ?? defaultBranch;

  const tree = useQuery(treeQuery(owner, repo, ref));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link to="/repos" className="text-sm text-muted-foreground hover:underline">
            ← 返回仓库列表
          </Link>
          <h1 className="truncate text-2xl font-semibold">
            {owner}/{repo}
          </h1>
        </div>
        <Select value={ref} onValueChange={(value) => void navigate({ search: { ref: value } })}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="选择分支" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tree.isPending && <p className="text-muted-foreground">加载文件树...</p>}
      {tree.isError && (
        <div className="text-destructive">
          <p>加载失败：{tree.error.message}</p>
          <Button variant="outline" className="mt-2" onClick={() => void tree.refetch()}>
            重试
          </Button>
        </div>
      )}
      {tree.isSuccess && tree.data.length === 0 && (
        <p className="text-muted-foreground">该分支下未找到 .json/.yaml/.yml 文件。</p>
      )}
      {tree.isSuccess && tree.data.length > 0 && (
        <FileTree
          nodes={buildFileTree(tree.data.map((f) => f.path))}
          onSelectFile={(path) =>
            void navigate({
              to: "/repos/$owner/$repo/edit/$",
              params: { owner, repo, _splat: path },
              search: { ref },
            })
          }
        />
      )}
    </div>
  );
}
