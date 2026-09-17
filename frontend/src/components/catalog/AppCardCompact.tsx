import { ArrowUpRight, Star } from "lucide-react";
import { slugify, type CardActions, type CatalogApp } from "@/lib/types";
import { AppIcon } from "./AppIcon";

type AppCardCompactProps = CardActions & { app: CatalogApp };

// Mode 5 — Compact: dense tile matrix for scanning large catalogs at a glance.
export function AppCardCompact({
  app,
  onOpenDetail,
  onLaunch,
  isFavorite,
}: AppCardCompactProps) {
  const slug = slugify(app.name);

  return (
    <div
      data-testid={`app-card-${slug}`}
      onClick={() => onOpenDetail(app)}
      title={app.name}
      className="animate-in fade-in relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border bg-card p-3 text-center duration-200 [animation-fill-mode:backwards] transition-[border-color,box-shadow] hover:border-sky-400/70 hover:shadow-sm dark:hover:border-sky-500/60"
    >
      {isFavorite(app.id) && (
        <Star
          className="absolute right-1.5 top-1.5 h-3 w-3 fill-amber-400 text-amber-400"
          aria-label="Favorite"
        />
      )}
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
        <AppIcon name={app.icon} className="h-4.5 w-4.5" />
      </span>
      <span className="line-clamp-2 min-h-8 text-xs font-medium leading-4 text-foreground">
        {app.name}
      </span>
      <button
        type="button"
        data-testid={`app-open-btn-${slug}`}
        aria-label={`Open ${app.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onLaunch(app);
        }}
        className="inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-[border-color,color] duration-150 hover:border-sky-400 hover:text-sky-600"
      >
        Open <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
