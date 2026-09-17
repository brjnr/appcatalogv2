import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpDown, Eye, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPut } from "@/lib/api";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import { LOCATION_LABELS, SERVER_LOCATIONS, slugify, type Server } from "@/lib/types";
import { InfraStatusBadge } from "@/components/catalog/InfraBits";
import { ServerFormDialog } from "@/components/catalog/ServerFormDialog";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { ConfirmDeleteDialog } from "@/components/catalog/ConfirmDeleteDialog";
import { PicBadge } from "@/components/catalog/PicBadge";
import { SearchSelect } from "@/components/catalog/SearchSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default function AdminServersPage() {
  return (
    <InfraNavProvider>
      <AdminServers />
    </InfraNavProvider>
  );
}

// Servers admin: register, edit, deactivate, delete, view details, assign apps + PICs.
function AdminServers() {
  const queryClient = useQueryClient();
  const { openServer, openPic } = useInfraNav();
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [osFilter, setOsFilter] = useState("");
  const [envFilter, setEnvFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState<Server | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => apiGet<Server[]>("/servers"),
  });

  const toggleStatus = useMutation({
    mutationFn: (server: Server) =>
      apiPut<Server>(`/servers/${server.id}`, {
        status: server.status === "Active" ? "Maintenance" : "Active",
      }),
    onSuccess: (server) => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.success(`${server.name} set to ${server.status}`);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const deleteServer = useMutation({
    mutationFn: (server: Server) => apiDelete<void>(`/servers/${server.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["pics"] });
      toast.success("Server deleted");
      setDeleting(null);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const filtered = (servers ?? [])
    .filter((server) => {
      const q = search.trim().toLowerCase();
      if (location && server.location !== location) return false;
      if (osFilter && server.os !== osFilter) return false;
      if (envFilter && server.environment !== envFilter) return false;
      if (statusFilter && server.status !== statusFilter) return false;
      if (!q) return true;
      return `${server.name} ${server.hostname} ${server.ip_address} ${server.vm_name} ${server.location} ${server.os} ${server.cluster}`
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      const pick = (server: Server): string => {
        switch (sort.key) {
          case "hostname":
            return server.hostname;
          case "ip":
            return server.ip_address;
          case "os":
            return `${server.os} ${server.os_version}`;
          case "type":
            return server.server_type;
          case "environment":
            return server.environment;
          case "location":
            return server.location;
          case "cluster":
            return server.cluster;
          case "apps":
            return String(server.applications.length).padStart(4, "0");
          case "pics":
            return String(server.pics.length).padStart(4, "0");
          case "status":
            return server.status;
          case "tickets":
            return String(server.tickets.length).padStart(4, "0");
          default:
            return server.name;
        }
      };
      return pick(a).localeCompare(pick(b)) * sort.dir || a.name.localeCompare(b.name);
    });

  const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
  const osOptions = uniq((servers ?? []).map((server) => server.os));
  const envOptions = uniq((servers ?? []).map((server) => server.environment));
  const statusOptions = uniq((servers ?? []).map((server) => server.status));

  const toggleSort = (key: string) =>
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 1 ? -1 : 1 }));

  const SortHead = ({ id, label, align }: { id: string; label: string; align?: boolean }) => (
    <TableHead className={align ? "text-right" : undefined}>
      <button
        type="button"
        data-testid={`server-sort-${id}`}
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

  // Site coverage: DC / DRC / Cloud / Co-location counts, doubling as filter chips.
  const locationCounts = SERVER_LOCATIONS.map((site) => ({
    site,
    count: (servers ?? []).filter((server) => server.location === site).length,
  }));

  return (
    <div data-testid="servers-page" className="pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Servers
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {servers?.length ?? 0} registered. A server can serve many applications and vice versa.
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
              data-testid="server-search-input"
              aria-label="Search servers"
              placeholder="Name, host, IP…"
              className="h-9 w-48 pl-8"
            />
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            data-testid="add-server-btn"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Server
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5" data-testid="server-location-filter">
        <span className="mr-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Site
        </span>
        <button
          type="button"
          data-testid="server-location-all"
          onClick={() => setLocation(null)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150",
            location === null
              ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          All ({servers?.length ?? 0})
        </button>
        {locationCounts.map(({ site, count }) => (
          <button
            key={site}
            type="button"
            data-testid={`server-location-filter-${slugify(site)}`}
            title={LOCATION_LABELS[site]}
            onClick={() => setLocation((prev) => (prev === site ? null : site))}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150",
              location === site
                ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {site} ({count})
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="server-column-filters">
        <SearchSelect
          testid="server-os-filter"
          value={osFilter}
          onChange={setOsFilter}
          allLabel="Any OS"
          placeholder="Search OS…"
          options={osOptions.map((value) => ({ id: value, label: value }))}
        />
        <SearchSelect
          testid="server-env-filter"
          value={envFilter}
          onChange={setEnvFilter}
          allLabel="Any environment"
          placeholder="Search environment…"
          options={envOptions.map((value) => ({ id: value, label: value }))}
        />
        <SearchSelect
          testid="server-status-filter"
          value={statusFilter}
          onChange={setStatusFilter}
          allLabel="Any status"
          placeholder="Search status…"
          options={statusOptions.map((value) => ({ id: value, label: value }))}
        />
        <span className="text-xs text-muted-foreground" data-testid="server-result-count">
          {filtered.length} of {servers?.length ?? 0} shown
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card" data-testid="servers-table">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead id="name" label="Server" />
              <SortHead id="os" label="OS" />
              <SortHead id="type" label="Type" />
              <SortHead id="environment" label="Environment" />
              <SortHead id="location" label="Site" />
              <SortHead id="cluster" label="Cluster" />
              <SortHead id="apps" label="Applications" />
              <SortHead id="pics" label="PIC" />
              <SortHead id="tickets" label="Tickets" />
              <SortHead id="status" label="Status" />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  Loading servers…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  No servers match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((server) => {
                const slug = slugify(server.name);
                return (
                  <TableRow key={server.id} data-testid={`server-row-${slug}`}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openServer(server.id)}
                        data-testid={`server-row-name-${slug}`}
                        className="text-left font-mono text-[13px] font-semibold text-sky-700 transition-colors hover:underline dark:text-sky-300"
                      >
                        {server.name}
                      </button>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {server.hostname || "—"} · {server.ip_address || "—"}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`server-os-${slug}`} className="text-sm">
                      {server.os || "—"}
                      {server.os_version && (
                        <span className="block text-[11px] text-muted-foreground">
                          {server.os_version}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{server.server_type || "—"}</TableCell>
                    <TableCell>{server.environment}</TableCell>
                    <TableCell data-testid={`server-location-${slug}`}>
                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300">
                        {server.location}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{server.cluster || "—"}</TableCell>
                    <TableCell>
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {server.applications.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        ) : (
                          server.applications.map((app) => (
                            <Badge key={app.id} variant="outline" className="text-[11px]">
                              {app.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {server.pics.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                          server.pics.map((pic) => (
                            <PicBadge
                              key={pic.id}
                              id={pic.id}
                              name={pic.name}
                              initials={pic.initials}
                              onClick={openPic}
                              showName={false}
                              className="pr-1"
                            />
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`server-tickets-count-${slug}`}>
                      {server.tickets.length}
                    </TableCell>
                    <TableCell>
                      <InfraStatusBadge status={server.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`View ${server.name}`}
                          title="View details"
                          data-testid={`server-view-btn-${slug}`}
                          onClick={() => openServer(server.id)}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${server.name}`}
                          title="Edit server"
                          data-testid={`server-edit-btn-${slug}`}
                          onClick={() => {
                            setEditing(server);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Toggle status of ${server.name}`}
                          title="Activate / set maintenance"
                          data-testid={`server-toggle-btn-${slug}`}
                          onClick={() => toggleStatus.mutate(server)}
                        >
                          <Power className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${server.name}`}
                          title="Delete server"
                          data-testid={`server-delete-btn-${slug}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(server)}
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

      <ServerFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        appName={deleting?.name ?? ""}
        pending={deleteServer.isPending}
        onConfirm={() => deleting && deleteServer.mutate(deleting)}
      />
      <ServerDrawer />
      <PicDrawer />
    </div>
  );
}
