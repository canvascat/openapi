import { Octokit } from "@octokit/rest";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setToken } from "./session";

export function PatForm() {
  const navigate = useNavigate();
  const [token, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError("请输入 Token");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await new Octokit({ auth: trimmed }).users.getAuthenticated();
      setToken(trimmed);
      await navigate({ to: "/repos" });
    } catch {
      setError("Token 无效或已过期，请检查后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录 GitHub</CardTitle>
        <CardDescription>
          使用 Fine-grained PAT 访问你的文档仓库，Token 仅保存在本地浏览器。
          <a
            className="ml-1 underline"
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
          >
            去生成 Token
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pat">Fine-grained PAT</Label>
            <Input
              id="pat"
              type="password"
              placeholder="github_pat_..."
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "校验中..." : "登录"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
