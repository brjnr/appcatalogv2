import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, SearchX, ServerCrash } from "lucide-react";
import { apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { useFavorites, usePersistedState } from "@/lib/prefs";
import type {
  Note,
  AppCategory,
  CardActions,
  CatalogApp,
  LayoutId,
  SessionUser,
  SortId,
} from "@/lib/types";
import { AppNavbar } from "@/components/catalog/AppNavbar";
import { HeroSearchSection, type HeroStats } from "@/components/catalog/HeroSearchSection";
import { CatalogToolbar } from "@/components/catalog/CatalogToolbar";
import { AppCardGrid } from "@/components/catalog/AppCardGrid";
import { AppCardList } from "@/components/catalog/AppCardList";
import { AppCardCompact } from "@/components/catalog/AppCardCompact";
import { AlphabeticalView } from "@/components/catalog/AlphabeticalView";
import { CategoryView } from "@/components/catalog/CategoryView";
import { AppFormDialog } from "@/components/catalog/AppFormDialog";
import { InfraSearchResults } from "@/components/catalog/InfraSearchResults";
import { NoteDetailDialog } from "@/components/catalog/NoteDetailDialog";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import { Button } from "@/components/ui/button";

// Infra search results and their drawers read ?server= / ?pic= from the URL.
export default function HomePage() {
  return (
    <InfraNavProvider>
      <Home />
    </InfraNavProvider>
  );
}

function Home() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  // Session — the backend scopes /api/apps to this user's assigned categories.
  const { data: user, isLoading: authLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SessionUser | null>("/auth/me"),
    retry: false,
  });

  const { data: apps, isLoading, isError, refetch } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
    enabled: Boolean(user),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<AppCategory[]>("/categories"),
    enabled: Boolean(user),
  });

  // Filters (session) + layout/sort (persisted across visits).
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("All");
  const [environment, setEnvironment] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = usePersistedState<SortId>("catalog.sort", "name_asc");
  const [layout, setLayout] = usePersistedState<LayoutId>("catalog.layout", "grid");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [noteDetail, setNoteDetail] = useState<Note | null>(null);
  const { openServer, openPic } = useInfraNav();
  const { favorites, toggle: toggleFavoriteLocal } = useFavorites();

  const launch = useMutation({
    mutationFn: (id: string) => apiPost<CatalogApp>(`/apps/${id}/launch`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apps"] }),
  });

  const favoriteSync = useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      apiPost<CatalogApp>(`/apps/${id}/favorite`, { favorite }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apps"] }),
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const handleToggleFavorite = (app: CatalogApp) => {
    const willFavorite = !favorites.has(app.id);
    toggleFavoriteLocal(app.id);
    favoriteSync.mutate({ id: app.id, favorite: willFavorite });
  };

  const handleLaunch = (app: CatalogApp) => {
    // Only permit http/https targets — an admin-supplied "javascript:" URL
    // would otherwise execute in this origin's context on click.
    try {
      const parsed = new URL(app.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        toast.error(`Cannot open ${app.name}: unsupported URL scheme`);
        return;
      }
    } catch {
      toast.error(`Cannot open ${app.name}: invalid URL`);
      return;
    }
    window.open(app.url, "_blank", "noopener,noreferrer");
    launch.mutate(app.id);
  };

  const actions: CardActions = {
    onOpenDetail: (app) => navigate(`/app/${app.id}`),
    onLaunch: handleLaunch,
    onToggleFavorite: handleToggleFavorite,
    isFavorite: (id) => favorites.has(id),
  };

  const filtered = useMemo(() => {
    const all = apps ?? [];
    const q = search.trim().toLowerCase();
    const list = all.filter((app) => {
      if (categoryId !== "All" && app.category_id !== categoryId) return false;
      if (environment !== "All" && app.environment !== environment) return false;
      if (status !== "All" && app.status !== status) return false;
      if (favoritesOnly && !favorites.has(app.id)) return false;
      if (q) {
        const haystack = `${app.name} ${app.description} ${app.category_name} ${app.environment}`;
        if (!haystack.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    switch (sort) {
      case "name_desc":
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "most_favorite":
        sorted.sort((a, b) => b.favorite_count - a.favorite_count || a.name.localeCompare(b.name));
        break;
      case "recently_added":
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case "recently_updated":
        sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        break;
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [apps, search, categoryId, environment, status, favoritesOnly, favorites, sort]);

  const stats = useMemo<HeroStats | null>(() => {
    if (!apps) return null;
    return {
      total: apps.length,
      active: apps.filter((app) => app.status === "Active").length,
      favorites: apps.reduce((sum, app) => sum + app.favorite_count, 0),
      categories: new Set(apps.map((app) => app.category_id)).size,
    };
  }, [apps]);

  const filtersActive =
    categoryId !== "All" ||
    environment !== "All" ||
    status !== "All" ||
    favoritesOnly ||
    search.trim() !== "";

  const clearFilters = () => {
    setSearch("");
    setCategoryId("All");
    setEnvironment("All");
    setStatus("All");
    setFavoritesOnly(false);
  };

  // Not signed in → login (the whole catalog is behind auth; the backend enforces it too).
  if (!authLoading && !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="min-h-svh">
      <AppNavbar
        user={user ?? null}
        search={search}
        onSearchChange={setSearch}
        favoritesOnly={favoritesOnly}
        onFavoritesToggle={() => setFavoritesOnly((value) => !value)}
        layout={layout}
        onLayoutChange={setLayout}
        onAddApp={() => setFormOpen(true)}
      />

      <HeroSearchSection
        search={search}
        onSearchChange={setSearch}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        categories={categories ?? []}
        stats={stats}
      />

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <CatalogToolbar
          count={filtered.length}
          total={apps?.length ?? 0}
          environment={environment}
          onEnvironmentChange={setEnvironment}
          status={status}
          onStatusChange={setStatus}
          sort={sort}
          onSortChange={(value) => setSort(value as SortId)}
          filtersActive={filtersActive}
          onClearFilters={clearFilters}
        />

        <InfraSearchResults search={search} onOpenNote={setNoteDetail} />

        {isLoading ? (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="catalog-loading"
          >
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-52 animate-pulse rounded-xl border bg-muted/40" />
            ))}
          </div>
        ) : isError ? (
          <div
            data-testid="catalog-error"
            className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center"
          >
            <ServerCrash className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">Catalog temporarily unavailable</p>
              <p className="text-sm text-muted-foreground">
                We couldn't load the application list. Your filters and layout are untouched.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()} data-testid="catalog-retry-btn">
              Try again
            </Button>
          </div>
        ) : (apps?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <p className="font-medium text-foreground">No applications available</p>
            <p className="text-sm text-muted-foreground">
              {user?.role === "administrator"
                ? "Register your first application to get started."
                : "No applications have been assigned to your categories yet — ask an administrator."}
            </p>
            {user?.role === "administrator" && (
              <Button onClick={() => setFormOpen(true)} data-testid="empty-catalog-add-btn">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add application
              </Button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div
            data-testid="no-results"
            className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center"
          >
            <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">No applications match</p>
              <p className="text-sm text-muted-foreground">
                Try a different search term, category, or filter combination.
              </p>
            </div>
            <Button variant="outline" onClick={clearFilters} data-testid="no-results-reset-btn">
              Reset filters
            </Button>
          </div>
        ) : layout === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((app) => (
              <AppCardGrid key={app.id} app={app} {...actions} />
            ))}
          </div>
        ) : layout === "list" ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            {filtered.map((app) => (
              <AppCardList key={app.id} app={app} {...actions} />
            ))}
          </div>
        ) : layout === "alphabetical" ? (
          <AlphabeticalView apps={filtered} {...actions} />
        ) : layout === "category" ? (
          <CategoryView apps={filtered} {...actions} />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            {filtered.map((app) => (
              <AppCardCompact key={app.id} app={app} {...actions} />
            ))}
          </div>
        )}
      </main>

      <AppFormDialog open={formOpen} onOpenChange={setFormOpen} initial={null} />
      <NoteDetailDialog
        note={noteDetail}
        onOpenChange={(open) => !open && setNoteDetail(null)}
        onEdit={() => navigate("/notes")}
        onTogglePin={() => navigate("/notes")}
        onDelete={() => navigate("/notes")}
        onOpenServer={(id) => {
          setNoteDetail(null);
          openServer(id);
        }}
        onOpenPic={(id) => {
          setNoteDetail(null);
          openPic(id);
        }}
      />
      <ServerDrawer />
      <PicDrawer />
    </div>
  );
}
