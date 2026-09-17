import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, LayoutGrid, LockKeyhole } from "lucide-react";
import { apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { SessionUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SessionUser | null>("/auth/me"),
    retry: false,
  });

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const login = useMutation({
    mutationFn: () =>
      // The backend accepts either an email or a username in the ``email`` field
      // — the shape is preserved for API compatibility, the meaning is broader.
      apiPost<SessionUser>("/auth/login", { email: identifier.trim(), password }),
    onSuccess: (u) => {
      beginSession();
      toast.success(`Welcome back, ${u.name}`);
      navigate(from, { replace: true });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    login.mutate();
  };

  if (!isLoading && user) return <Navigate to={from} replace />;

  return (
    <div data-testid="login-page" className="grid min-h-svh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-10 lg:flex dark:bg-[#0B0F17]">
        <div className="bg-grid-pattern absolute inset-0" aria-hidden="true" />
        <div
          className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-heading text-lg font-semibold tracking-tight text-white">
            Application Catalog
          </span>
        </div>
        <div className="relative">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-white">
            One portal for every enterprise application.
          </h1>
          <p className="mt-4 max-w-md text-slate-400">
            Search, filter, and open the systems you need — with access tailored to the categories
            assigned to you.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-slate-300">
            <li className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-sky-400" aria-hidden="true" />
              Role-based access enforced on the server
            </li>
            <li className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-sky-400" aria-hidden="true" />
              Grid, list, A–Z, category, and compact views
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Internal use only</p>
      </div>

      {/* Login form */}
      <div className="flex items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-md p-8">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white">
              <Building2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-heading text-base font-semibold tracking-tight">
              Application Catalog
            </span>
          </div>
          <h2 data-testid="login-heading" className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Sign in
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your enterprise account to continue.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="login-email">Email or username</Label>
              <Input
                id="login-email"
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                data-testid="login-email-input"
                placeholder="you@corp.com  or  your.username"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                data-testid="login-password-input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p
                data-testid="login-error"
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={login.isPending}
              data-testid="login-submit-btn"
            >
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div
            data-testid="demo-credentials"
            className="mt-6 rounded-lg border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground"
          >
            <p className="font-medium text-foreground">Demo accounts</p>
            <p className="mt-1 font-mono">
              admin@corp.com  (or username: admin) / Admin!Passw0rd_1 — Administrator
            </p>
            <p className="font-mono">
              john.doe@corp.com  (or username: john.doe) / User!Passw0rd_1 — Security + Monitoring
            </p>
            <p className="font-mono">
              maria.garcia@corp.com  (or username: maria.garcia) / User!Passw0rd_1 — HR + Finance
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
