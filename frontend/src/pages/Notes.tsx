import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { NotebookPen, Pin, Plus, Search, Users } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPatch, apiPost } from "@/lib/api";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import type { Department, Note, SessionUser } from "@/lib/types";
import { NOTE_SORTS, slugify } from "@/lib/types";
import { AppNavbar } from "@/components/catalog/AppNavbar";
import { NoteDetailDialog } from "@/components/catalog/NoteDetailDialog";
import { NoteFormDialog } from "@/components/catalog/NoteFormDialog";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { SearchSelect } from "@/components/catalog/SearchSelect";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function NotesPage() {
  return (
    <InfraNavProvider>
      <Notes />
    </InfraNavProvider>
  );
}

// Shared scratchpad: temporary notes about servers, alerts, or applications. A note can be
// shared with everyone or with one department; the author, that department, and admins can
// edit it. Pinned notes float to the top.
function Notes() {
  const queryClient = useQueryClient();
  const { openServer, openPic } = useInfraNav();
  const [view, setView] = useState<"active" | "trash">("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [detail, setDetail] = useState<Note | null>(null);

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SessionUser | null>("/auth/me"),
    retry: false,
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet<Department[]>("/departments"),
    enabled: Boolean(user),
  });

  const { data: notes, isLoading } = useQuery({
    queryKey: ["notes", view, sort, departmentFilter],
    queryFn: () =>
      apiGet<Note[]>(
        `/notes?view=${view}&sort=${sort}${departmentFilter ? `&department_id=${departmentFilter}` : ""}`,
      ),
    enabled: Boolean(user),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notes"] });
    queryClient.invalidateQueries({ queryKey: ["note-alerts"] });
  };

  const remove = useMutation({
    mutationFn: (note: Note) => apiDelete<void>(`/notes/${note.id}`),
    onSuccess: (_data, note) => {
      invalidate();
      setDetail(null);
      toast.success(note.status === "trashed" ? "Note deleted for good" : "Note moved to Trash");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const restore = useMutation({
    mutationFn: (note: Note) => apiPost<Note>(`/notes/${note.id}/restore`),
    onSuccess: () => {
      invalidate();
      setDetail(null);
      toast.success("Note restored");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const togglePin = useMutation({
    mutationFn: (note: Note) => apiPatch<Note>(`/notes/${note.id}/pin`),
    onSuccess: (saved) => {
      invalidate();
      setDetail(saved);
      toast.success(saved.pinned ? "Pinned to the top" : "Unpinned");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const q = search.trim().toLowerCase();
  const filtered = (notes ?? []).filter((note) =>
    q ? `${note.title} ${note.body} ${note.author_name}`.toLowerCase().includes(q) : true,
  );

  return (
    <div className="min-h-svh">
      <AppNavbar user={user ?? null} />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-8" data-testid="notes-page">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight text-foreground">
              <NotebookPen className="h-5 w-5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
              Notes & Memos
            </h1>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
              Temporary notes about servers, alerts, or applications. Share one with everyone or
              with any number of departments — the author, those departments, and administrators can
              edit it. Expired notes move to Trash and are purged 7 days later.
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
                data-testid="notes-search-input"
                aria-label="Search notes"
                placeholder="Search notes…"
                className="h-9 w-44 pl-8"
              />
            </div>
            <Button
              data-testid="add-note-btn"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New Note
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <div className="flex gap-1.5" role="tablist" aria-label="Notes view">
            {(["active", "trash"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                data-testid={`notes-tab-${id}`}
                onClick={() => setView(id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150",
                  view === id
                    ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {id === "active" ? "Active notes" : "Deleted (7-day)"}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SearchSelect
              testid="notes-department-filter"
              value={departmentFilter}
              onChange={setDepartmentFilter}
              allLabel="All departments"
              placeholder="Search departments…"
              className="min-w-44"
              options={(departments ?? []).map((department) => ({
                id: department.id,
                label: department.name,
              }))}
            />
            <SearchSelect
              testid="notes-sort"
              value={sort}
              onChange={(value) => setSort(value || "newest")}
              placeholder="Search sorts…"
              className="min-w-52"
              options={NOTE_SORTS.map((option) => ({ id: option.id, label: option.label }))}
            />
            <span className="text-xs text-muted-foreground" data-testid="notes-count">
              {isLoading ? "Loading…" : `${filtered.length} note(s)`}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2" data-testid="notes-list">
          {filtered.length === 0 ? (
            <Card className="p-10 text-center md:col-span-2" data-testid="notes-empty">
              <p className="font-medium text-foreground">
                {view === "trash" ? "Trash is empty" : "No notes yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {view === "trash"
                  ? "Expired and deleted notes appear here for 7 days."
                  : "Write the first memo about a server, alert, or application."}
              </p>
            </Card>
          ) : (
            filtered.map((note) => (
              <Card
                key={note.id}
                data-testid={`note-card-${slugify(note.title)}`}
                onClick={() => setDetail(note)}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 p-4 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-sm",
                  note.pinned && "border-amber-300 bg-amber-50/40 dark:bg-amber-950/10",
                  note.status === "trashed" && "border-dashed opacity-90",
                )}
              >
                <div className="flex items-start gap-2">
                  {note.pinned && (
                    <Pin
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
                      aria-label="Pinned"
                      data-testid={`note-pinned-${slugify(note.title)}`}
                    />
                  )}
                  <h2
                    className="min-w-0 flex-1 font-heading text-sm font-semibold text-foreground"
                    data-testid={`note-title-${slugify(note.title)}`}
                  >
                    {note.title}
                  </h2>
                  {note.status === "trashed" && note.can_edit && (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`note-restore-btn-${slugify(note.title)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        restore.mutate(note);
                      }}
                    >
                      Restore
                    </Button>
                  )}
                </div>

                {note.body && (
                  <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                    {note.body}
                  </p>
                )}

                {note.links_out.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {note.links_out.map((link) => (
                      <span
                        key={`${link.kind}-${link.id}`}
                        data-testid={`note-link-${slugify(note.title)}-${link.kind}-${slugify(link.name)}`}
                        className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground"
                      >
                        {link.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
                  <span data-testid={`note-author-${slugify(note.title)}`}>
                    by <span className="font-medium text-foreground">{note.author_name}</span>
                  </span>
                  <span
                    data-testid={`note-audience-${slugify(note.title)}`}
                    className="inline-flex items-center gap-1"
                  >
                    <Users className="h-3 w-3" aria-hidden="true" />
                    {note.department_names.length > 0
                      ? note.department_names.join(", ")
                      : "Everyone"}
                  </span>
                  <span className="font-mono">noted {note.note_date}</span>
                  {note.status === "trashed" ? (
                    <span
                      data-testid={`note-purge-${slugify(note.title)}`}
                      className="font-medium text-red-600 dark:text-red-400"
                    >
                      purges {note.purge_on ?? "—"}
                    </span>
                  ) : (
                    <span
                      data-testid={`note-retention-${slugify(note.title)}`}
                      className={cn(
                        "font-medium",
                        note.days_left <= 1
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground",
                      )}
                    >
                      keeps until {note.expires_at} · {note.days_left} day(s) left
                    </span>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </main>

      <NoteDetailDialog
        note={detail}
        onOpenChange={(open) => !open && setDetail(null)}
        onEdit={(note) => {
          setDetail(null);
          setEditing(note);
          setFormOpen(true);
        }}
        onTogglePin={(note) => togglePin.mutate(note)}
        onDelete={(note) => remove.mutate(note)}
        onOpenServer={(id) => {
          setDetail(null);
          openServer(id);
        }}
        onOpenPic={(id) => {
          setDetail(null);
          openPic(id);
        }}
      />
      <NoteFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ServerDrawer />
      <PicDrawer />
    </div>
  );
}
