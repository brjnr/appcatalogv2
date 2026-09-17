import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Network, Share2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import type { DependencyMapData } from "@/lib/types";
import { LOCATION_LABELS, SERVER_LOCATIONS, slugify } from "@/lib/types";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function AdminDependencyMapPage() {
  return (
    <InfraNavProvider>
      <AdminDependencyMap />
    </InfraNavProvider>
  );
}

const ROW = 34; // vertical spacing between nodes in the SVG graph
const PAD = 16;

// Bipartite application <-> server graph. Hovering a node highlights its connections;
// servers shared by more than one application are flagged.
function AdminDependencyMap() {
  const { openServer } = useInfraNav();
  const [hover, setHover] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["dependency-map"],
    queryFn: () => apiGet<DependencyMapData>("/dependency-map"),
  });

  // Site filter: keep only servers on the chosen site, then the apps still linked.
  const locationCounts = SERVER_LOCATIONS.map((site) => ({
    site,
    count: (raw?.servers ?? []).filter((server) => server.location === site).length,
  }));

  const data = useMemo<DependencyMapData | undefined>(() => {
    if (!raw) return undefined;
    if (!location) return raw;
    const servers = raw.servers.filter((server) => server.location === location);
    const serverIds = new Set(servers.map((server) => server.id));
    const edges = raw.edges.filter((edge) => serverIds.has(edge.server_id));
    const appIds = new Set(edges.map((edge) => edge.application_id));
    return {
      applications: raw.applications.filter((app) => appIds.has(app.id)),
      servers,
      edges,
      shared_server_ids: raw.shared_server_ids.filter((id) => serverIds.has(id)),
    };
  }, [raw, location]);

  const layout = useMemo(() => {
    if (!data) return null;
    const appY = new Map(data.applications.map((a, i) => [a.id, PAD + i * ROW]));
    const serverY = new Map(data.servers.map((s, i) => [s.id, PAD + i * ROW]));
    const height = Math.max(
      PAD * 2 + data.applications.length * ROW,
      PAD * 2 + data.servers.length * ROW,
    );
    return { appY, serverY, height };
  }, [data]);

  const shared = new Set(data?.shared_server_ids ?? []);
  const connected = useMemo(() => {
    if (!hover || !data) return new Set<string>();
    const set = new Set<string>([hover]);
    for (const edge of data.edges) {
      if (edge.application_id === hover) set.add(edge.server_id);
      if (edge.server_id === hover) set.add(edge.application_id);
    }
    return set;
  }, [hover, data]);

  const dim = (id: string) => hover !== null && !connected.has(id);

  return (
    <div data-testid="dependency-map-page" className="pb-10">
      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight text-foreground">
        <Network className="h-5 w-5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
        Dependency Map
      </h1>
      <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
        Which applications run on which servers. Hover a node to isolate its links; servers used by
        more than one application are marked as shared — they are your blast-radius risks.
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span data-testid="map-stat-apps">{data?.applications.length ?? 0} applications</span>
        <span data-testid="map-stat-servers">{data?.servers.length ?? 0} servers</span>
        <span data-testid="map-stat-edges">{data?.edges.length ?? 0} links</span>
        <span data-testid="map-stat-shared" className="font-medium text-amber-600 dark:text-amber-400">
          {shared.size} shared server(s)
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5" data-testid="map-location-filter">
        <span className="mr-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Site
        </span>
        <button
          type="button"
          data-testid="map-location-all"
          onClick={() => setLocation(null)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150",
            location === null
              ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          All ({raw?.servers.length ?? 0})
        </button>
        {locationCounts.map(({ site, count }) => (
          <button
            key={site}
            type="button"
            title={LOCATION_LABELS[site]}
            data-testid={`map-location-${slugify(site)}`}
            onClick={() => setLocation((prev) => (prev === site ? null : site))}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150",
              location === site
                ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {site} ({count})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-4 h-96 animate-pulse rounded-xl border bg-muted/40" />
      ) : (data?.edges.length ?? 0) === 0 ? (
        <Card className="mt-4 p-10 text-center" data-testid="map-empty">
          <p className="font-medium text-foreground">No application ↔ server links yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign servers to applications on the Servers page to see the map.
          </p>
        </Card>
      ) : (
        <Card className="mt-4 overflow-x-auto p-4" data-testid="dependency-map-graph">
          <div className="flex min-w-[680px] gap-3">
            {/* Applications column */}
            <div className="w-56 shrink-0">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Applications
              </h2>
              <div style={{ paddingTop: PAD - 12 }}>
                {data?.applications.map((app) => (
                  <div
                    key={app.id}
                    style={{ height: ROW }}
                    className="flex items-center"
                    onMouseEnter={() => setHover(app.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <Link
                      to={`/app/${app.id}`}
                      data-testid={`map-app-${slugify(app.name)}`}
                      className={cn(
                        "block max-w-full truncate rounded-md border px-2 py-1 text-xs font-medium transition-[opacity,border-color,background-color] duration-150",
                        dim(app.id)
                          ? "border-border bg-card text-muted-foreground opacity-40"
                          : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
                      )}
                      title={`${app.name} — ${app.meta}`}
                    >
                      {app.name}
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* Edges */}
            <div className="relative flex-1">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Links
              </h2>
              <svg
                width="100%"
                height={layout?.height ?? 0}
                viewBox={`0 0 100 ${layout?.height ?? 0}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Application to server dependency links"
                className="overflow-visible"
              >
                {data?.edges.map((edge) => {
                  const y1 = layout?.appY.get(edge.application_id) ?? 0;
                  const y2 = layout?.serverY.get(edge.server_id) ?? 0;
                  const isDim =
                    hover !== null &&
                    !(connected.has(edge.application_id) && connected.has(edge.server_id));
                  return (
                    <path
                      key={`${edge.application_id}-${edge.server_id}`}
                      d={`M 0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`}
                      fill="none"
                      stroke={
                        shared.has(edge.server_id) ? "rgb(245 158 11)" : "rgb(14 165 233)"
                      }
                      strokeWidth={isDim ? 0.4 : 0.7}
                      vectorEffect="non-scaling-stroke"
                      strokeOpacity={isDim ? 0.15 : 0.75}
                      className="transition-[stroke-opacity,stroke-width] duration-150"
                    />
                  );
                })}
              </svg>
            </div>

            {/* Servers column */}
            <div className="w-56 shrink-0">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Servers
              </h2>
              <div style={{ paddingTop: PAD - 12 }}>
                {data?.servers.map((server) => (
                  <div
                    key={server.id}
                    style={{ height: ROW }}
                    className="flex items-center"
                    onMouseEnter={() => setHover(server.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <button
                      type="button"
                      onClick={() => openServer(server.id)}
                      data-testid={`map-server-${slugify(server.name)}`}
                      title={`${server.name} — ${server.meta}`}
                      className={cn(
                        "flex max-w-full items-center gap-1.5 truncate rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-[opacity,border-color,background-color] duration-150",
                        dim(server.id)
                          ? "border-border bg-card text-muted-foreground opacity-40"
                          : shared.has(server.id)
                            ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                            : "border-border bg-card text-foreground",
                      )}
                    >
                      {shared.has(server.id) && (
                        <Share2 className="h-3 w-3 shrink-0" aria-label="Shared server" />
                      )}
                      {server.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Shared-server breakdown */}
      {shared.size > 0 && (
        <>
          <h2 className="mt-8 font-heading text-sm font-semibold text-foreground">
            Shared servers
          </h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="shared-servers">
            {data?.servers
              .filter((server) => shared.has(server.id))
              .map((server) => {
                const apps = (data?.edges ?? [])
                  .filter((edge) => edge.server_id === server.id)
                  .map((edge) => data?.applications.find((a) => a.id === edge.application_id))
                  .filter((a): a is NonNullable<typeof a> => Boolean(a));
                return (
                  <Card
                    key={server.id}
                    data-testid={`shared-server-card-${slugify(server.name)}`}
                    className="p-4"
                  >
                    <button
                      type="button"
                      onClick={() => openServer(server.id)}
                      className="font-mono text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300"
                    >
                      {server.name}
                    </button>
                    <p className="text-[11px] text-muted-foreground">{server.meta}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {apps.map((app) => (
                        <Badge key={app.id} variant="outline" className="text-[11px]">
                          {app.name}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                );
              })}
          </div>
        </>
      )}

      <ServerDrawer />
      <PicDrawer />
    </div>
  );
}
