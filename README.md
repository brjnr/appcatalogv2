# AppCatalog v1.0

An internal IT portal: a searchable **application catalog** plus the infrastructure
around it — servers, PICs (person-in-charge), departments, standby/on-call calendar,
handover notes, Jira tickets, import/export and third-party integrations, all behind
role-based login (administrator / normal user).

**Stack:** FastAPI + MongoDB (backend) · React 19 + Vite + TypeScript + Tailwind v4 +
shadcn/ui (frontend) · cookie-based sessions.

---

## 1. Repository layout

```
/
├── backend/      FastAPI app: server.py, routers/, models/, lib/, tests/, seed.py
├── frontend/     Vite + React + TypeScript app: src/pages, src/components, src/lib
├── tests/        cross-cutting tests: e2e/ (Playwright), integration/ (API regression)
├── deploy/       docker-compose.yml, Dockerfiles, nginx configs, .env.example
├── docs/         STRUCTURE.md, SPEC.md, auth-testing.md, design_guidelines.json, TEMPLATE.md
├── scripts/      seed-db.sh, backup-db.sh, restore-db.sh, check.sh
├── README.md
└── .gitignore
```

Backend code and backend config live **only** in `backend/`; frontend code and
frontend config **only** in `frontend/`. Generated output (`dist/`, `test_reports/`,
`test_result.md`), runtime data (`backend/uploads/`) and agent metadata (`memory/`)
are git-ignored and never committed.

Read **[`docs/STRUCTURE.md`](docs/STRUCTURE.md)** for the full map, the monorepo
status (there is no workspace root — each package installs in its own directory),
and a "where to look when X breaks" table.

Feature areas, all mounted under `/api`: `auth`, `apps`, `categories`, `servers`,
`pics`, `departments`, `notes`, `users`, `integrations`, `import_export`.

---

## 2. Deploy with Docker (easiest — app + database in one command)

You need Docker with the Compose plugin. Nothing else (no Python, Node or Mongo on the
host).

```bash
git clone <your-repo-url> appcatalog
cd appcatalog/deploy

# 1) create your environment file
cp .env.example .env

# 2) generate the two secrets and paste them into .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"                                # SECRET_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # INTEGRATIONS_KEY

# 3) edit .env: set PUBLIC_HOST/TRUSTED_HOSTS to the hostname users will type

# 4) start everything (MongoDB + backend + frontend behind nginx)
docker compose up -d --build

# 5) load the starter data + demo accounts (run once)
docker compose exec backend python seed.py
```

Open `http://<PUBLIC_HOST>` and log in with the seeded administrator
(`admin@corp.com` — password printed at the top of `backend/seed.py`).
**Change that password immediately after the first login.**

Useful commands:

```bash
docker compose ps                  # health of the three services
docker compose logs -f backend     # backend logs
docker compose restart backend     # after editing deploy/.env
docker compose down                # stop (data survives in the mongo volume)
docker compose down -v             # stop AND delete the database volume
```

### Putting it behind HTTPS

Terminate TLS on whatever you already use (Cloudflare, an nginx/Traefik in front, a
load balancer) and forward to port `80` of the `web` container. Keep
`SESSION_COOKIE_SECURE=1` and set `TRUSTED_HOSTS` to your real hostname. If you serve
the app over plain HTTP (lab only), set `SESSION_COOKIE_SECURE=0` — otherwise the
browser drops the session cookie and login appears to "do nothing".

---

## 3. Deploy manually on a Linux VM (no Docker)

Requirements: Python 3.11+, Node 20+ with Yarn, MongoDB 7, nginx.

**a. Database**

```bash
sudo apt-get install -y mongodb-org            # or use MongoDB Atlas instead
sudo systemctl enable --now mongod
```

The app creates its database and indexes on first run. The database name comes from
`DB_NAME` (production default `appcatalog_prod`). Nothing else to prepare.

**b. Backend**

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env         # then edit it — see the table in §5
python seed.py               # once, to load starter data + accounts

uvicorn server:app --host 127.0.0.1 --port 8001
```

`/etc/systemd/system/appcatalog-api.service`:

```ini
[Unit]
Description=AppCatalog API
After=network.target mongod.service

[Service]
WorkingDirectory=/opt/appcatalog/backend
ExecStart=/opt/appcatalog/backend/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

