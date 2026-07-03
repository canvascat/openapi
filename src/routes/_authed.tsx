import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getToken } from "@/features/auth/session";

export const Route = createFileRoute("/_authed")({
  beforeLoad: () => {
    if (!getToken()) {
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
