import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Cpu,
  ExternalLink,
  HardDrive,
  MemoryStick,
  Pencil,
  Plus,
  ServerIcon,
  ShieldBan,
  Trash2,
} from "lucide-react";
import { ApiError, apiDelete, apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import { useInfraNav } from "@/lib/infraNav";
import {
  LOCATION_LABELS,
  TICKET_STATUSES,
  slugify,
  type Server,
  type ServerTicket,
  type SessionUser,
} from "@/lib/types";
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
import { DetailRow, InfraStatusBadge } from "./InfraBits";
import { PicBadge } from "./PicBadge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Server detail drawer. Opened from an application's Servers section or from a PIC's
 * assigned servers; its PIC badges open the PIC drawer, so navigation chains both ways.
 */
export function ServerDrawer() {
  const { serverId, closeServer, openPic } = useInfraNav();
  const queryClient = useQueryClient();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<ServerTicket | null>(null);

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SessionUser | null>("/auth/me"),
    retry: false,
  });
  const isAdmin = user?.role === "administrator";

  const { data: server, isLoading, isError, error } = useQuery({
    queryKey: ["servers", serverId],
    queryFn: () => apiGet<Server>(`/servers/${serverId}`),
    enabled: Boolean(serverId),
    retry: false,
  });

  const invalidateServer = () => {
    queryClient.invalidateQueries({ queryKey: ["servers"] });
  };

  const deleteTicket = useMutation({
    mutationFn: (ticket: ServerTicket) =>
      apiDelete<Server>(`/servers/${serverId}/tickets/${ticket.id}`),
    onSuccess: () => {
      invalidateServer();
      toast.success("Ticket removed");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const denied = isError && error instanceof ApiError && error.status === 403;

  return (
    <Sheet open={Boolean(serverId)} onOpenChange={(open) => !open && closeServer()}>
      <SheetContent
        side="right"
        data-testid="server-drawer"
        className="w-full overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
              <ServerIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <SheetTitle data-testid="server-drawer-name" className="font-heading">
                {server?.name ?? (isLoading ? "Loading…" : "Server")}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {server?.hostname || "—"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="grid gap-3 px-4 pb-6" data-testid="server-drawer-loading">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : denied ? (
          <div
            data-testid="server-drawer-denied"
            className="flex flex-col items-center gap-2 px-6 py-12 text-center"
          >
            <ShieldBan className="h-9 w-9 text-red-500" aria-hidden="true" />
            <p className="font-medium text-foreground">Access denied</p>
            <p className="text-sm text-muted-foreground">
              This server belongs to applications that are not assigned to you.
            </p>
          </div>
        ) : !server ? (
          <div data-testid="server-drawer-missing" className="px-6 py-12 text-center">
            <p className="font-medium text-foreground">Server not found</p>
            <p className="mt-1 text-sm text-muted-foreground">It may have been removed.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 px-4 pb-8">
            <div className="flex flex-wrap items-center gap-2">
              <InfraStatusBadge status={server.status} />
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {server.environment}
              </span>
              <span
                data-testid="server-location-chip"
                className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300"
              >
                {server.location}
              </span>
              {server.server_type && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {server.server_type}
                </span>
              )}
            </div>

            {/* Resource strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-card p-3">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <Cpu className="h-3 w-3" aria-hidden="true" /> CPU
                </span>
                <p data-testid="server-cpu" className="mt-1 text-sm font-semibold text-foreground">
                  {server.cpu || "—"}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <MemoryStick className="h-3 w-3" aria-hidden="true" /> RAM
                </span>
                <p data-testid="server-ram" className="mt-1 text-sm font-semibold text-foreground">
                  {server.ram || "—"}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <HardDrive className="h-3 w-3" aria-hidden="true" /> Storage
                </span>
                <p data-testid="server-storage" className="mt-1 text-sm font-semibold text-foreground">
                  {server.storage || "—"}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <DetailRow label="Server name" value={server.name} testid="server-detail-name" />
              <DetailRow label="Hostname" value={server.hostname} mono />
              <DetailRow label="IP address" value={server.ip_address} testid="server-detail-ip" mono />
              <DetailRow label="VM name" value={server.vm_name} mono />
              <DetailRow label="Operating system" value={server.os} />
              <DetailRow label="OS version" value={server.os_version} />
              <DetailRow label="Data center / location" value={server.datacenter} testid="server-detail-datacenter" />
              <DetailRow label="Site role" value={LOCATION_LABELS[server.location] ?? server.location} testid="server-detail-location" />
              <DetailRow label="Cluster" value={server.cluster} />
              <DetailRow label="Virtualization platform" value={server.virtualization} />
              <DetailRow label="Server type" value={server.server_type} />
              <DetailRow label="Date created" value={server.date_created} testid="server-detail-date-created" />
              {server.status === "Decommissioned" && (
                <DetailRow
                  label="Date decommissioned"
                  value={server.date_decommissioned}
                  testid="server-detail-date-decommissioned"
                />
              )}
            </dl>

            {server.status === "Decommissioned" && server.decommission_notes && (
              <div data-testid="server-detail-decom-notes">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Decommission notes
                </h3>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-foreground/90">
                  {server.decommission_notes}
                </p>
              </div>
            )}

            {server.description && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Description
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-foreground/90">{server.description}</p>
              </div>
            )}

            {/* Applications using this server — clickable through to app detail */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Applications using this server
              </h3>
              <div className="mt-2 flex flex-wrap gap-2" data-testid="server-applications">
                {server.applications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not assigned to any application yet.
                  </p>
                ) : (
                  server.applications.map((app) => (
                    <Link
                      key={app.id}
                      to={`/app/${app.id}`}
                      onClick={closeServer}
                      data-testid={`server-app-link-${slugify(app.name)}`}
                      className="inline-flex items-center rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-[border-color,background-color] duration-150 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40"
                    >
                      {app.name}
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Jira tickets ever raised against this server */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Jira tickets
                </h3>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="server-ticket-add-btn"
                    onClick={() => {
                      setEditingTicket(null);
                      setTicketOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add ticket
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-2" data-testid="server-tickets">
                {server.tickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="server-tickets-empty">
                    No tickets recorded for this server yet.
                  </p>
                ) : (
                  server.tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      data-testid={`server-ticket-${slugify(ticket.jira_id)}`}
                      className="rounded-lg border bg-card p-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {ticket.url ? (
                          <a
                            href={ticket.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`server-ticket-link-${slugify(ticket.jira_id)}`}
                            className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300"
                          >
                            {ticket.jira_id}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {ticket.jira_id}
                          </span>
                        )}
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {ticket.status}
                        </span>
                        {ticket.requested_on && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {ticket.requested_on}
                          </span>
                        )}
                        {isAdmin && (
                          <span className="ml-auto flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Edit ${ticket.jira_id}`}
                              data-testid={`server-ticket-edit-${slugify(ticket.jira_id)}`}
                              onClick={() => {
                                setEditingTicket(ticket);
                                setTicketOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Delete ${ticket.jira_id}`}
                              data-testid={`server-ticket-delete-${slugify(ticket.jira_id)}`}
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteTicket.mutate(ticket)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </span>
                        )}
                      </div>
                      {ticket.summary && (
                        <p className="mt-1 text-sm text-foreground/90">{ticket.summary}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        executed by{" "}
                        <span className="font-medium text-foreground">
                          {ticket.executed_by || "—"}
                        </span>
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Server PIC — clicking swaps to the PIC drawer */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Server PIC
              </h3>
              <div className="mt-2 flex flex-wrap gap-2" data-testid="server-pics">
                {server.pics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No PIC assigned yet.</p>
                ) : (
                  server.pics.map((pic) => (
                    <PicBadge
                      key={pic.id}
                      id={pic.id}
                      name={pic.name}
                      initials={pic.initials}
                      onClick={openPic}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>

      {isAdmin && serverId && (
        <TicketFormDialog
          open={ticketOpen}
          onOpenChange={setTicketOpen}
          serverId={serverId}
          initial={editingTicket}
          onSaved={invalidateServer}
        />
      )}
    </Sheet>
  );
}

// Add / edit one Jira ticket on a server (admin only).
function TicketFormDialog({
  open,
  onOpenChange,
  serverId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  initial: ServerTicket | null;
  onSaved: () => void;
}) {
  const [jiraId, setJiraId] = useState("");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [executedBy, setExecutedBy] = useState("");
  const [status, setStatus] = useState("Open");
  const [requestedOn, setRequestedOn] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Re-seed the fields whenever the dialog opens for a different ticket.
  const key = `${open}-${initial?.id ?? "new"}`;
  if (loadedFor !== key) {
    setLoadedFor(key);
    setJiraId(initial?.jira_id ?? "");
    setUrl(initial?.url ?? "");
    setSummary(initial?.summary ?? "");
    setExecutedBy(initial?.executed_by ?? "");
    setStatus(initial?.status ?? "Open");
    setRequestedOn(initial?.requested_on ?? "");
  }

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      initial
        ? apiPut<Server>(`/servers/${serverId}/tickets/${initial.id}`, payload)
        : apiPost<Server>(`/servers/${serverId}/tickets`, payload),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
      toast.success(initial ? "Ticket updated" : "Ticket recorded");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="server-ticket-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Jira ticket" : "Add Jira ticket"}</DialogTitle>
          <DialogDescription>
            Track the ticket ever requested for this server and who executed it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ticket-jira-id">Jira ticket ID</Label>
            <Input
              id="ticket-jira-id"
              value={jiraId}
              onChange={(event) => setJiraId(event.target.value)}
              data-testid="ticket-jira-id-input"
              placeholder="INFRA-1042"
              className="font-mono"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ticket-url">Jira link</Label>
            <Input
              id="ticket-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              data-testid="ticket-url-input"
              placeholder="https://jira.company.com/browse/INFRA-1042"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ticket-summary">Summary</Label>
            <Input
              id="ticket-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              data-testid="ticket-summary-input"
              placeholder="What was requested"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ticket-executed-by">Executed by</Label>
              <Input
                id="ticket-executed-by"
                value={executedBy}
                onChange={(event) => setExecutedBy(event.target.value)}
                data-testid="ticket-executed-by-input"
                placeholder="Budi Santoso"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ticket-requested-on">Requested on</Label>
              <Input
                id="ticket-requested-on"
                type="date"
                value={requestedOn}
                onChange={(event) => setRequestedOn(event.target.value)}
                data-testid="ticket-requested-on-input"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ticket-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="ticket-status" data-testid="ticket-status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="ticket-cancel-btn">
            Cancel
          </Button>
          <Button
            disabled={save.isPending}
            data-testid="ticket-submit-btn"
            onClick={() => {
              if (!jiraId.trim()) {
                toast.error("A Jira ticket ID is required");
                return;
              }
              save.mutate({
                jira_id: jiraId.trim(),
                url: url.trim(),
                summary: summary.trim(),
                executed_by: executedBy.trim(),
                status,
                requested_on: requestedOn,
              });
            }}
          >
            {save.isPending ? "Saving…" : initial ? "Save changes" : "Add ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
