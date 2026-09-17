import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, Users } from "lucide-react";
import { apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import type { AppCategory, SessionUser } from "@/lib/types";
import { ROLE_LABELS, slugify } from "@/lib/types";
import { CategoryIcon } from "@/components/catalog/CategoryIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Access Management: bulk assignment panel + the user × category matrix. Every change is
// saved immediately and enforced by the backend on the next request.
export default function AdminAccess() {
  const queryClient = useQueryClient();
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkUserIds, setBulkUserIds] = useState<string[]>([]);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<SessionUser[]>("/users"),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<AppCategory[]>("/categories"),
  });

  const assign = useMutation({
    mutationFn: ({ user, ids }: { user: SessionUser; ids: string[] }) =>
      apiPut<SessionUser>(`/users/${user.id}`, { assigned_category_ids: ids }),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${user.name}'s categories updated`);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  // One request assigns/unassigns a category across every selected user.
  const bulkAssign = useMutation({
    mutationFn: (assignFlag: boolean) =>
      apiPost<SessionUser[]>("/users/bulk-assign-category", {
        category_id: bulkCategoryId,
        user_ids: bulkUserIds,
        assign: assignFlag,
      }),
    onSuccess: (_result, assignFlag) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      const categoryName =
        (categories ?? []).find((c) => c.id === bulkCategoryId)?.name ?? "category";
      toast.success(
        assignFlag
          ? `${categoryName} assigned to ${bulkUserIds.length} user(s)`
          : `${categoryName} removed from ${bulkUserIds.length} user(s)`,
      );
      setBulkUserIds([]);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const runBulk = (assignFlag: boolean) => {
    if (!bulkCategoryId) {
      toast.error("Choose a category first");
      return;
    }
    if (bulkUserIds.length === 0) {
      toast.error("Select at least one user");
      return;
    }
    bulkAssign.mutate(assignFlag);
  };

  const toggle = (user: SessionUser, categoryId: string, checked: boolean) => {
    const ids = checked
      ? [...new Set([...user.assigned_category_ids, categoryId])]
      : user.assigned_category_ids.filter((id) => id !== categoryId);
    assign.mutate({ user, ids });
  };

  const assignableUsers = (users ?? []).filter((u) => u.role !== "administrator");
  const allSelected =
    assignableUsers.length > 0 && bulkUserIds.length === assignableUsers.length;

  return (
    <div data-testid="access-page" className="pb-10">
      <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
        Access Management
      </h1>
      <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
        Assign app categories to users. Normal users can only see and open applications in their
        assigned categories — even if they type an application's URL directly. Administrators
        always have full access.
      </p>

      {/* Bulk assignment — one category across many users at once */}
      <Card className="mt-4 p-5" data-testid="bulk-assign-panel">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          <h2 className="font-heading text-sm font-semibold text-foreground">Bulk assignment</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick one category, select the users, then assign or remove it for all of them in a single
          step. Administrators are skipped — they already have everything.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Category</span>
            <Select value={bulkCategoryId} onValueChange={setBulkCategoryId}>
              <SelectTrigger
                data-testid="bulk-category-select"
                aria-label="Category to assign in bulk"
                className="w-56"
              >
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => runBulk(true)}
            disabled={bulkAssign.isPending}
            data-testid="bulk-assign-btn"
          >
            <Users className="h-4 w-4" aria-hidden="true" /> Assign to selected
          </Button>
          <Button
            variant="outline"
            onClick={() => runBulk(false)}
            disabled={bulkAssign.isPending}
            data-testid="bulk-unassign-btn"
          >
            Remove from selected
          </Button>
          <span
            data-testid="bulk-selected-count"
            className="ml-auto text-xs font-medium text-muted-foreground"
          >
            {bulkUserIds.length} user(s) selected
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) =>
                setBulkUserIds(checked === true ? assignableUsers.map((u) => u.id) : [])
              }
              data-testid="bulk-select-all"
            />
            Select all normal users
          </label>
          {assignableUsers.map((user) => (
            <label
              key={user.id}
              className="flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs text-foreground"
            >
              <Checkbox
                checked={bulkUserIds.includes(user.id)}
                onCheckedChange={(checked) =>
                  setBulkUserIds((prev) =>
                    checked === true
                      ? [...new Set([...prev, user.id])]
                      : prev.filter((id) => id !== user.id),
                  )
                }
                data-testid={`bulk-user-checkbox-${slugify(user.email)}`}
              />
              {user.name}
            </label>
          ))}
        </div>
      </Card>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card" data-testid="access-matrix">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card">User</TableHead>
              {(categories ?? []).map((category) => (
                <TableHead key={category.id} className="min-w-32">
                  <span className="flex items-center gap-1.5">
                    <CategoryIcon
                      icon={category.icon}
                      iconUrl={category.icon_url}
                      className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300"
                    />
                    <span className="truncate">{category.name}</span>
                  </span>
                </TableHead>
              ))}
              <TableHead className="text-right">Assigned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={(categories?.length ?? 0) + 2} className="py-10 text-center text-muted-foreground">
                  Loading assignments…
                </TableCell>
              </TableRow>
            ) : (
              (users ?? []).map((user) => {
                const slug = slugify(user.email);
                const isAdmin = user.role === "administrator";
                return (
                  <TableRow key={user.id} data-testid={`access-user-${slug}`}>
                    <TableCell className="sticky left-0 bg-card">
                      <div className="font-medium text-foreground">{user.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {user.email}
                        <Badge
                          variant={isAdmin ? "default" : "secondary"}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      </div>
                    </TableCell>
                    {(categories ?? []).map((category) => (
                      <TableCell key={category.id}>
                        <Checkbox
                          checked={isAdmin || user.assigned_category_ids.includes(category.id)}
                          disabled={isAdmin}
                          onCheckedChange={(checked) => toggle(user, category.id, checked === true)}
                          aria-label={`${isAdmin ? "Administrators have all categories" : `Assign ${category.name} to ${user.name}`}`}
                          data-testid={`access-checkbox-${slug}-${slugify(category.name)}`}
                          className={isAdmin ? "opacity-50" : undefined}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right text-sm text-muted-foreground" data-testid={`access-count-${slug}`}>
                      {isAdmin ? "All" : user.assigned_category_ids.length}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
