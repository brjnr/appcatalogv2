import { ArrowRight, MousePointerClick, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { hostnameOf, slugify, type CardActions, type CatalogApp } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AppIcon } from "./AppIcon";
import { StatusBadge } from "./StatusBadge";

type AppCardGridProps = CardActions & { app: CatalogApp };

// Mode 1 — Grid Marketplace: rich card with icon, status pill, category chip,
// description snippet, usage metric, favorite toggle, and Open action.
export function AppCardGrid({
  app,
  onOpenDetail,
  onLaunch,
  onToggleFavorite,
  isFavorite,
}: AppCardGridProps) {
  const slug = slugify(app.name);
  const favorite = isFavorite(app.id);

  return (
    <Card
      data-testid={`app-card-${slug}`}
      onClick={() => onOpenDetail(app)}
      className="animate-in fade-in slide-in-from-bottom-1 flex h-full cursor-pointer flex-col gap-0 p-5 duration-300 [animation-fill-mode:backwards] transition-[transform,border-color,box-shadow] hover:-translate-y-1 hover:border-sky-400/70 hover:shadow-lg dark:hover:border-sky-500/60"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
          <AppIcon name={app.icon} className="h-6 w-6" />
        </span>
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
            "rounded-full p-1.5 transition-[color,background-color] duration-150",
            favorite
              ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              : "text-muted-foreground/40 hover:bg-muted hover:text-amber-500",
          )}
        >
          <Star className={cn("h-4.5 w-4.5", favorite && "fill-amber-400 text-amber-400")} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 pt-3">
        <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">
          {app.name}
        </h3>
        <p className="font-mono text-[11px] text-muted-foreground">{hostnameOf(app.url)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[11px]">
            {app.category_name}
          </Badge>
          <StatusBadge status={app.status} />
        </div>
        <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
          {app.description}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-3">
        <span
          data-testid={`card-category-${slug}`}
          className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground"
        >
          {app.category_name}
        </span>
        <Button
          size="sm"
          data-testid={`app-open-btn-${slug}`}
          onClick={(event) => {
            event.stopPropagation();
            onLaunch(app);
          }}
        >
          Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}
