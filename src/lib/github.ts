import type { Octokit } from "@octokit/rest";
import { isOpenApiCandidate } from "./openapi";

export function decodeBase64(b64: string): string {
  const bytes = Uint8Array.from(atob(b64.replaceAll("\n", "")), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

export type GithubErrorKind =
  | "unauthorized"
  | "rate-limited"
  | "conflict"
  | "not-found"
  | "unknown";

export function classifyGithubError(err: unknown): GithubErrorKind {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: unknown }).status
      : undefined;
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
    case 429:
      return "rate-limited";
    case 404:
      return "not-found";
    case 409:
      return "conflict";
    default:
      return "unknown";
  }
}

export interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  defaultBranch: string;
  updatedAt: string | null;
}

export async function listRepos(octokit: Octokit): Promise<RepoSummary[]> {
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "updated",
  });
  return repos.map((r) => ({
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    isPrivate: r.private,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at ?? null,
  }));
}

export async function listBranches(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string[]> {
  const branches = await octokit.paginate(octokit.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
  });
  return branches.map((b) => b.name);
}

export interface TreeFile {
  path: string;
  sha: string;
}

export async function listOpenApiFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<TreeFile[]> {
  const { data: branch } = await octokit.repos.getBranch({ owner, repo, branch: ref });
  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch.commit.sha,
    recursive: "true",
  });
  return data.tree
    .filter((n) => n.type === "blob" && n.path !== undefined && isOpenApiCandidate(n.path))
    .map((n) => ({ path: n.path!, sha: n.sha! }));
}

export interface FileContent {
  text: string;
  sha: string;
}

export async function getFileContent(
  octokit: Octokit,
  opts: { owner: string; repo: string; path: string; ref: string },
): Promise<FileContent> {
  const { data } = await octokit.repos.getContent(opts);
  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`不是文件：${opts.path}`);
  }
  if (data.size === 0) {
    return { text: "", sha: data.sha };
  }
  if (data.encoding !== "base64" || data.content === "") {
    throw new Error("文件超过 1MB，暂不支持在线编辑");
  }
  return { text: decodeBase64(data.content), sha: data.sha };
}

export async function saveFileContent(
  octokit: Octokit,
  opts: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    content: string;
    sha: string;
    message: string;
  },
): Promise<string> {
  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner: opts.owner,
    repo: opts.repo,
    path: opts.path,
    branch: opts.branch,
    message: opts.message,
    content: encodeBase64(opts.content),
    sha: opts.sha,
  });
  const newSha = data.content?.sha;
  if (!newSha) {
    throw new Error("GitHub 未返回新文件 SHA");
  }
  return newSha;
}
