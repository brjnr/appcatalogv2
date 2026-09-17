# Enterprise Application Catalog + RBAC — Living Spec

## What it is
A centralized portal where employees find and open enterprise applications, with
role-based access control: normal users see only the app categories assigned to them,
administrators manage everything.

## Stack
- Backend: FastAPI. `backend/server.py` mounts routers on `api_router` (/api) and serves uploaded
  category icons from `/api/uploads` (StaticFiles over `backend/uploads/`).
  Routers: `routers/auth.py`, `routers/users.py`, `routers/categories.py`, `routers/apps.py`.
  Models: `models/users.py`, `models/categories.py`, `models/catalog.py`. Auth helpers: `lib/auth.py`.
- Frontend: React 19 + Vite + Tailwind v4 + shadcn (base-nova/base-ui). Fonts: Space Grotesk
  (headings), DM Sans (body), JetBrains Mono. Light default + dark toggle (next-themes).
- Mongo collections: `users`, `sessions`, `categories`, `apps`.

## Auth model
- Login sets an **httpOnly cookie** (`catalog_session`, 7-day TTL) backed by the `sessions`
  collection (TTL index on `expires_at`). Passwords hashed with passlib pbkdf2_sha256.
- `GET /api/auth/me` returns the user or **null with 200** when logged out (so the SPA redirects
  instead of erroring). `POST /api/auth/logout` clears the cookie + session row.
- Frontend routes through `lib/session.ts`: `beginSession()` after login, `endSession()` on sign-out.

## Roles
- `administrator` — unrestricted. Full CRUD on users/categories/apps, sees all applications.
- `normal_user` — sees only apps whose `category_id` is in `assigned_category_ids`.

## Backend enforcement (not just hidden UI)
- `require_user` (401 when no valid session), `require_admin` (403 for non-admins).
- `GET /api/apps` injects `category_id: {$in: allowed}` for normal users.
- `GET /api/apps/{id}`, `POST /apps/{id}/launch`, `POST /apps/{id}/favorite` → **403** if the app's
  category is not assigned. Typing an app URL directly does not bypass this.
- All mutations on `/apps`, `/users`, `/categories` are admin-only.
- Deactivated users (`is_active: false`) have their sessions rejected on the next request.
- Guards: cannot remove/deactivate the last administrator; cannot delete your own account;
  cannot delete a category that still has applications (409).

## Data model
- `AppCategory`: id, name (unique), description, icon (lucide name), icon_url (uploaded image or
  null), status (active|inactive), created_at, updated_at.
- `CatalogApp`: id, name, description, **category_id** (+ `category_name` resolved on read),
  environment, status, url, icon, usage_count, favorite_count, created_at, updated_at.
- `UserOut`: id, name, email, role, assigned_category_ids[], is_active. Password hash never leaves
  the backend.
- `Server` (`models/infra.py`): id, name, hostname, ip_address, vm_name, os, os_version,
  server_type, environment (Production|Staging|Development|DR|Internal), status
  (Active|Maintenance|Decommissioned), cpu, ram, storage, datacenter, cluster, virtualization,
  description, **application_ids[]**, **pic_ids[]**. `ServerOut` adds resolved `applications[]`
  and `pics[]` (RefSummary with initials) so the UI can link straight through.
- `Pic`: id, name, **initials** (manual, uppercase, 1–3 alphanumeric), employee_id, email, phone,
  department, position, status (Active|Inactive), application_ids[],
  standby_schedule[{date, application_id, notes}]. `PicOut` adds `applications[]`, `servers[]`, and
  `standby_schedule_out[]` (each row carries `application_name`).

## Application ↔ Server ↔ PIC relationships
- Application↔Server is **many-to-many** via `servers.application_ids`.
- Server↔PIC is stored **only** on `servers.pic_ids` (single source of truth). Editing a PIC's
  `server_ids` mirrors onto servers; deleting a PIC pulls its id from every server.
- PIC↔Application is stored on `pics.application_ids`.

## Servers & PIC API (all admin-only for writes)
- `GET /api/servers` (filters: `q`, `application_id`) · `GET /api/servers/{id}` ·
  POST/PUT/DELETE `/api/servers`. Registration requires only `name` — apps and PICs link later.
- `GET /api/pics` (filters: `q`, `application_id`) · `GET /api/pics/{id}` ·
  POST/PUT/DELETE `/api/pics`. Registration requires only `name` + `initials`.
- Visibility (`lib/visibility.py`): a normal user sees a **server** if it serves at least one app in
  their assigned categories, and a **PIC** if that PIC owns a visible app or a visible server.
  Unauthorized detail requests return **403**. Admins see everything.
- `POST /api/users/bulk-assign-category` — `{category_id, user_ids[], assign}` assigns/removes one
  category across many users in one request; administrators in the list are skipped.

