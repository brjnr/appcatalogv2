// Hand-written mirrors of the backend Pydantic models (backend/models/) — keep in sync.
export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  category_id: string;
  category_name: string;
  environment: string;
  status: string;
  url: string;
  icon: string;
  usage_count: number;
  favorite_count: number;
  created_at: string;
  updated_at: string;
}

export interface AppCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  icon_url: string | null;
  status: string; // "active" | "inactive"
  created_at: string;
  updated_at: string;
}

export type Role = "administrator" | "normal_user";

// Mirror of backend UserOut — also used for the /auth/me session payload and user lists.
export interface SessionUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  assigned_category_ids: string[];
  department_id: string;
  department_name: string;
  is_active: boolean;
}

export const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  normal_user: "Normal User",
};

export const ENVIRONMENTS = [
  "Production",
  "Staging",
  "Internal",
  "Cloud",
  "On-Premises",
] as const;

export const STATUSES = ["Active", "Maintenance", "Deprecated"] as const;

export const CATEGORY_STATUSES = ["active", "inactive"] as const;

export type LayoutId = "grid" | "list" | "alphabetical" | "category" | "compact";

export type SortId =
  | "name_asc"
  | "name_desc"
  | "most_favorite"
  | "recently_added"
  | "recently_updated";

export const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: "name_asc", label: "Name: A → Z" },
  { id: "name_desc", label: "Name: Z → A" },
  { id: "most_favorite", label: "Most Favorite" },
  { id: "recently_added", label: "Recently Added" },
  { id: "recently_updated", label: "Recently Updated" },
];

export const SORT_LABELS: Record<string, string> = Object.fromEntries(
  SORT_OPTIONS.map((o) => [o.id, o.label]),
);

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Shared card interactions across all catalog layouts.
export interface CardActions {
  onOpenDetail: (app: CatalogApp) => void;
  onLaunch: (app: CatalogApp) => void;
  onToggleFavorite: (app: CatalogApp) => void;
  isFavorite: (appId: string) => boolean;
}

// ---------------------------------------------------- servers & PICs (models/infra.py)

/** Lightweight cross-entity reference that makes servers/PICs/apps clickable. */
export interface RefSummary {
  id: string;
  name: string;
  initials?: string | null;
}

export interface StandbyEntry {
  date: string; // YYYY-MM-DD
  application_id: string;
  notes: string;
}

export interface StandbyEntryOut extends StandbyEntry {
  application_name: string;
}

/** Jira ticket ever raised against a server. */
export interface ServerTicket {
  id: string;
  jira_id: string;
  url: string;
  summary: string;
  executed_by: string;
  status: string;
  requested_on: string;
  created_at: string;
  updated_at: string;
}

export const TICKET_STATUSES = ["Open", "In Progress", "Done", "Cancelled"] as const;

export interface Server {
  id: string;
  name: string;
  hostname: string;
  ip_address: string;
  vm_name: string;
  os: string;
  os_version: string;
  server_type: string;
  environment: string;
  location: string;
  status: string;
  cpu: string;
  ram: string;
  storage: string;
  datacenter: string;
  cluster: string;
  virtualization: string;
  description: string;
  date_created: string;
  date_decommissioned: string;
  decommission_notes: string;
  application_ids: string[];
  pic_ids: string[];
  tickets: ServerTicket[];
  created_at: string;
  updated_at: string;
  applications: RefSummary[];
  pics: RefSummary[];
}

export interface Pic {
  id: string;
  name: string;
  initials: string;
  employee_id: string;
  email: string;
  phone: string;
  department_id: string;
  department: string;
  position: string;
  status: string;
  application_ids: string[];
  standby_schedule: StandbyEntry[];
  created_at: string;
  updated_at: string;
  applications: RefSummary[];
  servers: RefSummary[];
  standby_schedule_out: StandbyEntryOut[];
}

export const SERVER_ENVIRONMENTS = [
  "Production",
  "Staging",
  "Development",
  "DR",
  "Internal",
] as const;

export const SERVER_STATUSES = ["Active", "Maintenance", "Decommissioned"] as const;

