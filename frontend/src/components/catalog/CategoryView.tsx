import { useMemo } from "react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CardActions, CatalogApp } from "@/lib/types";
import { slugify } from "@/lib/types";
import { AppIcon } from "./AppIcon";

type CategoryViewProps = CardActions & { apps: CatalogApp[] };

// Mode 4 — Category: apps grouped under their category (dynamic, permission-scoped).
export function CategoryView({ apps, onOpenDetail, onLaunch, isFavorite }: CategoryViewProps) {
  const groups = useMemo(() => {
    const map = new Map<string, CatalogApp[]>();
    for (const app of apps) {
      const key = app.category_name || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(app);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [apps]);

  return (
    <div className="pb-6">
      {groups.map(([categoryName, items]) => (
        <section
          key={categoryName}
          id={`category-section-${slugify(categoryName)}`}
          className="pt-8 first:pt-0"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              {categoryName}
            </h2>
            <Badge variant="outline">{items.length}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {items.map((app) => {
              const slug = slugify(app.name);
              return (
                <div
                  key={app.id}
                  role="button"
                  tabIndex={0}
                  data-testid={`app-card-${slug}`}
                  onClick={() => onOpenDetail(app)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onOpenDetail(app);
                  }}
                  className="group inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-[border-color,background-color] duration-150 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40"
                >
                  <AppIcon name={app.icon} className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                  <span className="text-sm font-medium text-foreground">{app.name}</span>
                  {isFavorite(app.id) && (
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-label="Favorite" />
                  )}
                  <button
                    type="button"
                    data-testid={`app-open-btn-${slug}`}
                    aria-label={`Open ${app.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLaunch(app);
                    }}
                    className="rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-[border-color,color] duration-150 hover:border-sky-400 hover:text-sky-600"
                  >
                    Open
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
