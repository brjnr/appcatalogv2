import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPut } from "@/lib/api";
import type { AppCategory, CatalogApp } from "@/lib/types";
import { slugify } from "@/lib/types";
import { CategoryFormDialog } from "@/components/catalog/CategoryFormDialog";
import { ConfirmDeleteDialog } from "@/components/catalog/ConfirmDeleteDialog";
import { CategoryIcon } from "@/components/catalog/CategoryIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// App Categories admin: create, edit, icon upload/replace/remove, activate/deactivate, delete.
export default function AdminCategories() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AppCategory | null>(null);
  const [deleting, setDeleting] = useState<AppCategory | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories", "admin"],
    queryFn: () => apiGet<AppCategory[]>("/categories?include_inactive=true"),
  });
  const { data: apps } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
  });

  const appCount = (categoryId: string) =>
    (apps ?? []).filter((app) => app.category_id === categoryId).length;

  const toggleStatus = useMutation({
    mutationFn: (category: AppCategory) =>
      apiPut<AppCategory>(`/categories/${category.id}`, {
        status: category.status === "active" ? "inactive" : "active",
      }),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(
        category.status === "active"
          ? `${category.name} activated`
          : `${category.name} deactivated (hidden from browsing)`,
      );
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const deleteCategory = useMutation({
    mutationFn: (category: AppCategory) => apiDelete<void>(`/categories/${category.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category deleted");
      setDeleting(null);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div data-testid="categories-page" className="pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            App Categories
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Group applications and control who sees them. Inactive categories are hidden from
            browsing and new assignments.
          </p>
        </div>
        <Button
          className="ml-auto"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          data-testid="add-category-btn"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="category-grid">
          {(categories ?? []).map((category) => {
            const slug = slugify(category.name);
            const count = appCount(category.id);
            return (
              <Card key={category.id} data-testid={`category-card-${slug}`} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                    <CategoryIcon
                      icon={category.icon}
                      iconUrl={category.icon_url}
                      className="h-6 w-6 text-sky-600 dark:text-sky-300"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-heading text-sm font-semibold text-foreground">
                        {category.name}
                      </h2>
                      <span
                        data-testid={`category-status-badge-${slug}`}
                        className={
                          category.status === "active"
                            ? "shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                            : "shrink-0 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {category.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
                      {category.description || "No description"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <Badge variant="outline" className="text-[11px]" data-testid={`category-app-count-${slug}`}>
                    {count} application{count === 1 ? "" : "s"}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Edit ${category.name}`}
                      title="Edit category"
                      data-testid={`category-edit-btn-${slug}`}
                      onClick={() => {
                        setEditing(category);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={category.status === "active" ? `Deactivate ${category.name}` : `Activate ${category.name}`}
                      title={category.status === "active" ? "Deactivate" : "Activate"}
                      data-testid={`category-toggle-btn-${slug}`}
                      onClick={() => toggleStatus.mutate(category)}
                    >
                      <Power className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${category.name}`}
                      title="Delete category"
                      data-testid={`category-delete-btn-${slug}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(category)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        appName={deleting?.name ?? ""}
        pending={deleteCategory.isPending}
        onConfirm={() => deleting && deleteCategory.mutate(deleting)}
      />
    </div>
  );
}
