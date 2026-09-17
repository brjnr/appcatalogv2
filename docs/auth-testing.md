# Authentication Testing Playbook

No credentials are stored in this workspace. Use isolated test fixtures only.

1. Verify `users.email` is unique, `sessions.token_digest` is unique, and `sessions.expires_at` has a TTL index.
2. Login with an isolated fixture and confirm the response sets an HttpOnly session cookie and a non-HttpOnly CSRF cookie.
3. Call `/api/auth/me`, then repeat a state-changing request without `X-CSRF-Token`; it must return 403.
4. Repeat with the matching CSRF token; the request should proceed to authorization.
5. Advance or replace `expires_at`; `/api/auth/me` must return 401.
6. Set the user inactive; the same session must return 401.
7. Submit five invalid logins per IP/account and verify the sixth returns generic 429.
8. Confirm production startup fails when CORS or trusted-host allowlists are wildcard/missing.