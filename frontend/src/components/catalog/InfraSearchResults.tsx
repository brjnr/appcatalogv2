import { useQuery } from "@tanstack/react-query";
import { NotebookPen, ServerIcon, Users } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useInfraNav } from "@/lib/infraNav";
import { slugify, type Note, type Pic, type Server } from "@/lib/types";
import { InfraStatusBadge } from "./InfraBits";
import { Card } from "@/components/ui/card";

/**
 * Everything-search results for the catalog box: matching servers, PICs, and notes
 * alongside the application results. All of them are scoped by the backend to what the
 * signed-in user is allowed to see, so a normal user never sees another team's infra.
 */
export function InfraSearchResults({
  search,
  onOpenNote,
}: {
  search: string;
  onOpenNote?: (note: Note) => void;
}) {
  const query = search.trim();
  const enabled = query.length >= 2;
  const { openServer, openPic } = useInfraNav();

  const { data: servers } = useQuery({
    queryKey: ["servers", "search", query],
    queryFn: () => apiGet<Server[]>(`/servers?q=${encodeURIComponent(query)}`),
    enabled,
  });

  const { data: pics } = useQuery({
    queryKey: ["pics", "search", query],
    queryFn: () => apiGet<Pic[]>(`/pics?q=${encodeURIComponent(query)}`),
    enabled,
  });

  const { data: notes } = useQuery({
    queryKey: ["notes", "search", query],
    queryFn: () => apiGet<Note[]>(`/notes?q=${encodeURIComponent(query)}`),
    enabled,
  });

  const serverHits = servers ?? [];
  const picHits = pics ?? [];
  const noteHits = notes ?? [];
  if (!enabled || (serverHits.length === 0 && picHits.length === 0 && noteHits.length === 0)) {
    return null;
  }

  return (
    <Card className="mb-4 p-4" data-testid="infra-search-results">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Infrastructure & notes matching “{query}”
      </h2>

      {serverHits.length > 0 && (
        <div className="mt-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <ServerIcon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
            Servers ({serverHits.length})
          </span>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="infra-search-servers">
            {serverHits.slice(0, 12).map((server) => (
              <button
                key={server.id}
                type="button"
                onClick={() => openServer(server.id)}
                data-testid={`infra-search-server-${slugify(server.name)}`}
                title={`${server.hostname || server.name} · ${server.ip_address}`}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 transition-[border-color,background-color] duration-150 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40"
              >
                <span className="font-mono text-[12px] font-medium text-foreground">
                  {server.name}
                </span>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300">
                  {server.location}
                </span>
                <InfraStatusBadge status={server.status} />
              </button>
            ))}
          </div>
        </div>
      )}

      {picHits.length > 0 && (
        <div className="mt-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Users className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
            People in charge ({picHits.length})
          </span>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="infra-search-pics">
            {picHits.slice(0, 12).map((pic) => (
              <button
                key={pic.id}
                type="button"
                onClick={() => openPic(pic.id)}
                data-testid={`infra-search-pic-${slugify(pic.name)}`}
                title={`${pic.name} · ${pic.position || pic.department}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 transition-[border-color,background-color] duration-150 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white dark:bg-sky-600">
                  {pic.initials}
                </span>
                <span className="text-sm font-medium text-foreground">{pic.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {noteHits.length > 0 && (
        <div className="mt-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <NotebookPen className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
            Notes ({noteHits.length})
          </span>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="infra-search-notes">
            {noteHits.slice(0, 12).map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onOpenNote?.(note)}
                data-testid={`infra-search-note-${slugify(note.title)}`}
                title={`${note.title} · ${note.department_names.join(", ") || "Everyone"}`}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition-[border-color,background-color] duration-150 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40"
              >
                {note.title}
                <span className="text-[10px] font-normal text-muted-foreground">
                  {note.department_names.join(", ") || "Everyone"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
