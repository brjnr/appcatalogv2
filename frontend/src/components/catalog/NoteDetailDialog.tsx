import { Link } from "react-router-dom";
import {
  AppWindow,
  ContactRound,
  Pencil,
  Pin,
  PinOff,
  ServerIcon,
  Trash2,
  Users,
} from "lucide-react";
import type { Note } from "@/lib/types";
import { slugify } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface NoteDetailDialogProps {
  note: Note | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onDelete: (note: Note) => void;
  onOpenServer: (id: string) => void;
  onOpenPic: (id: string) => void;
}

// Full note in a popup: who wrote it, who it is shared with, retention, and its links.
export function NoteDetailDialog({
  note,
  onOpenChange,
  onEdit,
  onTogglePin,
  onDelete,
  onOpenServer,
  onOpenPic,
}: NoteDetailDialogProps) {
  return (
    <Dialog open={note !== null} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="note-detail-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        {note && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2">
                {note.pinned && (
                  <Pin
                    className="mt-1 h-4 w-4 shrink-0 text-amber-500"
                    aria-label="Pinned"
                    data-testid="note-detail-pinned-icon"
                  />
                )}
                <span data-testid="note-detail-title">{note.title}</span>
              </DialogTitle>
              <DialogDescription>
                by {note.author_name} · noted {note.note_date}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <p
                className="whitespace-pre-line text-sm text-foreground"
                data-testid="note-detail-body"
              >
                {note.body || "No description."}
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  data-testid="note-detail-audience"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-medium text-foreground"
                >
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {note.department_names.length > 0 ? note.department_names.join(", ") : "Everyone"}
                </span>
                <span
                  data-testid="note-detail-retention"
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-medium",
                    note.status === "trashed"
                      ? "border-red-200 text-red-600 dark:border-red-900 dark:text-red-400"
                      : note.days_left <= 1
                        ? "border-amber-200 text-amber-600 dark:border-amber-900 dark:text-amber-400"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {note.status === "trashed"
                    ? `in Trash · purges ${note.purge_on ?? "—"}`
                    : `keeps until ${note.expires_at} · ${note.days_left} day(s) left`}
                </span>
              </div>

              {note.links_out.length > 0 && (
                <div className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Linked items
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {note.links_out.map((link) => {
                      const Icon =
                        link.kind === "application"
                          ? AppWindow
                          : link.kind === "server"
                            ? ServerIcon
                            : ContactRound;
                      const className =
                        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40";
                      const testid = `note-detail-link-${link.kind}-${slugify(link.name)}`;
                      if (link.kind === "application") {
                        return (
                          <Link
                            key={`${link.kind}-${link.id}`}
                            to={`/app/${link.id}`}
                            data-testid={testid}
                            className={className}
                          >
                            <Icon className="h-3 w-3" aria-hidden="true" /> {link.name}
                          </Link>
                        );
                      }
                      return (
                        <button
                          key={`${link.kind}-${link.id}`}
                          type="button"
                          data-testid={testid}
                          className={className}
                          onClick={() =>
                            link.kind === "server" ? onOpenServer(link.id) : onOpenPic(link.id)
                          }
                        >
                          <Icon className="h-3 w-3" aria-hidden="true" /> {link.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              {note.can_edit && (
                <>
                  <Button
                    variant="outline"
                    data-testid="note-detail-pin-btn"
                    onClick={() => onTogglePin(note)}
                  >
                    {note.pinned ? (
                      <>
                        <PinOff className="h-4 w-4" aria-hidden="true" /> Unpin
                      </>
                    ) : (
                      <>
                        <Pin className="h-4 w-4" aria-hidden="true" /> Pin to top
                      </>
                    )}
                  </Button>
                  {note.status !== "trashed" && (
                    <Button
                      variant="outline"
                      data-testid="note-detail-edit-btn"
                      onClick={() => onEdit(note)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    data-testid="note-detail-delete-btn"
                    onClick={() => onDelete(note)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {note.status === "trashed" ? "Delete forever" : "Move to Trash"}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="note-detail-close-btn"
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