**c. Frontend**

```bash
cd frontend
yarn install --frozen-lockfile
yarn build          # outputs static files to frontend/dist
```

**d. nginx — serve the static files and proxy `/api`**

The frontend always calls **relative** `/api/...`, so both must sit on one origin.
Copy the ready-made site file `deploy/nginx.conf`, adjust `server_name` and `root`:

```nginx
server {
  listen 80;
  server_name apps.example.com;
  root /opt/appcatalog/frontend/dist;

  location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 5m;
  }

  location / {
    try_files $uri /index.html;   # SPA routing
  }
}
```

---

## 4. Local development

```bash
# terminal 1 — backend (needs a local mongod)
cd backend && uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# terminal 2 — frontend (Vite proxies /api → :8001)
cd frontend && yarn dev            # http://localhost:3000
```

Checks — all of them at once with `scripts/check.sh`, or individually:

```bash
cd backend  && python -m pytest    # backend suite (hits the running :8001)
cd frontend && yarn typecheck      # tsc -b, strict
cd frontend && yarn lint           # oxlint
cd tests    && npx playwright test # browser e2e (needs both servers up)
```

---

## 5. Configuration (`backend/.env`)

| Variable | Required | Meaning |
|---|---|---|
| `MONGO_URL` | yes | Mongo connection string, e.g. `mongodb://localhost:27017` or an Atlas SRV URI |
| `DB_NAME` | yes | Database name — production default `appcatalog_prod` |
| `SECRET_KEY` | yes in prod | Random 32+ byte string; signs sessions |
| `INTEGRATIONS_KEY` | yes in prod | Fernet key encrypting integration secrets. If empty, a key is derived from `SECRET_KEY` (dev only) |
| `CORS_ORIGINS` | no | Comma-separated exact origins. Leave **empty** for the single-origin nginx setup above |
| `TRUSTED_HOSTS` | recommended | Comma-separated allowed `Host` headers, e.g. `apps.example.com`. `*` is dev-only |
| `SESSION_COOKIE_SECURE` | yes | `1` behind HTTPS, `0` for plain-HTTP labs |
| `SESSION_COOKIE_SAMESITE` | no | `lax` (default) |
| `MAX_REQUEST_BYTES` | no | Upload/body cap, default `3145728` (3 MB) |
| `LOG_LEVEL` | no | `INFO` by default |

`backend/.env.example` is the annotated template; `deploy/.env.example` is the same
set for the Compose stack. Never commit a real `.env`.

---

## 6. Database operations

```bash
scripts/seed-db.sh                     # starter data + demo accounts (destructive reset)
scripts/backup-db.sh [out-dir]         # mongodump + uploaded icons -> backups/<date>
scripts/restore-db.sh <backup-dir>     # restore both, renaming into the current DB_NAME
```

Raw equivalents if you prefer:

```bash
mongodump   --uri "$MONGO_URL" --db appcatalog_prod --gzip --archive=db.gz
mongorestore --uri "$MONGO_URL" --gzip --archive=db.gz \
  --nsFrom 'appcatalog_prod.*' --nsTo 'appcatalog_prod.*'
```

Indexes are (re)applied on every startup and by `seed.py`. Category icons uploaded in
the UI are files on disk under `backend/uploads/` — `scripts/backup-db.sh` includes
them; the Compose stack keeps them in a named volume.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Login returns 200 but you stay logged out | `SESSION_COOKIE_SECURE=1` while serving over HTTP → set it to `0` or add TLS |
| 400 "Invalid host header" | Add your hostname to `TRUSTED_HOSTS` and restart the backend |
| Frontend loads, every API call 404 | `/api` is not proxied to port 8001 — check the nginx `location /api/` block |
| `413` on an icon upload | Raise `MAX_REQUEST_BYTES` **and** nginx `client_max_body_size` |
| Log warns about a derived integrations key | Set a real `INTEGRATIONS_KEY` |
| Blank page on a deep link like `/admin` | SPA fallback missing — `try_files $uri /index.html` |

A fuller "which file owns this symptom" table is in
[`docs/STRUCTURE.md`](docs/STRUCTURE.md).

Login accepts **either** the e-mail or the username in the same field. Password
policy: 13+ characters with an uppercase letter, a lowercase letter and a symbol.
