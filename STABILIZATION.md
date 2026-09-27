# DMS stabilization / verification

## Configuration and security

Backend variables are documented in `DiQuaMuaHaa/backend/.env.example`.
Set them in the shell or hosting environment; the backend does not auto-load
`.env`. Never commit real values. Flask and Socket.IO share
`CORS_ALLOWED_ORIGINS` (comma-separated full origins, no wildcard or paths).
Local HTTP/HTTPS port 5173 origins are allowed by default; production must
explicitly allow its frontend origin.

**Manual action required:** revoke/rotate the previously committed Telegram bot
token and webhook secret. Removing defaults does not remove secrets from Git
history or revoke them. The optional legacy medical service also requires a new
`JWT_SECRET_KEY` and explicit `MEDICAL_DATABASE_URL`; rotate its old key.
The DMS service does not depend on this legacy service.

`GET /health` performs a bounded, read-only `SELECT 1`, returns 200 when the
DB is reachable or 503 when unavailable, and reports model artifact presence,
loaded state and enabled state separately. A present artifact is not proof that
inference works. Health does not load/train models or create tables.
`/api/ping-db` uses the same safe probe. Neither exposes credentials or paths.

## Database contract

Both databases are intentional: README/local development uses MySQL/MariaDB;
`DiQuaMuaHaa/backend/render.yaml` selects PostgreSQL.
`DB_BACKEND=mysql` is the local default; `DB_BACKEND=postgres` requires
`DATABASE_URL` and psycopg2. Invalid/missing PostgreSQL configuration never
silently connects to MySQL.

`data/db_sql.py` owns the small dialect boundary: upsert, additive alert
upsert, and inserted IDs (PostgreSQL RETURNING versus MySQL lastrowid).
All values stay parameterized. Existing per-request lazy schema creation is
retained and committed before request work, including read-only requests.
Closing failed DB-API connections discards uncommitted data writes.

New MySQL identity tables use LONGTEXT for embeddings/images. Existing tables
are **not** altered. If an existing deployment still has TEXT image columns,
large registration images can exceed their capacity: inspect schema and plan
an independently approved migration after backup. No migration/data deletion
has been run by this stabilization work.

## Offline tests

From `DiQuaMuaHaa/backend`, in a virtual environment with backend dependencies:

```powershell
python -B -m unittest discover -s tests -v
```

These are Flask/Socket.IO and DB-API mock contract tests; they do not prove
compatibility with a running database server. Verify on a disposable database
for **each** deployed engine: register/re-register and verify identity, lookup
profile, bind/rebind Telegram owner, create/expire/accept/reject identity
request, start/end a session, increment alert counts, list/detail sessions.
Test real Telegram only with rotated credentials and the webhook secret header.
No real Telegram message or database write is needed by the offline suite.

Frontend lint baseline before changes: 40 errors and 20 warnings. These existing
issues are not silently treated as a passing lint result. Baseline production
bundle also exceeds Vite's 500 kB chunk advisory.
