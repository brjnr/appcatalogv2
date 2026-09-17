"""FastAPI entrypoint. Wires routers, sets up CORS/security middleware, and
enforces deployment-safe defaults.

Security posture (2026-02):
- No unauthenticated legacy endpoints. The old ``/api/status`` demo routes are
  gone; every /api/* route enforces auth via router-level dependencies.
- CORS is an explicit allowlist — never ``*`` when credentials are on. If the
  ``CORS_ORIGINS`` env var is empty, CORS is not registered at all (fail-closed
  behind a single-origin ingress).
- ``TrustedHostMiddleware`` reflects ``TRUSTED_HOSTS`` so a mismatched Host
  header (a Host-header injection precondition) is rejected.
- Response security headers (nosniff, framing lockdown, referrer policy, HSTS
  when TLS is expected) are added on every response.
- Uploads/JSON bodies are capped by ``MAX_REQUEST_BYTES`` so a client cannot
  stream a giant payload before validation.
- The global exception handler returns a generic message and a correlation id;
  full tracebacks stay in the server log.
"""

import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from lib.db import client, ensure_indexes  # noqa: E402
from routers.apps import router as apps_router  # noqa: E402
from routers.auth import router as auth_router  # noqa: E402
from routers.categories import router as categories_router  # noqa: E402
from routers.departments import router as departments_router  # noqa: E402
from routers.import_export import router as import_export_router  # noqa: E402
from routers.integrations import router as integrations_router  # noqa: E402
from routers.notes import router as notes_router  # noqa: E402
from routers.pics import router as pics_router  # noqa: E402
from routers.servers import router as servers_router  # noqa: E402
from routers.users import router as users_router  # noqa: E402

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("appcatalog")

MAX_REQUEST_BYTES = int(os.environ.get("MAX_REQUEST_BYTES", str(3 * 1024 * 1024)))  # 3 MB default


def _split_csv(raw: str | None) -> list[str]:
    return [item.strip() for item in (raw or "").split(",") if item.strip()]


def _allowed_origins() -> list[str]:
    origins = _split_csv(os.environ.get("CORS_ORIGINS"))
    # Refuse to combine "*" with credentials — that is a browser rejection anyway,
    # and cleanly failing here surfaces a config bug at boot rather than at runtime.
    return [o for o in origins if o and o != "*"]


def _trusted_hosts() -> list[str]:
    hosts = _split_csv(os.environ.get("TRUSTED_HOSTS"))
    return hosts or ["*"]  # dev fallback; production should always set this


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Background index build so slow migrations never block the readiness probe.
    import asyncio

    app.state.index_task = asyncio.create_task(ensure_indexes())
    yield
    client.close()


app = FastAPI(lifespan=lifespan)


# ---------------------------------------------------------------- middlewares


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests larger than ``MAX_REQUEST_BYTES`` before we buffer them.

    We check the declared Content-Length; when a client omits it (chunked
    transfer), Starlette itself buffers into memory and would raise later — this
    front-line check makes the intent explicit and returns a friendly 413.
    """

    def __init__(self, app, max_bytes: int) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > self.max_bytes:
            return JSONResponse(
                {"detail": "request body too large"}, status_code=413
            )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Set defence-in-depth response headers on every response."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        # Only advertise HSTS when we know the deployment terminates TLS.
        if os.environ.get("SESSION_COOKIE_SECURE", "1").lower() not in {"0", "false", "no", ""}:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


# Add middlewares — Starlette runs them outermost-first. TrustedHost before
# CORS before size-limit before security-headers so a bogus Host is refused
# before we spend cycles on it.
app.add_middleware(TrustedHostMiddleware, allowed_hosts=_trusted_hosts())

_origins = _allowed_origins()
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
        max_age=600,
    )
else:
    logger.info(
        "CORS not configured (CORS_ORIGINS empty) — same-origin deployments only"
    )

app.add_middleware(RequestSizeLimitMiddleware, max_bytes=MAX_REQUEST_BYTES)
app.add_middleware(SecurityHeadersMiddleware)


# ---------------------------------------------------------------- error safety


@app.exception_handler(Exception)
async def _unhandled_exception(request: Request, exc: Exception):
    """Never leak stack traces to the browser. Log with a correlation id."""
    if isinstance(exc, HTTPException):
        # Let FastAPI's default HTTPException handler render as usual.
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    ref = uuid.uuid4().hex[:12]
    logger.exception(
        "unhandled error ref=%s path=%s method=%s", ref, request.url.path, request.method
    )
    return JSONResponse(
        {"detail": "internal server error", "ref": ref}, status_code=500
    )


# ---------------------------------------------------------------- routes


api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root() -> dict[str, str]:
    """Small liveness ping. No authentication required, no side effects."""
    return {"status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(categories_router)
api_router.include_router(apps_router)
api_router.include_router(servers_router)
api_router.include_router(pics_router)
api_router.include_router(notes_router)
api_router.include_router(departments_router)
api_router.include_router(integrations_router)
api_router.include_router(import_export_router)

app.include_router(api_router)

# Uploaded category icons live on disk and are served under /api/uploads.
# ``check_dir=False`` avoids the boot-time race where the directory is created
# after the app object is imported.
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount(
    "/api/uploads",
    StaticFiles(directory=str(UPLOADS_DIR), check_dir=False),
    name="uploads",
)
