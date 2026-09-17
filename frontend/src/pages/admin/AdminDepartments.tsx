import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building, Pencil, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import { DEPARTMENT_STATUSES, slugify, type Department, type Pic, type SessionUser } from "@/lib/types";
import { PicBadge } from "@/components/catalog/PicBadge";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { ConfirmDeleteDialog } from "@/components/catalog/ConfirmDeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Departments admin: the organisational units PICs belong to, which in turn group the
// standby calendar (who is on standby in this department today, tomorrow, …).
export default function AdminDepartmentsPage() {
  return (
    <InfraNavProvider>
      <AdminDepartments />
    </InfraNavProvider>
  );
}

function AdminDepartments() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [detail, setDetail] = useState<Department | null>(null);

  const { data: departments, isLoading } = useQuery({
    queryKey: ["departments", "admin"],
    queryFn: () => apiGet<Department[]>("/departments?include_inactive=true"),
  });

  const remove = useMutation({
    mutationFn: (department: Department) => apiDelete<void>(`/departments/${department.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department deleted");
      setDeleting(null);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div data-testid="departments-page" className="pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight text-foreground">
            <Building className="h-5 w-5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
            Departments
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            {departments?.length ?? 0} department(s). Every PIC picks one, and the standby calendar
            groups the roster by department so you can see who covers each day.
          </p>
        </div>
        <Button
          className="ml-auto"
          data-testid="add-department-btn"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add Department
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border bg-card" data-testid="departments-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>PICs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Loading departments…
                </TableCell>
              </TableRow>
            ) : (departments ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No departments yet — add the first one.
                </TableCell>
              </TableRow>
            ) : (
              (departments ?? []).map((department) => {
                const slug = slugify(department.name);
                return (
                  <TableRow key={department.id} data-testid={`department-row-${slug}`}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setDetail(department)}
                        data-testid={`department-name-btn-${slug}`}
                        className="font-medium text-sky-700 transition-colors hover:underline dark:text-sky-300"
                      >
                        {department.name}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-sm text-sm text-muted-foreground">
                      {department.description || "—"}
                    </TableCell>
                    <TableCell data-testid={`department-pic-count-${slug}`}>
                      {department.pic_count}
                    </TableCell>
                    <TableCell>
                      <Badge variant={department.status === "active" ? "default" : "outline"}>
                        {department.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${department.name}`}
                          title="Edit department"
                          data-testid={`department-edit-btn-${slug}`}
                          onClick={() => {
                            setEditing(department);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${department.name}`}
                          title="Delete department"
                          data-testid={`department-delete-btn-${slug}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(department)}
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

      <DepartmentDetailDialog
        department={detail}
        onOpenChange={(open) => !open && setDetail(null)}
        onEdit={(department) => {
          setDetail(null);
          setEditing(department);
          setFormOpen(true);
        }}
      />
      <DepartmentFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        appName={deleting?.name ?? ""}
        description="This removes the department. PICs must be moved to another department first."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
      <PicDrawer />
      <ServerDrawer />
    </div>
  );
}

// Department detail: description, status, the users assigned to it, and its PICs —
// each PIC badge opens the PIC drawer.
function DepartmentDetailDialog({
  department,
  onOpenChange,
  onEdit,
}: {
  department: Department | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (department: Department) => void;
}) {
  const { openPic } = useInfraNav();

  const { data: pics } = useQuery({
    queryKey: ["pics"],
    queryFn: () => apiGet<Pic[]>("/pics"),
    enabled: department !== null,
  });
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<SessionUser[]>("/users"),
    enabled: department !== null,
  });

  const members = (pics ?? []).filter((pic) => pic.department_id === department?.id);
  const portalUsers = (users ?? []).filter((user) => user.department_id === department?.id);

  return (
    <Dialog open={department !== null} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="department-detail-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        {department && (
          <>
            <DialogHeader>
              <DialogTitle data-testid="department-detail-name">{department.name}</DialogTitle>
              <DialogDescription>
                {department.description || "No description."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={department.status === "active" ? "default" : "outline"}>
                  {department.status}
                </Badge>
                <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                  {members.length} PIC(s)
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                  {portalUsers.length} portal user(s)
                </span>
              </div>

              <div className="grid gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  People in charge
                </span>
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="department-detail-no-pics">
                    No PICs in this department yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5" data-testid="department-detail-pics">
                    {members.map((pic) => (
                      <div
                        key={pic.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5"
                      >
                        <PicBadge
                          id={pic.id}
                          name={pic.name}
                          initials={pic.initials}
                          onClick={openPic}
                        />
                        <span className="text-xs text-muted-foreground">
                          {pic.position || "—"}
                        </span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {pic.applications.length} app(s) · {pic.servers.length} server(s) ·{" "}
                          {pic.standby_schedule.length} shift(s)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {portalUsers.length > 0 && (
                <div className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Portal users (can edit this department's notes)
                  </span>
                  <div className="flex flex-wrap gap-1.5" data-testid="department-detail-users">
                    {portalUsers.map((user) => (
                      <span
                        key={user.id}
                        className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground"
                      >
                        {user.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                data-testid="department-detail-edit-btn"
                onClick={() => onEdit(department)}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
              </Button>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="department-detail-close-btn"
              >
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DepartmentFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Department | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setStatus(initial?.status ?? "active");
  }, [open, initial]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      initial
        ? apiPut<Department>(`/departments/${initial.id}`, payload)
        : apiPost<Department>("/departments", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["pics"] });
      toast.success(initial ? "Department updated" : "Department created");
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Department name is required");
      return;
    }
    save.mutate({ name: name.trim(), description: description.trim(), status });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="department-form-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit department" : "Add department"}</DialogTitle>
          <DialogDescription>
            PICs pick a department from this list, and the standby calendar groups shifts by it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="department-form-name">Name</Label>
            <Input
              id="department-form-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="department-form-name-input"
              placeholder="Infrastructure"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="department-form-description">Description</Label>
            <Input
              id="department-form-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              data-testid="department-form-description-input"
              placeholder="Servers, virtualization, storage"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="department-form-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="department-form-status" data-testid="department-form-status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENT_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="department-form-cancel-btn"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="department-form-submit-btn">
              {save.isPending ? "Saving…" : initial ? "Save changes" : "Add department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
