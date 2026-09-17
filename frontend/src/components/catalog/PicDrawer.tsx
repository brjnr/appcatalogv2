import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarDays, Mail, Phone, ServerIcon, ShieldBan } from "lucide-react";
import { ApiError, apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useInfraNav } from "@/lib/infraNav";
import { slugify, type Pic } from "@/lib/types";
import { DetailRow, InfraStatusBadge } from "./InfraBits";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * PIC detail drawer. Opened from an application or a server; its assigned servers
 * open the server drawer, completing the two-way navigation chain.
 */
export function PicDrawer() {
  const { picId, closePic, openServer } = useInfraNav();

  const { data: pic, isLoading, isError, error } = useQuery({
    queryKey: ["pics", picId],
    queryFn: () => apiGet<Pic>(`/pics/${picId}`),
    enabled: Boolean(picId),
    retry: false,
  });

  const denied = isError && error instanceof ApiError && error.status === 403;

  return (
    <Sheet open={Boolean(picId)} onOpenChange={(open) => !open && closePic()}>
      <SheetContent
        side="right"
        data-testid="pic-drawer"
        className="w-full overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <div className="flex items-start gap-3">
            <span
              data-testid="pic-drawer-initials"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white dark:bg-sky-600"
            >
              {pic?.initials ?? "··"}
            </span>
            <div className="min-w-0">
              <SheetTitle data-testid="pic-drawer-name" className="font-heading">
                {pic?.name ?? (isLoading ? "Loading…" : "PIC")}
              </SheetTitle>
              <SheetDescription>{pic?.position || "—"}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="grid gap-3 px-4 pb-6" data-testid="pic-drawer-loading">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : denied ? (
          <div
            data-testid="pic-drawer-denied"
            className="flex flex-col items-center gap-2 px-6 py-12 text-center"
          >
            <ShieldBan className="h-9 w-9 text-red-500" aria-hidden="true" />
            <p className="font-medium text-foreground">Access denied</p>
            <p className="text-sm text-muted-foreground">
              This PIC is not linked to any application assigned to you.
            </p>
          </div>
        ) : !pic ? (
          <div data-testid="pic-drawer-missing" className="px-6 py-12 text-center">
            <p className="font-medium text-foreground">PIC not found</p>
            <p className="mt-1 text-sm text-muted-foreground">They may have been removed.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 px-4 pb-8">
            <div className="flex flex-wrap items-center gap-2">
              <InfraStatusBadge status={pic.status} />
              {pic.department && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {pic.department}
                </span>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <DetailRow label="PIC name" value={pic.name} testid="pic-detail-name" />
              <DetailRow label="PIC initials" value={pic.initials} testid="pic-detail-initials" />
              <DetailRow label="Employee ID" value={pic.employee_id} testid="pic-detail-employee-id" mono />
              <DetailRow label="Department" value={pic.department} />
              <DetailRow label="Position" value={pic.position} />
              <DetailRow label="Status" value={pic.status} />
            </dl>

            <div className="flex flex-col gap-2">
              {pic.email && (
                <a
                  href={`mailto:${pic.email}`}
                  data-testid="pic-detail-email"
                  className="inline-flex items-center gap-2 text-sm text-sky-700 transition-colors hover:underline dark:text-sky-300"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {pic.email}
                </a>
              )}
              {pic.phone && (
                <span
                  data-testid="pic-detail-phone"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {pic.phone}
                </span>
              )}
            </div>

            {/* Assigned applications */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Assigned applications
              </h3>
              <div className="mt-2 flex flex-wrap gap-2" data-testid="pic-applications">
                {pic.applications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No applications assigned yet.</p>
                ) : (
                  pic.applications.map((app) => (
                    <Link
                      key={app.id}
                      to={`/app/${app.id}`}
                      onClick={closePic}
                      data-testid={`pic-app-link-${slugify(app.name)}`}
                      className="inline-flex items-center rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-[border-color,background-color] duration-150 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40"
                    >
                      {app.name}
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Assigned servers — clicking swaps to the server drawer */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Assigned servers
              </h3>
              <div className="mt-2 flex flex-wrap gap-2" data-testid="pic-servers">
                {pic.servers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No servers assigned yet.</p>
                ) : (
                  pic.servers.map((server) => (
                    <button
                      key={server.id}
                      type="button"
                      onClick={() => openServer(server.id)}
                      data-testid={`pic-server-link-${slugify(server.name)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 font-mono text-[13px] font-medium text-foreground transition-[border-color,background-color] duration-150 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40"
                    >
                      <ServerIcon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
                      {server.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Standby schedule */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Standby schedule
              </h3>
              <div className="mt-2 flex flex-col gap-1.5" data-testid="pic-standby-schedule">
                {pic.standby_schedule_out.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No standby shifts scheduled.</p>
                ) : (
                  pic.standby_schedule_out.map((entry, index) => (
                    <div
                      key={`${entry.date}-${entry.application_id}-${index}`}
                      data-testid={`standby-row-${entry.date}`}
                      className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2"
                    >
                      <CalendarDays
                        className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300"
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium text-foreground">
                        {formatDate(entry.date)}
                      </span>
                      <span className="text-muted-foreground" aria-hidden="true">
                        →
                      </span>
                      <span className="text-sm text-foreground">{entry.application_name}</span>
                      {entry.notes && (
                        <span className="w-full text-xs text-muted-foreground">{entry.notes}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
