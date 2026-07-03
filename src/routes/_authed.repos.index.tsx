import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearToken } from "@/features/auth/session";
import { reposQuery } from "@/features/explorer/queries";

export const Route = createFileRoute("/_authed/repos/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(reposQuery()),
  component: ReposPage,
});

function ReposPage() {
  const { data: repos } = useSuspenseQuery(reposQuery());
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">选择仓库</h1>
        <Button
          variant="outline"
          onClick={() => {
            clearToken();
            void navigate({ to: "/auth" });
          }}
        >
          退出登录
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {repos.map((repo) => (
          <Link
            key={repo.fullName}
            to="/repos/$owner/$repo"
            params={{ owner: repo.owner, repo: repo.name }}
          >
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="truncate">{repo.fullName}</span>
                  {repo.isPrivate && <Badge variant="secondary">私有</Badge>}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {repo.description ?? "暂无描述"}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      {repos.length === 0 && <p className="text-muted-foreground">该 Token 无可访问的仓库。</p>}
    </div>
  );
}