## Category icons
`POST /api/categories/{id}/icon` (multipart, PNG/JPEG/WebP/SVG, ≤2 MB) → saves to
`backend/uploads/{id}.{ext}` and sets `icon_url`. `DELETE .../icon` removes it and falls back to the
lucide glyph. `CategoryIcon` renders uploaded images with `object-contain` (scaled proportionally,
never cropped/stretched); the upload dialog warns on non-square images and shows pixel dimensions.

## Frontend routes
- `/login` — sign in (demo accounts listed on the page).
- `/` — catalog: navbar (search, favorites, layout selector, theme, admin link, profile menu),
  hero search + dynamic category pills, toolbar (count, environment/status/sort), 5 layouts
  (grid, list, alphabetical + A–Z jump bar, category, compact). Layout/sort/favorites persist in
  localStorage (`catalog.layout`, `catalog.sort`, `catalog.favorites`).
- `/app/:id` — detail: purpose, badges, stats, Open Application (new tab + launch counter),
  favorite, admin-only Edit/Delete, related apps, plus an **Application Servers** section (clickable
  server chips) and a **Person in Charge** section (clickable `[JS] Jane Smith` badges).
  Shows an **Access denied** state on 403.
- Server/PIC details open as **deep-linkable side drawers** driven by `?server=<id>` / `?pic=<id>`
  (`lib/infraNav.tsx` → `InfraNavProvider` + `useInfraNav`). Navigation chains both ways:
  App → Server → Server PIC → PIC, and App → PIC → Assigned Server → Server.
- `/admin` (administrator only, guarded in `AdminLayout`): `index` Dashboard, `users`, `roles`,
  `categories`, `applications`, `servers`, `pics` (PIC Management), `access` (bulk assignment panel
  + user × category matrix).

## Seed data (`cd /app/backend && python seed.py`)
8 categories, 3 users (admin→Infrastructure, john.doe→Security, maria.garcia→Business
Applications), 36 applications, 14 servers, 6 PICs, 5 departments (PICs linked by
`department_id`), 11 DC + 3 DRC servers. Idempotent (clears
sessions/users/categories/apps/servers/pics first). `STG-TEST-01` is intentionally left with no
application and no PIC to exercise standalone registration. Credentials in
`memory/test_credentials.md`.

## Standby calendar, infra search, dependency map, server location
- `Server.location`: `Literal["DC","DRC","Cloud","Co-location"]` (default `DC`) — editable in the
  admin server form, shown as a chip + "Site Role" line in `ServerDrawer`, and searchable.
- `GET /api/standby?month=YYYY-MM` — all PIC on-call shifts for a month
  (`{month, entries:[{date, pic_id, pic_name, pic_initials, application_id, application_name, notes}]}`).
  Scoped for normal users (only shifts on apps they may access). Page: `/standby` (any logged-in user),
  month grid + agenda, PIC badges open `PicDrawer`.
- `GET /api/dependency-map` — `{applications[], servers[], edges[], shared_server_ids[]}`; servers used
  by >1 app are flagged shared. Page: `/admin/dependency-map` (admin), numeric-viewBox SVG connectors
  (never percentages in `path d`).
- Main catalog search also queries infra: `InfraSearchResults` lists matching servers (name/hostname/
  IP/location) and PICs (name/initials) and opens the corresponding drawer.

## Departments (managed entity)
- `models/departments.py` + `routers/departments.py`: `Department` (id, name unique, description,
  status active|inactive) with `DepartmentOut.pic_count`. `GET /api/departments[?include_inactive]`
  for any signed-in user; POST/PUT/DELETE admin-only. Rename cascades onto `pics.department`;
  deleting a department with PICs returns **409**.
- `Pic.department_id` → departments.id, with the department **name** denormalised on `pic.department`
  (backend keeps it in sync). The PIC form picks the department from a dropdown.
- Admin page `/admin/departments` (menu "Departments"). Clicking a department name opens a
  **detail dialog**: description, status, PIC list (badges open the `PicDrawer`) and the portal users
  who may edit that department's notes.

## Standby editing, grouping, and upcoming view
- `GET /api/standby?month=YYYY-MM` entries now carry `pic_department_id` + `pic_department`.
- `GET /api/standby/upcoming?days=N` — today + next days (server-anchored `today`).
- Admin-only mutations: `POST /api/standby` (409 on duplicate PIC+app+date),
  `PATCH /api/standby/move` (`{pic_id, application_id, from_date, to_date}`), and
  `DELETE /api/standby?pic_id=&date=&application_id=`.
- `/standby` page: department filter chips with counts, a Today/Tomorrow/+2 panel where clicking a
  department chip reveals the PICs covering it that day, HTML5 **drag a shift to another day** to
  reschedule (admins), a per-day `+` to add a shift, and an `x` to remove one.
