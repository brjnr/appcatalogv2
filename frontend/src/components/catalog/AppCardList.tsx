import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { hostnameOf, slugify, type CardActions, type CatalogApp } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AppIcon } from "./AppIcon";
import { EnvironmentBadge, StatusBadge } from "./StatusBadge";

type AppCardListProps = CardActions & { app: CatalogApp };

// Mode 2 — List: high-density horizontal rows for users who know what they want.
export function AppCardList({
  app,
  onOpenDetail,
  onLaunch,
  onToggleFavorite,
  isFavorite,
}: AppCardListProps) {
  const slug = slugify(app.name);
  const favorite = isFavorite(app.id);

  return (
    <div
      data-testid={`app-card-${slug}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(app)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpenDetail(app);
      }}
      className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 transition-[background-color] duration-150 last:border-b-0 hover:bg-muted/50 sm:gap-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
        <AppIcon name={app.icon} className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{app.name}</h3>
          <span className="hidden font-mono text-[11px] text-muted-foreground md:inline">
            {hostnameOf(app.url)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{app.description}</p>
      </div>

      <Badge variant="secondary" className="hidden shrink-0 md:inline-flex">
        {app.category_name}
      </Badge>
      <EnvironmentBadge environment={app.environment} className="hidden shrink-0 lg:inline-flex" />
      <StatusBadge status={app.status} className="hidden shrink-0 sm:inline-flex" />

      <button
        type="button"
        data-testid={`app-favorite-${slug}`}
        aria-pressed={favorite}
        aria-label={favorite ? `Remove ${app.name} from favorites` : `Add ${app.name} to favorites`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite(app);
        }}
        className={cn(
          "shrink-0 rounded-full p-1.5 transition-[color,background-color] duration-150",
          favorite
            ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
            : "text-muted-foreground/40 hover:bg-muted hover:text-amber-500",
        )}
      >
        <Star className={cn("h-4 w-4", favorite && "fill-amber-400 text-amber-400")} aria-hidden="true" />
      </button>

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
}
