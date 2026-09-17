import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import {
  LOCATION_LABELS,
  SERVER_ENVIRONMENTS,
  SERVER_LOCATIONS,
  SERVER_STATUSES,
  slugify,
  type CatalogApp,
  type Pic,
  type Server,
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
import { Textarea } from "@/components/ui/textarea";

interface ServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Server | null; // null = create mode
}

const FIELDS = [
  { key: "hostname", label: "Hostname", placeholder: "security-prod-01" },
  { key: "ip_address", label: "IP address", placeholder: "10.10.10.101" },
  { key: "vm_name", label: "VM name", placeholder: "SEC-PROD01" },
  { key: "os", label: "Operating system", placeholder: "Ubuntu Server" },
  { key: "os_version", label: "OS version", placeholder: "22.04 LTS" },
  { key: "server_type", label: "Server type", placeholder: "Virtual Machine" },
  { key: "cpu", label: "CPU", placeholder: "8 Core" },
  { key: "ram", label: "RAM", placeholder: "32 GB" },
  { key: "storage", label: "Storage", placeholder: "500 GB SSD" },
  { key: "datacenter", label: "Data center / location", placeholder: "Jakarta DC1" },
  { key: "cluster", label: "Cluster", placeholder: "PROD-CLUSTER-A" },
  { key: "virtualization", label: "Virtualization platform", placeholder: "VMware vSphere 8" },
] as const;

type TextKey = (typeof FIELDS)[number]["key"];

