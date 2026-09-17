"""Shared Mongo handle — import ``client``/``db`` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on.
# Applied by ensure_indexes() at startup. NOTE: the ``sessions`` collection
# now stores a SHA-256 digest of the cookie token (see lib/auth.py), never
# the raw bearer — the ``token_hash`` unique index reflects that.
INDEXES: dict[str, list[IndexModel]] = {
    "apps": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("category_id", ASCENDING)], name="category_id"),
        IndexModel([("usage_count", DESCENDING)], name="usage_desc"),
        IndexModel([("favorite_count", DESCENDING)], name="favorites_desc"),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("updated_at", DESCENDING)], name="updated_desc"),
        # Speeds up the free-text search executed by _build_query() in routers/apps.py
        IndexModel([("name", ASCENDING)], name="name"),
    ],
    "categories": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("name", ASCENDING)], name="name", unique=True),
    ],
    "users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        # Username is optional on legacy rows; a partial unique index keeps
        # NULLs from colliding while still enforcing uniqueness on real values.
        IndexModel(
            [("username", ASCENDING)],
            name="username_unique",
            unique=True,
            partialFilterExpression={"username": {"$type": "string"}},
        ),
    ],
    # Session lookup by hashed token, plus TTL sweep for expired rows.
    "sessions": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    # Server-side favorites: unique per (user, app) so a client cannot inflate
    # counts by replaying the toggle endpoint.
    "favorites": [
        IndexModel(
            [("user_id", ASCENDING), ("app_id", ASCENDING)],
            name="user_app_unique",
            unique=True,
        ),
        IndexModel([("app_id", ASCENDING)], name="by_app"),
    ],
    # Brute-force accounting: rows self-destruct at ``expires_at`` so we never
    # accumulate history and the /auth/login window stays sliding.
    "login_attempts": [
        IndexModel([("email", ASCENDING), ("created_at", DESCENDING)], name="email_created"),
        IndexModel([("ip", ASCENDING), ("created_at", DESCENDING)], name="ip_created"),
        IndexModel([("expires_at", ASCENDING)], name="attempts_ttl", expireAfterSeconds=0),
    ],
    "servers": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("name", ASCENDING)], name="name"),
        IndexModel([("application_ids", ASCENDING)], name="application_ids"),
        IndexModel([("pic_ids", ASCENDING)], name="pic_ids"),
    ],
    "pics": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("name", ASCENDING)], name="name"),
        IndexModel([("application_ids", ASCENDING)], name="application_ids"),
    ],
    "integrations": [
        IndexModel([("kind", ASCENDING)], name="kind", unique=True),
    ],
}


async def ensure_indexes() -> None:
    # Drop the legacy ``token`` index (plain tokens) if a previous deploy left
    # it behind — the new schema stores ``token_hash`` only.
    try:
        existing = await db.sessions.index_information()
        if "token" in existing:
            await db.sessions.drop_index("token")
    except Exception as exc:  # never block boot on index cleanup
        logger.warning("ensure_indexes(sessions.token drop): %s", exc)

    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