- The department filter is a **searchable dropdown** (`SearchSelect`) with per-department shift
  counts; while a department is selected the month cells show the **PIC on standby** instead of the
  application name.
- **Rotation**: `POST /api/standby/rotate` `{department_id, month, application_id?,
  replace_existing, include_weekends}` round-robins the department's active PICs across the month
  (each PIC's first assigned application by default) → "Auto-fill month" button on `/standby`.

## Notes & memos (`/notes`)
- `models/notes.py` + `routers/notes.py`. `Note`: title, body, author_id/author_name (from the
  session), `note_date`, `expires_at` (default note_date + 7 days), `status` active|trashed,
  `trashed_at`, `links[]` (many; each `{kind: application|server|pic, id}`). `NoteOut` adds
  `links_out` (resolved names), `days_left`, `purge_on`, `can_edit`.
- Every signed-in user reads all notes; **only the author or an administrator** may edit/delete
  (403 otherwise). `GET /api/notes?view=active|trash&q=` runs the sweep first: expired notes →
  Trash, Trash older than 7 days → purged. `POST /notes/{id}/restore` pulls one back (pushing a
  lapsed retention date forward); `DELETE /notes/{id}[?permanent=true]` trashes then purges.
- **Sharing/editing by department(s)**: `Note.department_ids[]` — empty = everyone, otherwise only
  those departments + admins can see it; the author, any member of those departments, **and admins**
  can edit (`NoteOut.department_names[]` resolved for display)
  (`_can_edit` / `_visibility_filter` in routers/notes.py). Users carry `department_id`
  (`UserOut.department_name` resolved) set in the admin user form.
- **Pinning**: `Note.pinned` + `PATCH /api/notes/{id}/pin`; pinned notes always sort first.
- **Sorting**: `GET /api/notes?sort=newest|oldest|expiring|recently_updated|title` (+ `department_id`
  filter, `q` search); 422 on an unknown sort.
- **Alerts**: `GET /api/notes/alerts?within_days=2` → notes linked to an application/server expiring
  soon; drives the amber badge on the navbar Notes icon (`notes-alert-badge`).
- "Share with" is a **searchable multi-select dropdown** (`MultiSearchSelect` in
  `components/catalog/SearchSelect.tsx`) — empty selection = Everyone.
- **Templates**: `NOTE_TEMPLATES` (Incident / Patching / Maintenance window) prefill the form.
- Page: Active / Deleted tabs, searchable department filter + sort dropdowns
  (`components/catalog/SearchSelect.tsx`), cards click through to a **detail popup**
  (`NoteDetailDialog`) with pin / edit / delete and clickable linked items.

## Server Jira tickets
- `ServerTicket` on `Server.tickets[]`: jira_id, url, summary, executed_by, status
  (Open/In Progress/Done/Cancelled), requested_on. Admin-only
  `POST/PUT/DELETE /api/servers/{id}/tickets[/{ticket_id}]` all return the updated `ServerOut`.
- Rendered as a **Jira tickets** section in `ServerDrawer` (external links + admin add/edit/delete).

## Table ergonomics (Servers, PIC Management)
- Both admin tables have click-to-sort headers on every column (`server-sort-*` / `pic-sort-*`) and
  searchable value filters: servers → OS / environment / status (+ the DC/DRC site chips);
  PICs → department / position / status, with a "N of M shown" counter.
- Servers table columns: Server, OS (+version), Type, Environment, Site, Cluster, Applications, PIC,
  Tickets, Status. PIC table: PIC, Department, Position, Contact, Applications, Servers, Standby,
  Status.

## Everything-search on the home page
`InfraSearchResults` queries `/servers?q=`, `/pics?q=` and `/notes?q=` — all three are role-scoped by
the backend, so a normal user only matches infrastructure attached to their assigned categories and
notes shared with them. Note hits open the note detail popup.

## Launch statistics
Application launch/usage statistics were **removed from the UI** (hero stats now show Total apps /
Active services / Favorited / Categories; no "Most Used" sort, no launch columns or counters). The
`usage_count` field and `POST /apps/{id}/launch` counter still exist server-side.

## Site (location) filters
- Admin Servers list and `/admin/dependency-map` both have DC/DRC/Cloud/Co-location filter chips
  with counts; the dashboard has a **Site coverage** card. `MapNode.location` carries the site.

## Notes
- base-ui gotchas hit here: `Menu.Item` fires **onClick** (not `onSelect`), and
  `DropdownMenuLabel` (GroupLabel) requires `Menu.Group` context — use a plain div instead.
- Session cookies are bound to the origin: browser tests must use the preview URL, not localhost.