// Create/edit a server. Only the name is required — applications and PICs can be linked later.
export function ServerFormDialog({ open, onOpenChange, initial }: ServerFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [text, setText] = useState<Record<TextKey, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Record<TextKey, string>,
  );
  const [environment, setEnvironment] = useState("Production");
  const [location, setLocation] = useState("DC");
  const [status, setStatus] = useState("Active");
  const [description, setDescription] = useState("");
  const [dateCreated, setDateCreated] = useState("");
  const [dateDecommissioned, setDateDecommissioned] = useState("");
  const [decommissionNotes, setDecommissionNotes] = useState("");
  const [appIds, setAppIds] = useState<string[]>([]);
  const [picIds, setPicIds] = useState<string[]>([]);
  const [appQuery, setAppQuery] = useState("");
  const [picQuery, setPicQuery] = useState("");

  const { data: apps } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
    enabled: open,
  });
  const { data: pics } = useQuery({
    queryKey: ["pics"],
    queryFn: () => apiGet<Pic[]>("/pics"),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setText(
      Object.fromEntries(
        FIELDS.map((f) => [f.key, (initial?.[f.key] as string | undefined) ?? ""]),
      ) as Record<TextKey, string>,
    );
    setEnvironment(initial?.environment ?? "Production");
    setLocation(initial?.location ?? "DC");
    setStatus(initial?.status ?? "Active");
    setDescription(initial?.description ?? "");
    setDateCreated(initial?.date_created ?? "");
    setDateDecommissioned(initial?.date_decommissioned ?? "");
    setDecommissionNotes(initial?.decommission_notes ?? "");
    setAppIds(initial?.application_ids ?? []);
    setPicIds(initial?.pic_ids ?? []);
    setAppQuery("");
    setPicQuery("");
  }, [open, initial]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      initial
        ? apiPut<Server>(`/servers/${initial.id}`, payload)
        : apiPost<Server>("/servers", payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["pics"] });
      toast.success(initial ? "Server updated" : `Server ${saved.name} registered`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Server name is required");
      return;
    }
    save.mutate({
      name: name.trim(),
      ...text,
      environment,
      location,
      status,
      description: description.trim(),
      date_created: dateCreated || "",
      date_decommissioned: status === "Decommissioned" ? dateDecommissioned || "" : "",
      decommission_notes: status === "Decommissioned" ? decommissionNotes.trim() : "",
      application_ids: appIds,
      pic_ids: picIds,
    });
  };

  const toggle = (list: string[], setList: (v: string[]) => void, id: string, on: boolean) =>
    setList(on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  // Both assignment lists get their own search box — there are 36 apps and a growing PIC roster.
  const aq = appQuery.trim().toLowerCase();
  const filteredApps = (apps ?? []).filter((app) =>
    aq ? `${app.name} ${app.category_name}`.toLowerCase().includes(aq) : true,
  );
  const pq = picQuery.trim().toLowerCase();
  const filteredPics = (pics ?? []).filter((pic) =>
    pq ? `${pic.name} ${pic.initials} ${pic.department} ${pic.position}`.toLowerCase().includes(pq) : true,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="server-form-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit server" : "Add server"}</DialogTitle>
          <DialogDescription>
            Only the server name is required — you can assign applications and PICs now or later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="server-form-name">Server name</Label>
            <Input
              id="server-form-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="server-form-name-input"
              placeholder="SEC-PROD-01"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.key} className="grid gap-1.5">
                <Label htmlFor={`server-form-${field.key}`}>{field.label}</Label>
                <Input
                  id={`server-form-${field.key}`}
                  value={text[field.key]}
                  onChange={(event) =>
                    setText((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  data-testid={`server-form-${field.key.replace(/_/g, "-")}-input`}
                  placeholder={field.placeholder}
                />
              </div>
            ))}

            <div className="grid gap-1.5">
              <Label htmlFor="server-form-environment">Environment</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger id="server-form-environment" data-testid="server-form-environment-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVER_ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="server-form-location">Site role / location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger id="server-form-location" data-testid="server-form-location-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVER_LOCATIONS.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {LOCATION_LABELS[loc] ?? loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="server-form-status">Server status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="server-form-status" data-testid="server-form-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="server-form-description">Description</Label>
            <Textarea
              id="server-form-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              data-testid="server-form-description-input"
              placeholder="What runs on this server?"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="server-form-date-created">Date created</Label>
              <Input
                id="server-form-date-created"
                type="date"
                value={dateCreated}
                onChange={(event) => setDateCreated(event.target.value)}
                data-testid="server-form-date-created-input"
              />
              <p className="text-xs text-muted-foreground">
                When was this server provisioned? Enter manually.
              </p>
            </div>
            {status === "Decommissioned" && (
              <div className="grid gap-1.5">
                <Label htmlFor="server-form-date-decommissioned">Date decommissioned</Label>
                <Input
                  id="server-form-date-decommissioned"
                  type="date"
                  value={dateDecommissioned}
                  onChange={(event) => setDateDecommissioned(event.target.value)}
                  data-testid="server-form-date-decommissioned-input"
                />
              </div>
            )}
          </div>

          {status === "Decommissioned" && (
            <div className="grid gap-1.5">
              <Label htmlFor="server-form-decommission-notes">Decommission notes</Label>
              <Textarea
                id="server-form-decommission-notes"
                rows={3}
                value={decommissionNotes}
                onChange={(event) => setDecommissionNotes(event.target.value)}
                data-testid="server-form-decommission-notes-input"
                placeholder="Why was this server decommissioned? Migration target? Ticket reference?"
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Assigned applications (many-to-many)</Label>
              <span className="text-[11px] text-muted-foreground" data-testid="server-form-app-selected-count">
                {appIds.length} selected
              </span>
            </div>
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={appQuery}
                onChange={(event) => setAppQuery(event.target.value)}
                data-testid="server-form-app-search"
                aria-label="Search applications"
                placeholder="Search applications…"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
              {filteredApps.length === 0 && (
                <p className="text-xs text-muted-foreground" data-testid="server-form-app-no-match">
                  No application matches “{appQuery}”.
                </p>
              )}
              {filteredApps.map((app) => (
                <label key={app.id} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={appIds.includes(app.id)}
                    onCheckedChange={(checked) =>
                      toggle(appIds, setAppIds, app.id, checked === true)
                    }
                    data-testid={`server-form-app-checkbox-${slugify(app.name)}`}
                  />
                  <span className="truncate">{app.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Assigned PICs</Label>
              <span className="text-[11px] text-muted-foreground" data-testid="server-form-pic-selected-count">
                {picIds.length} selected
              </span>
            </div>
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={picQuery}
                onChange={(event) => setPicQuery(event.target.value)}
                data-testid="server-form-pic-search"
                aria-label="Search PICs"
                placeholder="Search name, initials, department…"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
              {(pics ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No PICs registered yet.</p>
              ) : filteredPics.length === 0 ? (
                <p className="text-xs text-muted-foreground" data-testid="server-form-pic-no-match">
                  No PIC matches “{picQuery}”.
                </p>
              ) : (
                filteredPics.map((pic) => (
                  <label key={pic.id} className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={picIds.includes(pic.id)}
                      onCheckedChange={(checked) =>
                        toggle(picIds, setPicIds, pic.id, checked === true)
                      }
                      data-testid={`server-form-pic-checkbox-${slugify(pic.name)}`}
                    />
                    <span className="truncate">
                      [{pic.initials}] {pic.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="server-form-cancel-btn"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="server-form-submit-btn">
              {save.isPending ? "Saving…" : initial ? "Save changes" : "Add server"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
