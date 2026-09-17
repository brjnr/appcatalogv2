import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { NoteAlerts } from "@/lib/types";
import { useTheme } from "next-themes";
import { Building2, CalendarDays, LayoutDashboard, Moon, NotebookPen, Plus, Search, ShieldCheck, Star, Sun } from "lucide-react";
import { endSession } from "@/lib/session";
import type { LayoutId, SessionUser } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LayoutSelector } from "./LayoutSelector";

interface AppNavbarProps {
  user?: SessionUser | null;
  search?: string;
  onSearchChange?: (value: string) => void;
  favoritesOnly?: boolean;
  onFavoritesToggle?: () => void;
  layout?: LayoutId;
  onLayoutChange?: (layout: LayoutId) => void;
  onAddApp?: () => void;
}

// Fixed top bar: logo + title, quick search, favorites toggle, layout selector,
// theme toggle, admin entry points, and the signed-in user's profile menu.
export function AppNavbar({
  user,
  search,
  onSearchChange,
  favoritesOnly,
  onFavoritesToggle,
  layout,
  onLayoutChange,
  onAddApp,
}: AppNavbarProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === "dark";
  const isAdmin = user?.role === "administrator";

  // Badge on the Notes entry point when a note about an app/server expires within 2 days.
  const { data: alerts } = useQuery({
    queryKey: ["note-alerts"],
    queryFn: () => apiGet<NoteAlerts>("/notes/alerts?within_days=2"),
    enabled: Boolean(user),
    refetchInterval: 120_000,
  });
  const alertCount = alerts?.count ?? 0;
  const initials =
    (user?.name ?? "")
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <header
      data-testid="app-navbar"
      className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0B0F17]/90"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <Link to="/" data-testid="app-logo-link" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-none">
            <span
              data-testid="app-title"
              className="font-heading text-[15px] font-semibold tracking-tight text-foreground"
            >
              Application Catalog
            </span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">
              Enterprise Portal
            </span>
          </span>
        </Link>

        {search !== undefined && onSearchChange !== undefined && (
          <div className="relative ml-3 hidden w-64 lg:block">
            <Search
              className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              data-testid="global-search-input"
              aria-label="Search catalog"
              placeholder="Search catalog…"
              className="h-9 pl-8"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          {onFavoritesToggle !== undefined && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onFavoritesToggle}
              data-testid="favorites-filter-toggle"
              title="Show favorites only"
              aria-label="Show favorites only"
              aria-pressed={favoritesOnly ?? false}
              className={cn(
                favoritesOnly
                  ? "bg-amber-100 text-amber-600 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Star className={cn("h-4 w-4", favoritesOnly && "fill-current")} aria-hidden="true" />
            </Button>
          )}

          {layout !== undefined && onLayoutChange !== undefined && (
            <div className="hidden lg:block">
              <LayoutSelector layout={layout} onChange={onLayoutChange} />
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            data-testid="theme-toggle-btn"
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Light theme" : "Dark theme"}
            className="text-muted-foreground hover:text-foreground"
          >
            {isDark ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>

          {user && (
            <Link
              to="/standby"
              data-testid="standby-calendar-link"
              aria-label="Standby calendar"
              title="Standby calendar"
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}

          {user && (
            <Link
              to="/notes"
              data-testid="notes-link"
              aria-label="Notes and memos"
              title={
                alertCount > 0
                  ? `${alertCount} note(s) about an app or server expiring soon`
                  : "Notes & memos"
              }
              className="relative hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
            >
              <NotebookPen className="h-4 w-4" aria-hidden="true" />
              {alertCount > 0 && (
                <span
                  data-testid="notes-alert-badge"
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white"
                >
                  {alertCount}
                </span>
              )}
            </Link>
          )}

          {isAdmin && (
            <Link
              to="/admin"
              data-testid="admin-console-link"
              aria-label="Admin console"
              title="Admin console"
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}

          {isAdmin && onAddApp !== undefined && (
            <Button
              size="sm"
              onClick={onAddApp}
              data-testid="admin-add-app-btn"
              className="hidden sm:inline-flex"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add App
            </Button>
          )}

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    data-testid="user-profile-menu"
                    aria-label="User profile"
                    title={`${user.name} — ${ROLE_LABELS[user.role]}`}
                    className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white ring-offset-2 transition-[box-shadow] hover:ring-2 hover:ring-sky-400 dark:bg-sky-600"
                  >
                    {initials}
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-60">
                <div className="px-2 py-1.5">
                  <span className="block text-sm font-semibold" data-testid="user-menu-name">
                    {user.name}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground" data-testid="user-menu-email">
                    {user.email}
                  </span>
                  <span
                    data-testid="user-menu-role"
                    className="mt-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300"
                  >
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/")} data-testid="user-menu-catalog">
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Catalog
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/standby")} data-testid="user-menu-standby">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" /> Standby calendar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/notes")} data-testid="user-menu-notes">
                  <NotebookPen className="h-4 w-4" aria-hidden="true" /> Notes & memos
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin")} data-testid="user-menu-admin">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Admin console
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => void endSession()}
                  data-testid="signout-item"
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
