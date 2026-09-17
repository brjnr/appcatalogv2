import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppWindow, KeyRound, Shapes, Users } from "lucide-react";
import { apiGet } from "@/lib/api";
import { formatCount } from "@/lib/format";
import type { AppCategory, CatalogApp, SessionUser, Server } from "@/lib/types";
import { LOCATION_LABELS, SERVER_LOCATIONS, slugify } from "@/lib/types";
import { Card } from "@/components/ui/card";

// Admin overview: directory sizes, role split, and category coverage.
export default function AdminDashboard() {
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<SessionUser[]>("/users"),
  });
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories", "admin"],
    queryFn: () => apiGet<AppCategory[]>("/categories?include_inactive=true"),
  });
  const { data: apps, isLoading: appsLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
  });

  const { data: servers } = useQuery({
    queryKey: ["servers"],
    queryFn: () => apiGet<Server[]>("/servers"),
  });

  const siteCoverage = SERVER_LOCATIONS.map((site) => ({
    site,
    count: (servers ?? []).filter((server) => server.location === site).length,
  }));
  const totalServers = servers?.length ?? 0;

  const allUsers = users ?? [];
  const admins = allUsers.filter((u) => u.role === "administrator").length;
  const assigned = allUsers.filter((u) => u.role === "normal_user" && u.assigned_category_ids.length > 0).length;
  const activeCategories = (categories ?? []).filter((c) => c.status === "active");
  const appsByCategory = activeCategories
    .map((category) => ({
      category,
      count: (apps ?? []).filter((app) => app.category_id === category.id).length,
    }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...appsByCategory.map((entry) => entry.count));

  return (
    <div data-testid="admin-dashboard" className="pb-10">
      <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
        Dashboard
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage users, roles, categories, and application access.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5" data-testid="stat-users-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Users
            </span>
            <Users className="h-4 w-4 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          </div>
          <p data-testid="stat-users" className="mt-2 font-heading text-2xl font-semibold">
            {usersLoading ? "—" : allUsers.length}
          </p>
          <p className="text-xs text-muted-foreground">{admins} administrator(s)</p>
        </Card>
        <Card className="p-5" data-testid="stat-categories-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Categories
            </span>
            <Shapes className="h-4 w-4 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          </div>
          <p data-testid="stat-categories" className="mt-2 font-heading text-2xl font-semibold">
            {categoriesLoading ? "—" : (categories?.length ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">{activeCategories.length} active</p>
        </Card>
        <Card className="p-5" data-testid="stat-applications-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Applications
            </span>
            <AppWindow className="h-4 w-4 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          </div>
          <p data-testid="stat-applications" className="mt-2 font-heading text-2xl font-semibold">
            {appsLoading ? "—" : (apps?.length ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            across {activeCategories.length} active categories
          </p>
        </Card>
        <Card className="p-5" data-testid="stat-assignments-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Assignments
            </span>
            <KeyRound className="h-4 w-4 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          </div>
          <p data-testid="stat-assignments" className="mt-2 font-heading text-2xl font-semibold">
            {usersLoading
              ? "—"
              : `${assigned}/${allUsers.filter((u) => u.role === "normal_user").length}`}
          </p>
          <p className="text-xs text-muted-foreground">normal users with categories</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-heading text-sm font-semibold text-foreground">
            Applications per category
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {appsByCategory.map(({ category, count }) => (
              <div key={category.id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                  {category.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5" data-testid="site-coverage-card">
          <h2 className="font-heading text-sm font-semibold text-foreground">Site coverage</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {totalServers} server(s) across DC, DRC, cloud, and co-location sites.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {siteCoverage.map(({ site, count }) => (
              <div
                key={site}
                data-testid={`site-coverage-${slugify(site)}`}
                className="rounded-lg border p-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs font-semibold text-sky-700 dark:text-sky-300">
                    {site}
                  </span>
                  <span className="font-heading text-lg font-semibold text-foreground">{count}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {LOCATION_LABELS[site]}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
                    style={{ width: `${totalServers ? (count / totalServers) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/admin/servers"
            data-testid="site-coverage-link"
            className="mt-3 inline-block text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            Filter servers by site →
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="font-heading text-sm font-semibold text-foreground">Quick actions</h2>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <Link to="/admin/users" data-testid="quick-link-users" className="rounded-lg border px-3 py-2 transition-colors hover:bg-muted">
              Add or edit users, assign roles
            </Link>
            <Link to="/admin/categories" data-testid="quick-link-categories" className="rounded-lg border px-3 py-2 transition-colors hover:bg-muted">
              Create categories and upload icons
            </Link>
            <Link to="/admin/departments" data-testid="quick-link-departments" className="rounded-lg border px-3 py-2 transition-colors hover:bg-muted">
              Create departments for the standby roster
            </Link>
            <Link to="/admin/access" data-testid="quick-link-access" className="rounded-lg border px-3 py-2 transition-colors hover:bg-muted">
              Assign categories to users
            </Link>
            <Link to="/admin/dependency-map" data-testid="quick-link-dependency-map" className="rounded-lg border px-3 py-2 transition-colors hover:bg-muted">
              See which applications share servers
            </Link>
            <Link to="/admin/applications" data-testid="quick-link-applications" className="rounded-lg border px-3 py-2 transition-colors hover:bg-muted">
              Register and manage applications
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
