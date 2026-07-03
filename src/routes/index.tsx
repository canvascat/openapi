import { createFileRoute, redirect } from "@tanstack/react-router";
import { getToken } from "@/features/auth/session";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: getToken() ? "/repos" : "/auth" });
  },
});
