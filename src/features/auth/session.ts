import { Octokit } from "@octokit/rest";

const TOKEN_KEY = "openapi.github.pat";

let cached: { token: string; octokit: Octokit } | null = null;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  cached = null;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  cached = null;
}

export function getOctokit(): Octokit {
  const token = getToken();
  if (!token) {
    throw new Error("未登录：缺少 GitHub PAT");
  }
  if (cached?.token !== token) {
    cached = { token, octokit: new Octokit({ auth: token }) };
  }
  return cached.octokit;
}
