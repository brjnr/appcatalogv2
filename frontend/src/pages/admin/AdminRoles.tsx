import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, User } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { SessionUser } from "@/lib/types";
import { Card } from "@/components/ui/card";

const CAPABILITIES = {
  administrator: [
    "Full access to every application and category",
    "User management: create, edit, deactivate, delete",
    "Role and category assignment",
    "Category management with custom icons",
    "Application management: add, edit, delete",
  ],
  normal_user: [
    "Sees only applications in assigned categories",
    "Direct URL access to unassigned apps is denied by the backend",
    "Can search, filter, favorite, and launch assigned apps",
    "Personal preferences (layout, sort, favorites) per browser",
  ],
};

// Roles overview: the two built-in roles and what each can do.
export default function AdminRoles() {
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<SessionUser[]>("/users"),
  });

  const admins = (users ?? []).filter((u) => u.role === "administrator");
  const normals = (users ?? []).filter((u) => u.role === "normal_user");

  return (
    <div data-testid="roles-page" className="pb-10">
      <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">Roles</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        The two built-in roles. Access is enforced on the backend for every request.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-6" data-testid="role-card-administrator">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-base font-semibold text-foreground">Administrator</h2>
            </div>
            <span data-testid="role-admin-count" className="text-sm text-muted-foreground">
              {admins.length} member{admins.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            {CAPABILITIES.administrator.map((capability) => (
              <li key={capability} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
                {capability}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            Members: {admins.map((a) => a.name).join(", ") || "—"}
          </p>
        </Card>

        <Card className="p-6" data-testid="role-card-normal-user">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
                <User className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-base font-semibold text-foreground">Normal User</h2>
            </div>
            <span data-testid="role-normal-count" className="text-sm text-muted-foreground">
              {normals.length} member{normals.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            {CAPABILITIES.normal_user.map((capability) => (
              <li key={capability} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
                {capability}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            Members: {normals.map((n) => n.name).join(", ") || "—"}
          </p>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="font-heading text-sm font-semibold text-foreground">How access is decided</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Login → session cookie → user role → assigned categories → allowed applications.
          Administrators bypass category assignments; normal users are restricted to the categories
          set on the Users or Access Management pages. The backend filters list results, denies
          detail-page requests with 403, and rejects unauthorized launches.
        </p>
      </Card>
    </div>
  );
}
