import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPut } from "@/lib/api";
import { formatCount } from "@/lib/format";
import type { AppCategory, CatalogApp } from "@/lib/types";
import { slugify } from "@/lib/types";
import { AppFormDialog } from "@/components/catalog/AppFormDialog";
import { AppIcon } from "@/components/catalog/AppIcon";
import { ConfirmDeleteDialog } from "@/components/catalog/ConfirmDeleteDialog";
import { StatusBadge } from "@/components/catalog/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Applications admin: register, edit, and delete apps; assign them to categories.
export default function AdminApplications() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogApp | null>(null);
  const [deleting, setDeleting] = useState<CatalogApp | null>(null);

  const { data: apps, isLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories", "admin"],
    queryFn: () => apiGet<AppCategory[]>("/categories?include_inactive=true"),
  });

  const categoryNames = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const deleteApp = useMutation({
    mutationFn: (app: CatalogApp) => apiDelete<void>(`/apps/${app.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success("Application deleted");
      setDeleting(null);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div data-testid="applications-page" className="pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Applications
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {apps?.length ?? 0} registered. Each application belongs to one category.
          </p>
        </div>
        <Button
          className="ml-auto"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          data-testid="add-application-btn"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add Application
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border bg-card" data-testid="applications-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Loading applications…
                </TableCell>
              </TableRow>
            ) : (apps ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No applications registered yet.
                </TableCell>
              </TableRow>
            ) : (
              (apps ?? []).map((app) => {
                const slug = slugify(app.name);
                return (
                  <TableRow key={app.id} data-testid={`app-row-${slug}`}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
                          <AppIcon name={app.icon} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{app.name}</div>
                          <div className="max-w-56 truncate font-mono text-[11px] text-muted-foreground">
                            {app.url}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`app-row-category-${slug}`}>
                      {app.category_name}
                    </TableCell>
                    <TableCell>{app.environment}</TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${app.name}`}
                          title="Edit application"
                          data-testid={`app-row-edit-${slug}`}
                          onClick={() => {
                            setEditing(app);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${app.name}`}
                          title="Delete application"
                          data-testid={`app-row-delete-${slug}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(app)}
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

      <AppFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        appName={deleting?.name ?? ""}
        pending={deleteApp.isPending}
        onConfirm={() => deleting && deleteApp.mutate(deleting)}
      />
    </div>
  );
}
