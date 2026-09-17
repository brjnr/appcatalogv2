import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatCount } from "@/lib/format";
import type { AppCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";

export interface HeroStats {
  total: number;
  active: number;
  favorites: number;
  categories: number;
}

interface HeroSearchSectionProps {
  search: string;
  onSearchChange: (value: string) => void;
  categoryId: string; // "All" or a category id
  onCategoryChange: (value: string) => void;
  categories: AppCategory[];
  stats: HeroStats | null;
}

// Dark command hero: heading, omni-search input, category pills, live catalog stats.
export function HeroSearchSection({
  search,
  onSearchChange,
  categoryId,
  onCategoryChange,
  categories,
  stats,
}: HeroSearchSectionProps) {
  return (
    <section className="relative overflow-hidden bg-slate-900 dark:bg-[#0B0F17]">
      <div className="bg-grid-pattern absolute inset-0" aria-hidden="true" />
      <div
        className="absolute -top-24 right-10 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">
          Enterprise Application Portal
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Find the application you need
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          One portal for every system, service, and tool — search by name, keyword, category, or
          description.
        </p>

        <div className="relative mt-6 max-w-2xl">
          <Search
            className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            data-testid="hero-search-input"
            aria-label="Search applications"
            placeholder="Search applications, systems, services…"
            className="h-12 rounded-xl border-white/15 bg-white/10 pl-11 text-base text-white placeholder:text-slate-400 dark:border-white/15 dark:bg-white/10"
          />
        </div>

        <nav aria-label="Categories" className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="category-pill-all"
            aria-pressed={categoryId === "All"}
            onClick={() => onCategoryChange("All")}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,color] duration-150",
              categoryId === "All"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
            )}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              data-testid={`category-pill-${slug(category)}`}
              aria-pressed={categoryId === category.id}
              onClick={() => onCategoryChange(category.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,color] duration-150",
                categoryId === category.id
                  ? "bg-sky-600 text-white shadow-sm"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
              )}
            >
              <CategoryIcon
                icon={category.icon}
                iconUrl={category.icon_url}
                className={cn(
                  "h-4 w-4",
                  categoryId === category.id ? "text-white" : "text-slate-400",
                )}
              />
              {category.name}
            </button>
          ))}
        </nav>

        {stats && (
          <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Total Apps
              </dt>
              <dd data-testid="stat-total-apps" className="mt-1 font-heading text-xl font-semibold text-white">
                {stats.total}
              </dd>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Active Services
              </dt>
              <dd data-testid="stat-active-apps" className="mt-1 font-heading text-xl font-semibold text-white">
                {stats.active}
              </dd>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Favorited
              </dt>
              <dd data-testid="stat-favorites" className="mt-1 font-heading text-xl font-semibold text-white">
                {formatCount(stats.favorites)}
              </dd>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Categories
              </dt>
              <dd data-testid="stat-categories-count" className="mt-1 font-heading text-xl font-semibold text-white">
                {stats.categories}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}

function slug(category: AppCategory): string {
  return category.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
