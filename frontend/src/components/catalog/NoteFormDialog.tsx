import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import {
  NOTE_LINK_KINDS,
  NOTE_TEMPLATES,
  slugify,
  type CatalogApp,
  type Department,
  type Note,
  type NoteLink,
  type NoteLinkKind,
  type Pic,
  type Server,
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
import { Textarea } from "@/components/ui/textarea";
import { MultiSearchSelect } from "./SearchSelect";

interface NoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Note | null; // null = create mode
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Create/edit a temporary note. Expiry defaults to 7 days after the note date; after
// expiry the backend moves the note to Trash automatically.
export function NoteFormDialog({ open, onOpenChange, initial }: NoteFormDialogProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);

  const { data: apps } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
    enabled: open,
  });
  const { data: servers } = useQuery({
    queryKey: ["servers"],
    queryFn: () => apiGet<Server[]>("/servers"),
    enabled: open,
  });
  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet<Department[]>("/departments"),
    enabled: open,
  });
  const { data: pics } = useQuery({
    queryKey: ["pics"],
    queryFn: () => apiGet<Pic[]>("/pics"),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    setTitle(initial?.title ?? "");
    setBody(initial?.body ?? "");
    setNoteDate(initial?.note_date ?? today);
    setExpiresAt(initial?.expires_at ?? addDays(today, 7));
    setLinks(initial?.links ?? []);
    setDepartmentIds(initial?.department_ids ?? []);
  }, [open, initial]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      initial ? apiPut<Note>(`/notes/${initial.id}`, payload) : apiPost<Note>("/notes", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["note-alerts"] });
      toast.success(initial ? "Note updated" : "Note saved");
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const optionsFor = (kind: NoteLinkKind) => {
    if (kind === "application") return (apps ?? []).map((a) => ({ id: a.id, name: a.name }));
    if (kind === "server") return (servers ?? []).map((s) => ({ id: s.id, name: s.name }));
    return (pics ?? []).map((p) => ({ id: p.id, name: `${p.initials} — ${p.name}` }));
  };

  const updateLink = (index: number, patch: Partial<NoteLink>) =>
    setLinks((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("A note needs a title");
      return;
    }
    if (links.some((link) => !link.id)) {
      toast.error("Pick an item for every link row, or remove it");
      return;
    }
    if (expiresAt < noteDate) {
      toast.error("Expiry date cannot precede the note date");
      return;
    }
    save.mutate({
      title: title.trim(),
      body: body.trim(),
      note_date: noteDate,
      expires_at: expiresAt,
      links,
      department_ids: departmentIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="note-form-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit note" : "New note"}</DialogTitle>
          <DialogDescription>
            Notes are temporary. After the retention date they move to Trash and are purged 7 days
            later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="note-form-title">Title</Label>
            <Input
              id="note-form-title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              data-testid="note-form-title-input"
              placeholder="DC-BKP-01 disk alert"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Start from a template</Label>
            <div className="flex flex-wrap gap-1.5" data-testid="note-form-templates">
              {NOTE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  data-testid={`note-form-template-${template.id}`}
                  onClick={() => {
                    setTitle((prev) => (prev.trim() ? prev : template.title));
                    setBody(template.body);
                  }}
                  className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors duration-150 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-950/40"
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="note-form-body">Description</Label>
            <Textarea
              id="note-form-body"
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              data-testid="note-form-body-input"
              placeholder="What happened, what to watch, what to do next…"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Share with</Label>
            <MultiSearchSelect
              testid="note-form-departments"
              values={departmentIds}
              onChange={setDepartmentIds}
              emptyLabel="Everyone"
              placeholder="Search departments…"
              options={(departments ?? []).map((department) => ({
                id: department.id,
                label: department.name,
                hint: `${department.pic_count} PIC`,
              }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Pick one or more departments — members of any of them (plus administrators) can see
              and edit this note. Leave it on "Everyone" to share company-wide.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="note-form-note-date">Noted date</Label>
              <Input
                id="note-form-note-date"
                type="date"
                value={noteDate}
                onChange={(event) => setNoteDate(event.target.value)}
                data-testid="note-form-note-date-input"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="note-form-expires-at">Keep until (retention)</Label>
              <Input
                id="note-form-expires-at"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                data-testid="note-form-expires-input"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Linked items (optional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="note-form-add-link-btn"
                onClick={() => setLinks((prev) => [...prev, { kind: "server", id: "" }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add link
              </Button>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              {links.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No links — add one to tie this note to an application, server, or PIC.
                </p>
              ) : (
                links.map((link, index) => (
                  <div
                    key={index}
                    data-testid={`note-form-link-row-${index}`}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[130px_1fr_auto]"
                  >
                    <Select
                      value={link.kind}
                      onValueChange={(value) =>
                        updateLink(index, { kind: value as NoteLinkKind, id: "" })
                      }
                    >
                      <SelectTrigger
                        data-testid={`note-form-link-kind-${index}`}
                        aria-label="Link type"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOTE_LINK_KINDS.map((kind) => (
                          <SelectItem key={kind.id} value={kind.id}>
                            {kind.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={link.id}
                      onValueChange={(value) => updateLink(index, { id: value })}
                    >
                      <SelectTrigger
                        data-testid={`note-form-link-target-${index}`}
                        aria-label="Linked item"
                      >
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {optionsFor(link.kind).map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove link"
                      data-testid={`note-form-link-remove-${index}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
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
              data-testid="note-form-cancel-btn"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="note-form-submit-btn">
              {save.isPending ? "Saving…" : initial ? "Save changes" : "Save note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
