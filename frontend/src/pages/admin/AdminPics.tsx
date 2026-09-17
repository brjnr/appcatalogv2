import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpDown, Eye, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPut } from "@/lib/api";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import { slugify, type Pic } from "@/lib/types";
import { InfraStatusBadge } from "@/components/catalog/InfraBits";
import { PicFormDialog } from "@/components/catalog/PicFormDialog";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { ConfirmDeleteDialog } from "@/components/catalog/ConfirmDeleteDialog";
import { SearchSelect } from "@/components/catalog/SearchSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default function AdminPicsPage() {
  return (
    <InfraNavProvider>
      <AdminPics />
    </InfraNavProvider>
  );
}

// PIC admin: register, edit, deactivate, delete, view details, assign apps/servers, standby.
function AdminPics() {
  const queryClient = useQueryClient();
  const { openPic } = useInfraNav();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Pic | null>(null);
  const [deleting, setDeleting] = useState<Pic | null>(null);
  const [deptFilter, setDeptFilter] = useState("");
  const [posFilter, setPosFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const { data: pics, isLoading } = useQuery({
    queryKey: ["pics"],
    queryFn: () => apiGet<Pic[]>("/pics"),
  });

  const toggleStatus = useMutation({
    mutationFn: (pic: Pic) =>
      apiPut<Pic>(`/pics/${pic.id}`, { status: pic.status === "Active" ? "Inactive" : "Active" }),
    onSuccess: (pic) => {
      queryClient.invalidateQueries({ queryKey: ["pics"] });
      toast.success(`${pic.name} set to ${pic.status}`);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const deletePic = useMutation({
    mutationFn: (pic: Pic) => apiDelete<void>(`/pics/${pic.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pics"] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.success("PIC deleted");
      setDeleting(null);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const filtered = (pics ?? [])
    .filter((pic) => {
      const q = search.trim().toLowerCase();
      if (deptFilter && pic.department_id !== deptFilter) return false;
      if (posFilter && pic.position !== posFilter) return false;
      if (statusFilter && pic.status !== statusFilter) return false;
      if (!q) return true;
      return `${pic.name} ${pic.initials} ${pic.email} ${pic.employee_id} ${pic.department} ${pic.position}`
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      const pick = (pic: Pic): string => {
        switch (sort.key) {
          case "initials":
            return pic.initials;
          case "employee":
            return pic.employee_id;
          case "department":
            return pic.department;
          case "position":
            return pic.position;
          case "email":
            return pic.email;
          case "apps":
            return String(pic.applications.length).padStart(4, "0");
          case "servers":
            return String(pic.servers.length).padStart(4, "0");
          case "standby":
            return String(pic.standby_schedule.length).padStart(4, "0");
          case "status":
            return pic.status;
          default:
            return pic.name;
        }
      };
      return pick(a).localeCompare(pick(b)) * sort.dir || a.name.localeCompare(b.name);
    });

  const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
  const departmentOptions = [
    ...new Map(
      (pics ?? [])
        .filter((pic) => pic.department_id)
        .map((pic) => [pic.department_id, pic.department]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const positionOptions = uniq((pics ?? []).map((pic) => pic.position));
  const statusOptions = uniq((pics ?? []).map((pic) => pic.status));

  const toggleSort = (key: string) =>
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 1 ? -1 : 1 }));

  const SortHead = ({ id, label }: { id: string; label: string }) => (
    <TableHead>
      <button
        type="button"
        data-testid={`pic-sort-${id}`}
        onClick={() => toggleSort(id)}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
      >
        {label}
        <ArrowUpDown
          className={cn("h-3 w-3", sort.key === id ? "text-sky-600 dark:text-sky-300" : "opacity-40")}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );

  return (
    <div data-testid="pics-page" className="pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            PIC Management
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pics?.length ?? 0} people in charge. Applications, servers, and standby shifts can be
            assigned any time after registration.
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
              data-testid="pic-search-input"
              aria-label="Search PICs"
              placeholder="Name, initials, email…"
              className="h-9 w-52 pl-8"
            />
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            data-testid="add-pic-btn"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add PIC
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="pic-column-filters">
        <SearchSelect
          testid="pic-department-filter"
          value={deptFilter}
          onChange={setDeptFilter}
          allLabel="Any department"
          placeholder="Search departments…"
          options={departmentOptions.map(([id, name]) => ({ id, label: name }))}
        />
        <SearchSelect
          testid="pic-position-filter"
          value={posFilter}
          onChange={setPosFilter}
          allLabel="Any position"
          placeholder="Search positions…"
          options={positionOptions.map((value) => ({ id: value, label: value }))}
        />
        <SearchSelect
          testid="pic-status-filter"
          value={statusFilter}
          onChange={setStatusFilter}
          allLabel="Any status"
          placeholder="Search status…"
          options={statusOptions.map((value) => ({ id: value, label: value }))}
        />
        <span className="text-xs text-muted-foreground" data-testid="pic-result-count">
          {filtered.length} of {pics?.length ?? 0} shown
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border bg-card" data-testid="pics-table">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead id="name" label="PIC" />
              <SortHead id="department" label="Department" />
              <SortHead id="position" label="Position" />
              <SortHead id="email" label="Contact" />
              <SortHead id="apps" label="Applications" />
              <SortHead id="servers" label="Servers" />
              <SortHead id="standby" label="Standby" />
              <SortHead id="status" label="Status" />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Loading PICs…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  No PICs match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((pic) => {
                const slug = slugify(pic.name);
                return (
                  <TableRow key={pic.id} data-testid={`pic-row-${slug}`}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openPic(pic.id)}
                        data-testid={`pic-row-name-${slug}`}
                        className="flex items-center gap-2 text-left"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white dark:bg-sky-600">
                          {pic.initials}
                        </span>
                        <span>
                          <span className="block font-medium text-sky-700 hover:underline dark:text-sky-300">
                            {pic.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {pic.employee_id || "—"}
                          </span>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell data-testid={`pic-department-${slug}`} className="text-sm">
                      {pic.department || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{pic.position || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="block">{pic.email || "—"}</span>
                      <span className="block">{pic.phone || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-48 flex-wrap gap-1">
                        {pic.applications.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                          pic.applications.map((app) => (
                            <Badge key={app.id} variant="outline" className="text-[11px]">
                              {app.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-40 flex-wrap gap-1">
                        {pic.servers.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                          pic.servers.map((server) => (
                            <Badge
                              key={server.id}
                              variant="secondary"
                              className="font-mono text-[11px]"
                            >
                              {server.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`pic-standby-count-${slug}`}>
                      {pic.standby_schedule_out.length} shift
                      {pic.standby_schedule_out.length === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell>
                      <InfraStatusBadge status={pic.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`View ${pic.name}`}
                          title="View details"
                          data-testid={`pic-view-btn-${slug}`}
                          onClick={() => openPic(pic.id)}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${pic.name}`}
                          title="Edit PIC"
                          data-testid={`pic-edit-btn-${slug}`}
                          onClick={() => {
                            setEditing(pic);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Toggle status of ${pic.name}`}
                          title="Activate / deactivate"
                          data-testid={`pic-toggle-btn-${slug}`}
                          onClick={() => toggleStatus.mutate(pic)}
                        >
                          <Power className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${pic.name}`}
                          title="Delete PIC"
                          data-testid={`pic-delete-btn-${slug}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(pic)}
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

      <PicFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        appName={deleting?.name ?? ""}
        pending={deletePic.isPending}
        onConfirm={() => deleting && deletePic.mutate(deleting)}
      />
      <ServerDrawer />
      <PicDrawer />
    </div>
  );
}
