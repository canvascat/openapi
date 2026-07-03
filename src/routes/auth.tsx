import { createFileRoute, redirect } from "@tanstack/react-router";
import { PatForm } from "@/features/auth/pat-form";
import { getToken } from "@/features/auth/session";

export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    if (getToken()) {
      throw redirect({ to: "/repos" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <PatForm />
      </div>
    </div>
  );
}
