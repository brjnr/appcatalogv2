import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Repeat, Users, X } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPatch, apiPost } from "@/lib/api";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import type {
  CatalogApp,
  Department,
  Pic,
  SessionUser,
  StandbyCalendar as StandbyCalendarData,
  StandbyCalendarEntry,
  StandbyRotateResult,
  StandbyUpcoming,
} from "@/lib/types";
import { slugify } from "@/lib/types";
import { AppNavbar } from "@/components/catalog/AppNavbar";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { SearchSelect } from "@/components/catalog/SearchSelect";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function StandbyCalendarPage() {
  return (
    <InfraNavProvider>
      <StandbyCalendar />
    </InfraNavProvider>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NO_TEAM = "No department";

// The shift currently being dragged (module-level: HTML5 DnD payloads are strings only).
let dragging: { pic_id: string; application_id: string; date: string } | null = null;

function monthShift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function teamOf(entry: StandbyCalendarEntry): string {
  return entry.pic_department || NO_TEAM;
}

function dayLabel(date: string, today: string): string {
  const diff = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// On-call roster across every PIC. Reads are scoped by the backend; administrators can
// drag shifts to reschedule, add a shift to any day, and remove one.
function StandbyCalendar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openPic } = useInfraNav();
  const [month, setMonth] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState(""); // "" = all departments
  const [rotateOpen, setRotateOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SessionUser | null>("/auth/me"),
    retry: false,
  });
  const isAdmin = user?.role === "administrator";

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet<Department[]>("/departments"),
    enabled: Boolean(user),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["standby", month],
    queryFn: () => apiGet<StandbyCalendarData>(month ? `/standby?month=${month}` : "/standby"),
    enabled: Boolean(user),
  });

  const { data: upcoming } = useQuery({
    queryKey: ["standby-upcoming"],
    queryFn: () => apiGet<StandbyUpcoming>("/standby/upcoming?days=7"),
    enabled: Boolean(user),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["standby"] });
    queryClient.invalidateQueries({ queryKey: ["standby-upcoming"] });
    queryClient.invalidateQueries({ queryKey: ["pics"] });
  };

  const moveShift = useMutation({
    mutationFn: (payload: {
      pic_id: string;
      application_id: string;
      from_date: string;
      to_date: string;
    }) => apiPatch<StandbyCalendarEntry>("/standby/move", payload),
    onSuccess: (entry) => {
      refresh();
      toast.success(`${entry.pic_name} moved to ${entry.date}`);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const addShift = useMutation({
    mutationFn: (payload: {
      pic_id: string;
      date: string;
      application_id: string;
      notes: string;
    }) => apiPost<StandbyCalendarEntry>("/standby", payload),
    onSuccess: (entry) => {
      refresh();
      setAddDate(null);
      toast.success(`${entry.pic_name} is on standby ${entry.date}`);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const removeShift = useMutation({
    mutationFn: (entry: StandbyCalendarEntry) =>
      apiDelete<void>(
        `/standby?pic_id=${entry.pic_id}&date=${entry.date}&application_id=${entry.application_id}`,
      ),
    onSuccess: () => {
      refresh();
      toast.success("Shift removed");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  // The server decides the current month; we only shift relative to what it returned.
  const activeMonth = data?.month ?? month;

  const grid = useMemo(() => {
    if (!activeMonth) return null;
    const [y, m] = activeMonth.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const leading = (first.getUTCDay() + 6) % 7; // Monday-first
    const cells: (string | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(`${activeMonth}-${String(day).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [activeMonth]);

  const allEntries = data?.entries ?? [];
  const countsByDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of allEntries) {
      counts.set(entry.pic_department_id, (counts.get(entry.pic_department_id) ?? 0) + 1);
    }
    return counts;
  }, [allEntries]);

  const entries = departmentId
    ? allEntries.filter((entry) => entry.pic_department_id === departmentId)
    : allEntries;
  const selectedDepartment = (departments ?? []).find((d) => d.id === departmentId) ?? null;

  const byDate = useMemo(() => {
    const map = new Map<string, StandbyCalendarEntry[]>();
    for (const entry of entries) {
      if (!map.has(entry.date)) map.set(entry.date, []);
      map.get(entry.date)!.push(entry);
    }
    return map;
  }, [entries]);

  const monthLabel = activeMonth
    ? new Date(`${activeMonth}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "…";

  const handleDrop = (date: string) => {
    setDragOver(null);
    const raw = dragging;
    if (!raw || !isAdmin || raw.date === date) return;
    moveShift.mutate({
      pic_id: raw.pic_id,
      application_id: raw.application_id,
      from_date: raw.date,
      to_date: date,
    });
  };

  return (
    <div className="min-h-svh">
      <AppNavbar user={user ?? null} />
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8" data-testid="standby-page">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight text-foreground">
              <CalendarDays className="h-5 w-5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
              Standby Calendar
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              On-call roster across all people in charge, grouped by department.{" "}
              {isAdmin
                ? "Drag a shift to another day to reschedule it."
                : "Click a PIC to open their full details."}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              data-testid="standby-prev-month"
              onClick={() => activeMonth && setMonth(monthShift(activeMonth, -1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <span
              data-testid="standby-month-label"
              className="min-w-40 text-center font-heading text-sm font-semibold text-foreground"
            >
              {monthLabel}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              data-testid="standby-next-month"
              onClick={() => activeMonth && setMonth(monthShift(activeMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="standby-this-month"
              onClick={() => setMonth(null)}
            >
              This month
            </Button>
          </div>
        </div>

        {/* Today / next days, grouped by department */}
        <UpcomingPanel
          upcoming={upcoming ?? null}
          onOpenPic={openPic}
          activeDepartmentId={departmentId}
          onPickDepartment={(picked) => setDepartmentId((prev) => (prev === picked ? "" : picked))}
        />

        {/* Department picker (searchable) + rotation */}
        <div className="mt-6 flex flex-wrap items-center gap-2" data-testid="standby-department-filter">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" /> Department
          </span>
          <SearchSelect
            testid="standby-department-select"
            value={departmentId}
            onChange={setDepartmentId}
            allLabel={`All departments (${allEntries.length})`}
            placeholder="Search departments…"
            options={(departments ?? []).map((department) => ({
              id: department.id,
              label: department.name,
              hint: String(countsByDepartment.get(department.id) ?? 0),
            }))}
          />
          {isAdmin && (
            <Button
              variant="outline"
              className="h-9"
              data-testid="standby-rotate-btn"
              onClick={() => setRotateOpen(true)}
            >
              <Repeat className="h-4 w-4" aria-hidden="true" /> Auto-fill month
            </Button>
          )}
        </div>

        <p className="mt-3 text-sm text-muted-foreground" data-testid="standby-shift-count">
          {isLoading ? "Loading roster…" : `${entries.length} shift(s) this month`}
          {selectedDepartment
            ? ` · ${selectedDepartment.name} — cells show the PIC on standby`
            : ""}
        </p>

        {/* Month grid */}
        <Card className="mt-3 overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" data-testid="standby-grid">
            {(grid ?? Array.from({ length: 35 }, () => null)).map((date, index) => {
              const cellEntries = date ? (byDate.get(date) ?? []) : [];
              return (
                <div
                  key={date ?? `blank-${index}`}
                  data-testid={date ? `standby-cell-${date}` : undefined}
                  onDragOver={(event) => {
                    if (!isAdmin || !date) return;
                    event.preventDefault();
                    setDragOver(date);
                  }}
                  onDragLeave={() => date && setDragOver((prev) => (prev === date ? null : prev))}
                  onDrop={(event) => {
                    if (!isAdmin || !date) return;
                    event.preventDefault();
                    handleDrop(date);
                  }}
                  className={cn(
                    "group/cell relative min-h-24 border-b border-r p-1.5 last:border-r-0",
                    !date && "bg-muted/20",
                    cellEntries.length > 0 && "bg-sky-50/40 dark:bg-sky-950/20",
                    dragOver === date && "ring-2 ring-inset ring-sky-400",
                  )}
                >
                  {date && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {Number(date.slice(-2))}
                      </span>
                      {isAdmin && (
                        <button
                          type="button"
                          aria-label={`Add standby shift on ${date}`}
                          data-testid={`standby-add-${date}`}
                          onClick={() => setAddDate(date)}
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/cell:opacity-100"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="mt-1 flex flex-col gap-1">
                    {cellEntries.map((entry) => (
                      <div
                        key={`${entry.pic_id}-${entry.application_id}`}
                        draggable={isAdmin}
                        onDragStart={() => {
                          dragging = {
                            pic_id: entry.pic_id,
                            application_id: entry.application_id,
                            date: entry.date,
                          };
                        }}
                        onDragEnd={() => {
                          dragging = null;
                        }}
                        data-testid={`standby-entry-${entry.date}-${slugify(entry.pic_name)}`}
                        title={`${entry.pic_name} (${teamOf(entry)}) → ${entry.application_name}${entry.notes ? ` — ${entry.notes}` : ""}`}
                        className={cn(
                          "group/entry flex items-center gap-1 rounded-md border border-sky-200 bg-card px-1.5 py-1 transition-[border-color,background-color] duration-150 hover:border-sky-400 hover:bg-sky-50 dark:border-sky-900 dark:hover:bg-sky-950/50",
                          isAdmin && "cursor-grab active:cursor-grabbing",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openPic(entry.pic_id)}
                          aria-label={`Open ${entry.pic_name}`}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] font-semibold text-white dark:bg-sky-600">
                            {entry.pic_initials}
                          </span>
                          <span className="min-w-0 truncate text-[11px] font-medium text-foreground">
                            {departmentId ? entry.pic_name : entry.application_name}
                          </span>
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            aria-label={`Remove ${entry.pic_name} on ${entry.date}`}
                            data-testid={`standby-remove-${entry.date}-${slugify(entry.pic_name)}`}
                            onClick={() => removeShift.mutate(entry)}
                            className="shrink-0 rounded text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-destructive focus-visible:opacity-100 group-hover/entry:opacity-100"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Agenda list — the same data, easier to scan */}
        <h2 className="mt-8 font-heading text-sm font-semibold text-foreground">Agenda</h2>
        <div className="mt-2 flex flex-col gap-1.5" data-testid="standby-agenda">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="standby-empty">
              {isLoading ? "Loading…" : "No standby shifts scheduled this month."}
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={`${entry.date}-${entry.pic_id}-${entry.application_id}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2"
              >
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                  {entry.date}
                </span>
                <button
                  type="button"
                  onClick={() => openPic(entry.pic_id)}
                  data-testid={`agenda-pic-${slugify(entry.pic_name)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-0.5 pl-0.5 pr-2.5 transition-colors hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white dark:bg-sky-600">
                    {entry.pic_initials}
                  </span>
                  <span className="text-sm font-medium text-foreground">{entry.pic_name}</span>
                </button>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {teamOf(entry)}
                </span>
                <span className="text-muted-foreground" aria-hidden="true">
                  →
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/app/${entry.application_id}`)}
                  className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                >
                  {entry.application_name}
                </button>
                {entry.notes && (
                  <span className="text-xs text-muted-foreground">· {entry.notes}</span>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      {isAdmin && (
        <RotateDialog
          open={rotateOpen}
          onOpenChange={setRotateOpen}
          month={activeMonth ?? ""}
          departments={departments ?? []}
          defaultDepartmentId={departmentId}
          onDone={refresh}
        />
      )}
      {isAdmin && (
        <AddShiftDialog
          date={addDate}
          onClose={() => setAddDate(null)}
          pending={addShift.isPending}
          onSubmit={(payload) => addShift.mutate(payload)}
        />
      )}
      <PicDrawer />
      <ServerDrawer />
    </div>
  );
}

// Today + the next days, grouped by department: click a department to see which PICs
// cover it that day.
function UpcomingPanel({
  upcoming,
  onOpenPic,
  activeDepartmentId,
  onPickDepartment,
}: {
  upcoming: StandbyUpcoming | null;
  onOpenPic: (id: string) => void;
  activeDepartmentId: string;
  onPickDepartment: (departmentId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null); // "date::team"

  const days = useMemo(() => {
    if (!upcoming) return [];
    const out: { date: string; teams: Map<string, StandbyCalendarEntry[]> }[] = [];
    for (let i = 0; i < 4; i += 1) {
      const date = new Date(`${upcoming.today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + i);
      const iso = date.toISOString().slice(0, 10);
      const teams = new Map<string, StandbyCalendarEntry[]>();
      for (const entry of upcoming.entries.filter((e) => e.date === iso)) {
        const key = teamOf(entry);
        if (!teams.has(key)) teams.set(key, []);
        teams.get(key)!.push(entry);
      }
      out.push({ date: iso, teams });
    }
    return out;
  }, [upcoming]);

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="standby-upcoming">
      {days.map(({ date, teams }) => (
        <Card key={date} data-testid={`standby-upcoming-${date}`} className="p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-sm font-semibold text-foreground">
              {upcoming ? dayLabel(date, upcoming.today) : "…"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{date}</span>
          </div>
          {teams.size === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No one on standby.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {[...teams.entries()].map(([name, rows]) => {
                const key = `${date}::${name}`;
                const expanded = open === key;
                return (
                  <div key={key}>
                    <button
                      type="button"
                      data-testid={`standby-day-department-${date}-${slugify(name)}`}
                      onClick={() => {
                        setOpen((prev) => (prev === key ? null : key));
                        onPickDepartment(rows[0]?.pic_department_id ?? "");
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs font-semibold transition-colors duration-150",
                        expanded || (activeDepartmentId !== "" &&
                          rows[0]?.pic_department_id === activeDepartmentId)
                          ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                          : "border-border text-foreground hover:bg-muted",
                      )}
                    >
                      <span className="truncate">{name}</span>
                      <span className="ml-2 shrink-0 text-muted-foreground">{rows.length}</span>
                    </button>
                    {expanded && (
                      <div
                        className="mt-1 flex flex-col gap-1 pl-1"
                        data-testid={`standby-day-department-pics-${date}-${slugify(name)}`}
                      >
                        {rows.map((entry) => (
                          <button
                            key={`${entry.pic_id}-${entry.application_id}`}
                            type="button"
                            onClick={() => onOpenPic(entry.pic_id)}
                            className="flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-muted"
                          >
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[8px] font-semibold text-white dark:bg-sky-600">
                              {entry.pic_initials}
                            </span>
                            <span className="font-medium text-foreground">{entry.pic_name}</span>
                            <span className="truncate text-muted-foreground">
                              · {entry.application_name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// Admin-only: assign one shift to a specific day.
function AddShiftDialog({
  date,
  onClose,
  pending,
  onSubmit,
}: {
  date: string | null;
  onClose: () => void;
  pending: boolean;
  onSubmit: (payload: {
    pic_id: string;
    date: string;
    application_id: string;
    notes: string;
  }) => void;
}) {
  const [picId, setPicId] = useState("");
  const [appId, setAppId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: pics } = useQuery({
    queryKey: ["pics"],
    queryFn: () => apiGet<Pic[]>("/pics"),
    enabled: date !== null,
  });
  const { data: apps } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
    enabled: date !== null,
  });

  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="standby-add-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add standby shift</DialogTitle>
          <DialogDescription>
            Assign a person in charge to cover one application on {date}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="standby-add-pic">Person in charge</Label>
            <Select value={picId} onValueChange={setPicId}>
              <SelectTrigger id="standby-add-pic" data-testid="standby-add-pic-select">
                <SelectValue placeholder="Select a PIC" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {(pics ?? []).map((pic) => (
                  <SelectItem key={pic.id} value={pic.id}>
                    {pic.initials} — {pic.name}
                    {pic.department ? ` (${pic.department})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="standby-add-app">Application</Label>
            <Select value={appId} onValueChange={setAppId}>
              <SelectTrigger id="standby-add-app" data-testid="standby-add-app-select">
                <SelectValue placeholder="Select an application" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {(apps ?? []).map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="standby-add-notes">Notes</Label>
            <Input
              id="standby-add-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              data-testid="standby-add-notes-input"
              placeholder="Optional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="standby-add-cancel-btn">
            Cancel
          </Button>
          <Button
            disabled={pending}
            data-testid="standby-add-submit-btn"
            onClick={() => {
              if (!picId || !appId || !date) {
                toast.error("Pick a PIC and an application");
                return;
              }
              onSubmit({ pic_id: picId, date, application_id: appId, notes });
              setPicId("");
              setAppId("");
              setNotes("");
            }}
          >
            {pending ? "Saving…" : "Add shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Admin-only: round-robin a department's PICs across every day of the displayed month.
function RotateDialog({
  open,
  onOpenChange,
  month,
  departments,
  defaultDepartmentId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  departments: Department[];
  defaultDepartmentId: string;
  onDone: () => void;
}) {
  const [department, setDepartment] = useState(defaultDepartmentId);
  const [appId, setAppId] = useState("");
  const [replace, setReplace] = useState(true);
  const [weekends, setWeekends] = useState(true);

  const { data: apps } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
    enabled: open,
  });

  const rotate = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPost<StandbyRotateResult>("/standby/rotate", payload),
    onSuccess: (result) => {
      onDone();
      onOpenChange(false);
      toast.success(
        `${result.department_name}: ${result.created} shift(s) created across ${result.pics_used} PIC(s)`,
      );
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="standby-rotate-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Auto-fill {month}</DialogTitle>
          <DialogDescription>
            Rotates every active PIC in the department day by day across the whole month.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Department</Label>
            <SearchSelect
              testid="rotate-department-select"
              value={department}
              onChange={setDepartment}
              allLabel="Select a department"
              placeholder="Search departments…"
              className="w-full"
              options={departments.map((d) => ({
                id: d.id,
                label: d.name,
                hint: `${d.pic_count} PIC`,
              }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rotate-app">Application (optional)</Label>
            <Select
              value={appId || "__own__"}
              onValueChange={(value) => setAppId(value === "__own__" ? "" : value)}
            >
              <SelectTrigger id="rotate-app" data-testid="rotate-app-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="__own__">Each PIC's own application</SelectItem>
                {(apps ?? []).map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={replace}
              onCheckedChange={(checked) => setReplace(checked === true)}
              data-testid="rotate-replace-checkbox"
            />
            Clear this department's existing shifts in {month} first
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={weekends}
              onCheckedChange={(checked) => setWeekends(checked === true)}
              data-testid="rotate-weekends-checkbox"
            />
            Include weekends
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="rotate-cancel-btn">
            Cancel
          </Button>
          <Button
            disabled={rotate.isPending}
            data-testid="rotate-submit-btn"
            onClick={() => {
              if (!department) {
                toast.error("Pick a department to rotate");
                return;
              }
              rotate.mutate({
                department_id: department,
                month,
                application_id: appId || null,
                replace_existing: replace,
                include_weekends: weekends,
              });
            }}
          >
            {rotate.isPending ? "Filling…" : "Fill month"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
