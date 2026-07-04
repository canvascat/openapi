import { infiniteQueryOptions } from "@tanstack/react-query";
import { getOctokit } from "@/features/auth/session";
import { COMMITS_PAGE_SIZE, listFileCommits } from "@/lib/github";

export const commitsInfiniteQuery = (owner: string, repo: string, path: string, ref: string) =>
  infiniteQueryOptions({
    queryKey: ["commits", owner, repo, path, ref],
    queryFn: ({ pageParam }) => listFileCommits(getOctokit(), owner, repo, path, ref, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === COMMITS_PAGE_SIZE ? lastPageParam + 1 : undefined,
  });
