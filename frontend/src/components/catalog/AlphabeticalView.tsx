import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { slugify, type CardActions, type CatalogApp } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AppIcon } from "./AppIcon";
import { StatusBadge } from "./StatusBadge";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type AlphabeticalViewProps = CardActions & { apps: CatalogApp[] };

// Mode 3 — Alphabetical: A–Z grouped sections with a sticky jump bar.
export function AlphabeticalView({ apps, onOpenDetail, onLaunch }: AlphabeticalViewProps) {
  const groups = useMemo(() => {
    const map = new Map<string, CatalogApp[]>();
    const sorted = [...apps].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    for (const app of sorted) {
      const first = (app.name[0] ?? "#").toUpperCase();
      const key = /[A-Z]/.test(first) ? first : "#";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(app);
    }
    return map;
  }, [apps]);

  const jump = (letter: string) => {
    document.getElementById(`alpha-section-${letter}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="pb-6">
      <div
        data-testid="alphabetical-jump-bar"
        className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center gap-0.5 border-b bg-background/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6"
      >
        {[...ALPHABET, "#"].map((letter) => {
          const hasApps = groups.has(letter);
          return (
            <button
              key={letter}
              type="button"
              data-testid={`alphabet-jump-${letter}`}
              disabled={!hasApps}
              onClick={() => jump(letter)}
              aria-label={`Jump to ${letter}`}
              className={cn(
                "h-6 w-6 rounded text-xs font-semibold transition-[background-color,color] duration-150",
                hasApps
                  ? "bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300"
                  : "cursor-not-allowed text-muted-foreground/40",
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {[...groups.entries()].map(([letter, items]) => (
        <section
          key={letter}
          id={`alpha-section-${letter}`}
          aria-label={`Applications starting with ${letter}`}
          className="scroll-mt-28 pt-8 first:pt-4"
        >
          <div className="flex items-center gap-2 border-b pb-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              {letter}
            </h2>
            <Badge variant="outline">{items.length}</Badge>
          </div>
          <div>
            {items.map((app) => {
              const slug = slugify(app.name);
              return (
                <div
                  key={app.id}
                  data-testid={`app-card-${slug}`}
                  onClick={() => onOpenDetail(app)}
                  className="flex cursor-pointer items-center gap-3 border-b border-border/60 py-2.5 transition-[background-color] duration-150 last:border-0 hover:bg-muted/40"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
                    <AppIcon name={app.icon} className="h-4 w-4" />
                  </span>
                  <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {app.name}
                  </h3>
                  <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                    {app.category_name}
                  </Badge>
                  <StatusBadge status={app.status} className="hidden shrink-0 md:inline-flex" />
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`app-open-btn-${slug}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLaunch(app);
                    }}
                  >
                    Open
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
