import { Octokit } from "@octokit/rest";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-8 items-center justify-center rounded-md">
              <KeyRound className="size-6" />
            </div>
            <h1 className="text-xl font-bold">登录 OpenAPI 文档管理</h1>
            <FieldDescription>使用 Fine-grained PAT 访问你的文档仓库</FieldDescription>
          </div>
          <Field>
            <FieldLabel htmlFor="pat">Fine-grained PAT</FieldLabel>
            <Input
              id="pat"
              type="password"
              placeholder="github_pat_..."
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
            />
          </Field>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Field>
            <Button type="submit" disabled={pending}>
              {pending ? "校验中..." : "登录"}
            </Button>
          </Field>
          <FieldSeparator>或</FieldSeparator>
          <Field>
            <Button variant="outline" type="button" disabled title="即将推出">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="size-4"
                aria-hidden="true"
              >
                <path
                  d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                  fill="currentColor"
                />
              </svg>
              使用 GitHub 登录（即将推出）
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        没有 Token？
        <a
          className="ml-1 underline underline-offset-4"
          href="https://github.com/settings/personal-access-tokens/new"
          target="_blank"
          rel="noreferrer"
        >
          去 GitHub 生成一个
        </a>
      </FieldDescription>
    </div>
  );
}
