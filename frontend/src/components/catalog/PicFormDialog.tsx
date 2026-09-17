import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import {
  PIC_STATUSES,
  slugify,
  type CatalogApp,
  type Department,
  type Pic,
  type Server,
  type StandbyEntry,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

interface PicFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Pic | null; // null = create mode
}

// Create/edit a PIC: identity, manual initials, assignments, and standby schedule.
export function PicFormDialog({ open, onOpenChange, initial }: PicFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("Active");
  const [appIds, setAppIds] = useState<string[]>([]);
  const [serverIds, setServerIds] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<StandbyEntry[]>([]);

  const { data: apps } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
    enabled: open,
  });
  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet<Department[]>("/departments"),
    enabled: open,
  });
  const { data: servers } = useQuery({
    queryKey: ["servers"],
    queryFn: () => apiGet<Server[]>("/servers"),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setInitials(initial?.initials ?? "");
    setEmployeeId(initial?.employee_id ?? "");
    setEmail(initial?.email ?? "");
    setPhone(initial?.phone ?? "");
    setPosition(initial?.position ?? "");
    setDepartmentId(initial?.department_id ?? "");
    setStatus(initial?.status ?? "Active");
    setAppIds(initial?.application_ids ?? []);
    setServerIds((initial?.servers ?? []).map((s) => s.id));
    setSchedule(initial?.standby_schedule ?? []);
  }, [open, initial]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      initial ? apiPut<Pic>(`/pics/${initial.id}`, payload) : apiPost<Pic>("/pics", payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["pics"] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.success(initial ? "PIC updated" : `PIC ${saved.name} registered`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleanInitials = initials.trim().toUpperCase();
    if (!name.trim()) {
      toast.error("PIC name is required");
      return;
    }
    if (!/^[A-Z0-9]{1,3}$/.test(cleanInitials)) {
      toast.error("Initials must be 1–3 letters or digits (uppercase)");
      return;
    }
    if (schedule.some((entry) => !entry.date || !entry.application_id)) {
      toast.error("Every standby row needs a date and an application");
      return;
    }
    save.mutate({
      name: name.trim(),
      initials: cleanInitials,
      employee_id: employeeId.trim(),
      email: email.trim(),
      phone: phone.trim(),
      position: position.trim(),
      department_id: departmentId,
      status,
      application_ids: appIds,
      server_ids: serverIds,
      standby_schedule: schedule,
    });
  };

  const toggle = (list: string[], setList: (v: string[]) => void, id: string, on: boolean) =>
    setList(on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  const updateRow = (index: number, patch: Partial<StandbyEntry>) =>
    setSchedule((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="pic-form-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit PIC" : "Add PIC"}</DialogTitle>
          <DialogDescription>
            Only name and initials are required — applications, servers, and standby shifts can be
            assigned later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <div className="grid gap-1.5">
              <Label htmlFor="pic-form-name">PIC name</Label>
              <Input
                id="pic-form-name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                data-testid="pic-form-name-input"
                placeholder="Jane Smith"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pic-form-initials">Initials</Label>
              <Input
                id="pic-form-initials"
                required
                maxLength={3}
                value={initials}
                onChange={(event) => setInitials(event.target.value.toUpperCase())}
                data-testid="pic-form-initials-input"
                placeholder="JS"
                className="font-mono uppercase"
              />
              <p className="text-[11px] text-muted-foreground">1–3 chars, uppercase</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pic-form-employee-id">Employee ID</Label>
              <Input
                id="pic-form-employee-id"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                data-testid="pic-form-employee-id-input"
                placeholder="EMP002"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pic-form-email">Email</Label>
              <Input
                id="pic-form-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                data-testid="pic-form-email-input"
                placeholder="jane.smith@company.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pic-form-phone">Phone</Label>
              <Input
                id="pic-form-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                data-testid="pic-form-phone-input"
                placeholder="+62 811-1000-002"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pic-form-department">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="pic-form-department" data-testid="pic-form-department-select">
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {(departments ?? []).map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Managed in Admin → Departments; groups the standby calendar
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pic-form-position">Position</Label>
              <Input
                id="pic-form-position"
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                data-testid="pic-form-position-input"
                placeholder="Infrastructure Engineer"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pic-form-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="pic-form-status" data-testid="pic-form-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIC_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Assigned applications</Label>
            <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
              {(apps ?? []).map((app) => (
                <label key={app.id} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={appIds.includes(app.id)}
                    onCheckedChange={(checked) =>
                      toggle(appIds, setAppIds, app.id, checked === true)
                    }
                    data-testid={`pic-form-app-checkbox-${slugify(app.name)}`}
                  />
                  <span className="truncate">{app.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Assigned servers</Label>
            <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
              {(servers ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No servers registered yet.</p>
              ) : (
                (servers ?? []).map((server) => (
                  <label key={server.id} className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={serverIds.includes(server.id)}
                      onCheckedChange={(checked) =>
                        toggle(serverIds, setServerIds, server.id, checked === true)
                      }
                      data-testid={`pic-form-server-checkbox-${slugify(server.name)}`}
                    />
                    <span className="truncate font-mono text-[13px]">{server.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Standby schedule rows: date → application (+ optional note) */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Standby schedule</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="pic-form-add-standby-btn"
                onClick={() =>
                  setSchedule((prev) => [
                    ...prev,
                    { date: "", application_id: appIds[0] ?? "", notes: "" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add shift
              </Button>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              {schedule.length === 0 ? (
                <p className="text-xs text-muted-foreground">No standby shifts yet.</p>
              ) : (
                schedule.map((row, index) => (
                  <div
                    key={index}
                    data-testid={`pic-form-standby-row-${index}`}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_1fr_auto]"
                  >
                    <Input
                      type="date"
                      value={row.date}
                      onChange={(event) => updateRow(index, { date: event.target.value })}
                      data-testid={`pic-form-standby-date-${index}`}
                      aria-label="Standby date"
                    />
                    <Select
                      value={row.application_id}
                      onValueChange={(value) => updateRow(index, { application_id: value })}
                    >
                      <SelectTrigger
                        data-testid={`pic-form-standby-app-${index}`}
                        aria-label="Standby application"
                      >
                        <SelectValue placeholder="Application" />
                      </SelectTrigger>
                      <SelectContent>
                        {(apps ?? []).map((app) => (
                          <SelectItem key={app.id} value={app.id}>
                            {app.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={row.notes}
                      onChange={(event) => updateRow(index, { notes: event.target.value })}
                      data-testid={`pic-form-standby-notes-${index}`}
                      aria-label="Standby notes"
                      placeholder="Notes (optional)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove shift"
                      data-testid={`pic-form-standby-remove-${index}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => setSchedule((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="pic-form-cancel-btn"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="pic-form-submit-btn">
              {save.isPending ? "Saving…" : initial ? "Save changes" : "Add PIC"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
