import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPut } from "@/lib/api";
import type { AppCategory, SessionUser } from "@/lib/types";
import { ROLE_LABELS, slugify } from "@/lib/types";
import { UserFormDialog } from "@/components/catalog/UserFormDialog";
import { ConfirmDeleteDialog } from "@/components/catalog/ConfirmDeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Users admin: create/edit/delete/deactivate, assign role and app categories.
export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SessionUser | null>(null);
  const [deleting, setDeleting] = useState<SessionUser | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<SessionUser[]>("/users"),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories", "admin"],
    queryFn: () => apiGet<AppCategory[]>("/categories?include_inactive=true"),
  });

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories ?? []) map.set(category.id, category.name);
    return map;
  }, [categories]);

  const toggleActive = useMutation({
    mutationFn: (user: SessionUser) =>
      apiPut<SessionUser>(`/users/${user.id}`, { is_active: !user.is_active }),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(user.is_active ? `${user.name} reactivated` : `${user.name} deactivated`);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const deleteUser = useMutation({
    mutationFn: (user: SessionUser) => apiDelete<void>(`/users/${user.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted");
      setDeleting(null);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const filtered = (users ?? []).filter((user) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${user.name} ${user.username} ${user.email}`.toLowerCase().includes(q);
  });

  return (
    <div data-testid="users-page" className="pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Users
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Accounts, roles, and category assignments.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              data-testid="user-search-input"
              aria-label="Search users"
              placeholder="Search users…"
              className="h-9 w-48 pl-8"
            />
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            data-testid="add-user-btn"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add User
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border bg-card" data-testid="users-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Assigned categories</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Loading users…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No users match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => {
                const slug = slugify(user.email);
                return (
                  <TableRow key={user.id} data-testid={`user-row-${slug}`}>
                    <TableCell>
                      <div className="font-medium text-foreground">{user.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {user.username ? `@${user.username} · ` : ""}
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.role === "administrator" ? "default" : "secondary"}
                        data-testid={`user-role-${slug}`}
                      >
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-72 flex-wrap gap-1">
                        {user.role === "administrator" ? (
                          <span className="text-xs text-muted-foreground">All categories</span>
                        ) : user.assigned_category_ids.length === 0 ? (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            No access — assign categories
                          </span>
                        ) : (
                          user.assigned_category_ids.map((id) => (
                            <Badge key={id} variant="outline" className="text-[11px]">
                              {categoryNames.get(id) ?? id}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        data-testid={`user-status-${slug}`}
                        className={
                          user.is_active
                            ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                            : "text-xs font-medium text-red-600 dark:text-red-400"
                        }
                      >
                        {user.is_active ? "Active" : "Deactivated"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${user.name}`}
                          title="Edit user"
                          data-testid={`user-edit-btn-${slug}`}
                          onClick={() => {
                            setEditing(user);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={user.is_active ? `Deactivate ${user.name}` : `Activate ${user.name}`}
                          title={user.is_active ? "Deactivate" : "Activate"}
                          data-testid={`user-toggle-btn-${slug}`}
                          onClick={() => toggleActive.mutate(user)}
                        >
                          <Power className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${user.name}`}
                          title="Delete user"
                          data-testid={`user-delete-btn-${slug}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(user)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        appName={deleting ? `${deleting.name} (${deleting.email})` : ""}
        pending={deleteUser.isPending}
        onConfirm={() => deleting && deleteUser.mutate(deleting)}
      />
    </div>
  );
}
