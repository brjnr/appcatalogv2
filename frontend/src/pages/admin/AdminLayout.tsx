import { NavLink, Navigate, Outlet, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppWindow, ArrowLeftRight, Building, ContactRound, KeyRound, LayoutGrid, Network, Plug, ServerIcon, ShieldBan, ShieldCheck, Shapes, Users } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { SessionUser } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";
import { AppNavbar } from "@/components/catalog/AppNavbar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MENUS = [
  { to: "/admin", label: "Dashboard", icon: LayoutGrid, end: true, testid: "admin-nav-dashboard" },
  { to: "/admin/users", label: "Users", icon: Users, end: false, testid: "admin-nav-users" },
  { to: "/admin/roles", label: "Roles", icon: ShieldCheck, end: false, testid: "admin-nav-roles" },
  { to: "/admin/categories", label: "App Categories", icon: Shapes, end: false, testid: "admin-nav-categories" },
  { to: "/admin/applications", label: "Applications", icon: AppWindow, end: false, testid: "admin-nav-applications" },
  { to: "/admin/servers", label: "Servers", icon: ServerIcon, end: false, testid: "admin-nav-servers" },
  { to: "/admin/pics", label: "PIC Management", icon: ContactRound, end: false, testid: "admin-nav-pics" },
  { to: "/admin/departments", label: "Departments", icon: Building, end: false, testid: "admin-nav-departments" },
  { to: "/admin/access", label: "Access Management", icon: KeyRound, end: false, testid: "admin-nav-access" },
  { to: "/admin/dependency-map", label: "Dependency Map", icon: Network, end: false, testid: "admin-nav-dependency-map" },
  { to: "/admin/import-export", label: "Import / Export", icon: ArrowLeftRight, end: false, testid: "admin-nav-import-export" },
  { to: "/admin/integrations", label: "Integrations", icon: Plug, end: false, testid: "admin-nav-integrations" },
];

// Admin console shell: guards the whole subtree — login required, administrator role required.
export default function AdminLayout() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SessionUser | null>("/auth/me"),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-svh bg-background">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="h-80 animate-pulse rounded-xl border bg-muted/40" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: "/admin" }} />;
  }

  if (user.role !== "administrator") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4">
        <Card className="max-w-md p-8 text-center" data-testid="admin-denied">
          <ShieldBan className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <p className="mt-3 font-medium text-foreground">Administrator access required</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your role ({ROLE_LABELS[user.role]}) does not include the admin console. Contact an
            administrator if you believe this is a mistake.
          </p>
          <Link to="/" className={buttonVariants({ variant: "outline" }) + " mt-5"}>
            Back to catalog
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      <AppNavbar user={user} />
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-52 shrink-0 md:block">
          <nav className="sticky top-20 flex flex-col gap-1" aria-label="Admin">
            {MENUS.map((menu) => (
              <NavLink
                key={menu.to}
                to={menu.to}
                end={menu.end}
                data-testid={menu.testid}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <menu.icon className="h-4 w-4" aria-hidden="true" />
                {menu.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex gap-1 overflow-x-auto pb-1 md:hidden">
            {MENUS.map((menu) => (
              <NavLink
                key={menu.to}
                to={menu.to}
                end={menu.end}
                data-testid={`${menu.testid}-mobile`}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300"
                      : "border-border text-muted-foreground",
                  )
                }
              >
                {menu.label}
              </NavLink>
            ))}
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
