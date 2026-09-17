# Repository structure

One repository, four source trees, everything else is either documentation or
generated. Nothing in the tree is a copy of anything else.

```
/
├── backend/          FastAPI application (the only Python app code)
│   ├── server.py         entrypoint: middleware stack + router wiring under /api
│   ├── routers/          one module per resource (apps, servers, notes, …)
│   ├── models/           Pydantic request/response models
│   ├── lib/              db handle, auth/session, crypto, visibility rules, dates
│   ├── tests/            pytest suite that owns backend behaviour (hits :8001)
│   ├── seed.py           starter data + demo accounts  (scripts/seed-db.sh wraps it)
│   ├── requirements.txt  backend deps           pytest.ini  backend test config
│   ├── .env.example      backend configuration template
│   └── uploads/          RUNTIME: uploaded category icons (git-ignored)
│
├── frontend/         Vite + React 19 + TS app (the only JS/TS app code)
│   ├── src/pages/        screens; src/pages/admin/ holds the admin area
│   ├── src/components/   feature components + components/ui (shadcn)
│   ├── src/lib/api.ts    typed fetch layer, always relative to /api
│   ├── package.json, yarn.lock, vite.config.ts, tsconfig*.json, components.json
│   └── dist/             BUILD OUTPUT (git-ignored)
│
├── tests/            cross-cutting tests that belong to neither tree
│   ├── e2e/              Playwright specs (browser, full stack)
│   ├── integration/      Python API regression against a deployed/preview URL
│   ├── fixtures/         shared Playwright helpers
│   └── playwright.config.ts, package.json   (own package: @playwright/test only)
│
├── deploy/           how it runs in production: docker-compose.yml, Dockerfiles,
│                     nginx configs, .env.example for the Compose stack
├── docs/             this file, SPEC.md, auth-testing.md, design_guidelines.json,
│                     TEMPLATE.md (starter/platform conventions)
├── scripts/          seed-db.sh, backup-db.sh, restore-db.sh, check.sh
├── README.md         what the app is + how to deploy it
└── .gitignore        tracked = source & config; ignored = generated & runtime
```

## Not in the repository (on purpose)

| Path | Why |
|---|---|
| `memory/` | Product/AI agent metadata (PRD, credentials) read from `/app/memory` by the platform. Local-only, git-ignored. |
| `test_reports/`, `test_result.md` | Generated agent/test output at the paths the platform writes to. Local-only, git-ignored. |
| `backend/uploads/` | User-uploaded icons — runtime data, backed up by `scripts/backup-db.sh`. |
| `node_modules/`, `dist/`, `__pycache__/` | Build/dependency artifacts. |
| `yarn.lock` (root) | Pod-local stub. The repo is **not** a yarn workspace: `frontend/` and `tests/` each own their `package.json` + lockfile. |
| `backend-starter-backup/`, `frontend-starter-backup/` | Deleted June 2026 — dead starter scaffolding (old CRA stack), fully superseded by `frontend/`. Ignored so they cannot creep back. |

## Monorepo status

Two independent Node packages (`frontend/`, `tests/`) and one Python package
(`backend/`). There is no workspace root, no root `package.json`, and no tool
that spans the packages — so install/build/test commands are always run **inside**
the relevant directory. Do not add a root `package.json` unless you intentionally
adopt yarn workspaces.

## Where to look when something breaks

| Symptom | Start here |
|---|---|
| API 500 / backend won't boot | `/var/log/supervisor/backend.err.log`, then `backend/server.py` (middleware order, env loading) |
| API 401/403 where you expect data | `backend/lib/auth.py` (sessions) and `backend/lib/visibility.py` (role/category scoping) |
| A route 404s | it must hang off `api_router` in `backend/server.py`; never off `app` |
| Frontend blank page on a deep link | missing `<Route>` in `frontend/src/App.tsx`, or no SPA fallback in nginx |
| Every frontend request 404s | `/api` proxy: `frontend/vite.config.ts` in dev, `deploy/nginx*.conf` in prod |
| Field saves but never shows | Pydantic model in `backend/models/` and the mirrored TS interface changed out of sync |
| Data looks wrong/empty after deploy | `DB_NAME` in `backend/.env`; reseed with `scripts/seed-db.sh` |
| Login "does nothing" | `SESSION_COOKIE_SECURE=1` over plain HTTP — see README §7 |
| Deployment/config questions | `deploy/` + README §2–§5 |
| Auth behaviour expectations | `docs/auth-testing.md` |
