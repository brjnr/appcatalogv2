import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpRight,
  MousePointerClick,
  Pencil,
  ServerIcon,
  ShieldBan,
  Star,
  Trash2,
} from "lucide-react";
import { ApiError, apiDelete, apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { formatDate, formatCount } from "@/lib/format";
import { useFavorites } from "@/lib/prefs";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import { slugify, type CatalogApp, type Pic, type SessionUser, type Server } from "@/lib/types";
import { AppNavbar } from "@/components/catalog/AppNavbar";
import { AppIcon } from "@/components/catalog/AppIcon";
import { EnvironmentBadge, StatusBadge } from "@/components/catalog/StatusBadge";
import { InfraStatusBadge } from "@/components/catalog/InfraBits";
import { PicBadge } from "@/components/catalog/PicBadge";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { AppFormDialog } from "@/components/catalog/AppFormDialog";
import { ConfirmDeleteDialog } from "@/components/catalog/ConfirmDeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Drawers read ?server= / ?pic= from the URL, so they need the provider above them.
export default function AppDetailPage() {
  return (
    <InfraNavProvider>
      <AppDetail />
    </InfraNavProvider>
  );
}

function AppDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { favorites, toggle: toggleFavoriteLocal } = useFavorites();
  const { openServer, openPic } = useInfraNav();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: user, isLoading: authLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SessionUser | null>("/auth/me"),
    retry: false,
  });

  const {
    data: app,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["apps", id],
    queryFn: () => apiGet<CatalogApp>(`/apps/${id}`),
    enabled: Boolean(id && user),
    retry: false,
  });

  // Full list powers the "more in this category" panel.
  const { data: allApps } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
    enabled: Boolean(user),
  });

  const related = useMemo(() => {
    if (!app || !allApps) return [];
    return allApps
      .filter((candidate) => candidate.category_id === app.category_id && candidate.id !== app.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 4);
  }, [app, allApps]);

  // Servers and PICs attached to this application (both scoped by the backend).
  const { data: servers } = useQuery({
    queryKey: ["servers", "by-app", id],
    queryFn: () => apiGet<Server[]>(`/servers?application_id=${id}`),
    enabled: Boolean(id && user && app),
  });

  const { data: pics } = useQuery({
    queryKey: ["pics", "by-app", id],
    queryFn: () => apiGet<Pic[]>(`/pics?application_id=${id}`),
    enabled: Boolean(id && user && app),
  });

  const launch = useMutation({
    mutationFn: (appId: string) => apiPost<CatalogApp>(`/apps/${appId}/launch`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apps"] }),
  });

  const favoriteSync = useMutation({
    mutationFn: ({ id: appId, favorite }: { id: string; favorite: boolean }) =>
      apiPost<CatalogApp>(`/apps/${appId}/favorite`, { favorite }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apps"] }),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (appId: string) => apiDelete<void>(`/apps/${appId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success("Application deleted");
      navigate("/");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleLaunch = (target: CatalogApp) => {
    try {
      const parsed = new URL(target.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        toast.error(`Cannot open ${target.name}: unsupported URL scheme`);
        return;
      }
    } catch {
      toast.error(`Cannot open ${target.name}: invalid URL`);
      return;
    }
    window.open(target.url, "_blank", "noopener,noreferrer");
    launch.mutate(target.id);
  };

  const handleToggleFavorite = () => {
    if (!app) return;
    const willFavorite = !favorites.has(app.id);
    toggleFavoriteLocal(app.id);
    favoriteSync.mutate({ id: app.id, favorite: willFavorite });
  };

  const favorite = app ? favorites.has(app.id) : false;

  // Not signed in → login.
  if (!authLoading && !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const denied = isError && error instanceof ApiError && error.status === 403;

  return (
    <div className="min-h-svh">
      <AppNavbar user={user ?? null} />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <Link
          to="/"
          data-testid="back-to-catalog-link"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to catalog
        </Link>

        {authLoading || (isLoading && !denied) ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]" data-testid="app-detail-loading">
            <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />
            <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />
          </div>
        ) : denied ? (
          <div
            data-testid="app-detail-denied"
            className="mt-16 flex flex-col items-center gap-3 text-center"
          >
            <ShieldBan className="h-10 w-10 text-red-500" aria-hidden="true" />
            <p className="font-medium text-foreground">Access denied</p>
            <p className="max-w-md text-sm text-muted-foreground">
              This application belongs to a category that has not been assigned to you. Ask an
              administrator if you need access.
            </p>
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              Back to catalog
            </Link>
          </div>
        ) : isError || !app ? (
          <div
            data-testid="app-detail-not-found"
            className="mt-16 flex flex-col items-center gap-3 text-center"
          >
            <p className="font-medium text-foreground">Application not found</p>
            <p className="text-sm text-muted-foreground">
              It may have been removed from the catalog.
            </p>
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              Back to catalog
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
              <Card data-testid="app-detail-card" className="p-6">
                <div className="flex items-start gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
                    <AppIcon name={app.icon} className="h-8 w-8" />
                  </span>
                  <div className="min-w-0">
                    <h1
                      data-testid="app-detail-name"
                      className="font-heading text-2xl font-semibold tracking-tight text-foreground"
                    >
                      {app.name}
                    </h1>
                    <p className="mt-0.5 font-mono text-sm break-all text-muted-foreground">
                      {app.url}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" data-testid="detail-category-badge">
                        {app.category_name}
                      </Badge>
                      <EnvironmentBadge environment={app.environment} />
                      <StatusBadge status={app.status} />
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Purpose
                  </h2>
                  <p
                    data-testid="app-detail-description"
                    className="mt-2 text-sm leading-6 text-foreground/90"
                  >
                    {app.description}
                  </p>
                </div>

                {/* Application Servers — each chip opens the server drawer */}
                <div className="mt-6 border-t pt-5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Application Servers
                    </h2>
                    {servers && servers.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {servers.length}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2" data-testid="app-servers-section">
                    {servers === undefined ? (
                      <div className="h-9 w-40 animate-pulse rounded-lg bg-muted/50" />
                    ) : servers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No servers assigned to this application yet.
                      </p>
                    ) : (
                      servers.map((server) => (
                        <button
                          key={server.id}
                          type="button"
                          onClick={() => openServer(server.id)}
                          data-testid={`app-server-chip-${slugify(server.name)}`}
                          title={`View ${server.name} details`}
                          className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40"
                        >
                          <ServerIcon
                            className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300"
                            aria-hidden="true"
                          />
                          <span className="font-mono text-[13px] font-medium text-foreground">
                            {server.name}
                          </span>
                          <InfraStatusBadge status={server.status} className="ml-0.5" />
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Application PIC — each badge opens the PIC drawer */}
                <div className="mt-5 border-t pt-5">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Person in Charge
                  </h2>
                  <div className="mt-2.5 flex flex-wrap gap-2" data-testid="app-pics-section">
                    {pics === undefined ? (
                      <div className="h-9 w-36 animate-pulse rounded-full bg-muted/50" />
                    ) : pics.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No PIC assigned to this application yet.
                      </p>
                    ) : (
                      pics.map((pic) => (
                        <PicBadge
                          key={pic.id}
                          id={pic.id}
                          name={pic.name}
                          initials={pic.initials}
                          onClick={openPic}
                        />
                      ))
                    )}
                  </div>
                </div>
              </Card>

              <div className="flex flex-col gap-4">
                <Card className="p-5">
                  <Button
                    size="lg"
                    className="w-full"
                    data-testid="app-detail-launch-btn"
                    onClick={() => handleLaunch(app)}
                  >
                    Open Application <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    className="mt-2 w-full"
                    data-testid="app-detail-favorite-btn"
                    aria-pressed={favorite}
                    onClick={handleToggleFavorite}
                  >
                    <Star
                      className={favorite ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4"}
                      aria-hidden="true"
                    />
                    {favorite ? "Favorited" : "Add to favorites"}
                  </Button>

                  <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3 border-t pt-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Favorites</dt>
                      <dd data-testid="detail-favorite-count" className="font-semibold text-foreground">
                        {formatCount(app.favorite_count)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Added</dt>
                      <dd className="font-medium text-foreground">{formatDate(app.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Updated</dt>
                      <dd className="font-medium text-foreground">{formatDate(app.updated_at)}</dd>
                    </div>
                  </dl>

                  {user?.role === "administrator" && (
                    <div className="mt-4 flex gap-2 border-t pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="app-detail-edit-btn"
                        onClick={() => setEditOpen(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        data-testid="app-detail-delete-btn"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                      </Button>
                    </div>
                  )}
                </Card>

                {related.length > 0 && (
                  <Card className="p-5">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      More in {app.category_name}
                    </h2>
                    <div className="mt-3 flex flex-col gap-1">
                      {related.map((candidate) => (
                        <Link
                          key={candidate.id}
                          to={`/app/${candidate.id}`}
                          data-testid={`related-app-${slugify(candidate.name)}`}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                        >
                          <AppIcon
                            name={candidate.icon}
                            className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300"
                          />
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            {candidate.name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>

            <AppFormDialog open={editOpen} onOpenChange={setEditOpen} initial={app} />
            <ConfirmDeleteDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              appName={app.name}
              pending={deleteMutation.isPending}
              onConfirm={() => deleteMutation.mutate(app.id)}
            />
          </>
        )}
      </main>

      {/* Deep-linkable drawers: App → Server → PIC → Server … chains both ways */}
      <ServerDrawer />
      <PicDrawer />
    </div>
  );
}
