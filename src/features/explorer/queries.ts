import { queryOptions } from "@tanstack/react-query";
import { getOctokit } from "@/features/auth/session";
import { getFileContent, listBranches, listOpenApiFiles, listRepos } from "@/lib/github";

export const reposQuery = () =>
  queryOptions({
    queryKey: ["repos"],
    queryFn: () => listRepos(getOctokit()),
  });

export const branchesQuery = (owner: string, repo: string) =>
  queryOptions({
    queryKey: ["branches", owner, repo],
    queryFn: () => listBranches(getOctokit(), owner, repo),
  });

export const treeQuery = (owner: string, repo: string, ref: string) =>
  queryOptions({
    queryKey: ["tree", owner, repo, ref],
    queryFn: () => listOpenApiFiles(getOctokit(), owner, repo, ref),
  });

export const fileQuery = (owner: string, repo: string, path: string, ref: string) =>
  queryOptions({
    queryKey: ["file", owner, repo, path, ref],
    queryFn: () => getFileContent(getOctokit(), { owner, repo, path, ref }),
    staleTime: 0,
  });