/** Site role of a server: primary DC, disaster-recovery centre, cloud, or co-location. */
export const SERVER_LOCATIONS = ["DC", "DRC", "Cloud", "Co-location"] as const;

export const LOCATION_LABELS: Record<string, string> = {
  DC: "DC — Data Center",
  DRC: "DRC — Disaster Recovery",
  Cloud: "Cloud",
  "Co-location": "Co-location",
};

// Aggregated standby roster (GET /api/standby)
export interface StandbyCalendarEntry {
  date: string;
  pic_id: string;
  pic_name: string;
  pic_initials: string;
  pic_department_id: string;
  pic_department: string;
  application_id: string;
  application_name: string;
  notes: string;
}

export interface StandbyCalendar {
  month: string;
  entries: StandbyCalendarEntry[];
}

// Departments (models/departments.py) — the PIC organisational unit used to group standby
export interface Department {
  id: string;
  name: string;
  description: string;
  status: string; // "active" | "inactive"
  created_at: string;
  updated_at: string;
  pic_count: number;
}

export const DEPARTMENT_STATUSES = ["active", "inactive"] as const;

// GET /api/standby/upcoming — who is on standby today and over the next days
export interface StandbyUpcoming {
  today: string;
  days: number;
  entries: StandbyCalendarEntry[];
}

// ------------------------------------------------------- notes / memos (models/notes.py)
export type NoteLinkKind = "application" | "server" | "pic";

export interface NoteLink {
  kind: NoteLinkKind;
  id: string;
}

export interface NoteLinkOut extends NoteLink {
  name: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  department_ids: string[];
  department_names: string[];
  pinned: boolean;
  note_date: string;
  expires_at: string;
  status: string; // "active" | "trashed"
  trashed_at: string | null;
  links: NoteLink[];
  created_at: string;
  updated_at: string;
  links_out: NoteLinkOut[];
  days_left: number;
  purge_on: string | null;
  can_edit: boolean;
}

// GET /api/notes/alerts — navbar badge for notes about an app/server expiring soon
export interface NoteAlert {
  id: string;
  title: string;
  expires_at: string;
  days_left: number;
  pinned: boolean;
  targets: string[];
}

export interface NoteAlerts {
  within_days: number;
  count: number;
  items: NoteAlert[];
}

export const NOTE_SORTS: { id: string; label: string }[] = [
  { id: "newest", label: "Date: newest first" },
  { id: "oldest", label: "Date: oldest first" },
  { id: "expiring", label: "Expiring soonest" },
  { id: "recently_updated", label: "Recently updated" },
  { id: "title", label: "Title: A → Z" },
];

// POST /api/standby/rotate
export interface StandbyRotateResult {
  month: string;
  department_name: string;
  pics_used: number;
  created: number;
  skipped: number;
  entries: StandbyCalendarEntry[];
}

/** Ready-made memo formats. */
export const NOTE_TEMPLATES: { id: string; label: string; title: string; body: string }[] = [
  {
    id: "incident",
    label: "Incident",
    title: "Incident \u2014 ",
    body: "Impact:\nStarted:\nDetected by:\nCurrent status:\nWorkaround:\nNext update:",
  },
  {
    id: "patching",
    label: "Patching",
    title: "Patching \u2014 ",
    body: "Target:\nPatch/version:\nWindow:\nReboot required:\nRollback plan:\nVerification:",
  },
  {
    id: "maintenance",
    label: "Maintenance window",
    title: "Maintenance window \u2014 ",
    body: "Systems affected:\nWindow:\nExpected downtime:\nExecuted by:\nChange/Jira ticket:\nCommunication sent:",
  },
];

export const NOTE_LINK_KINDS: { id: NoteLinkKind; label: string }[] = [
  { id: "application", label: "Application" },
  { id: "server", label: "Server" },
  { id: "pic", label: "PIC" },
];

// Application <-> server graph (GET /api/dependency-map)
export interface MapNode {
  id: string;
  name: string;
  kind: string;
  meta: string;
  location: string;
}

export interface DependencyMapData {
  applications: MapNode[];
  servers: MapNode[];
  edges: { application_id: string; server_id: string }[];
  shared_server_ids: string[];
}

export const PIC_STATUSES = ["Active", "Inactive"] as const;
