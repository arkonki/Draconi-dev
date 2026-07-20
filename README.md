# Dragonbane Character Manager

Dragonbane Character Manager is a self-hosted React application for characters, parties, encounters, maps, notes, shared inventory, and game reference data.

The application now runs without Supabase, Netlify, or another hosted backend. Its runtime is three local containers:

- PostgreSQL 16 stores application, identity, and session data.
- A Node.js API provides authentication, authorization, data access, RPC operations, collaboration events, and local file storage.
- Nginx serves the production React build and proxies `/api` to Node.

## Run locally with Docker

Prerequisites: Docker Desktop (or Docker Engine with Compose v2).

1. Copy the environment template and replace both example passwords:

   ```bash
   cp .env.example .env
   ```

2. Build and start the stack:

   ```bash
   npm run docker:up
   ```

3. Open [http://localhost:8080](http://localhost:8080) and sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured in `.env`.

The first startup initializes the schema, loads a small reference/demo seed, and creates the bootstrap administrator. It does not restore any unavailable Supabase data.

Useful commands:

```bash
npm run docker:logs       # follow all service logs
npm run docker:down       # stop containers; keep database and files
npm run docker:reset      # delete local database and file volumes
docker compose ps         # show container health
```

`docker:reset` permanently deletes the local PostgreSQL, upload, and retained-backup Docker volumes. Download any recovery set you need to keep before using it. The SQL initialization scripts run only when PostgreSQL starts with an empty volume.

## Local ports and persistence

| Service | Default address | Persistent volume |
| --- | --- | --- |
| Web app | `http://localhost:8080` | none |
| Node API | `http://localhost:3000/api` | `storage_data` |
| PostgreSQL | `localhost:5432` | `postgres_data` |
| Server recovery sets | Admin Settings | `backup_data` |

All ports are configurable in `.env`. Browser traffic normally uses the web address; Nginx routes its `/api` requests internally.

For the production domain `https://draconi.ee`, build the frontend with
`VITE_BASE_PATH=/` and `VITE_API_BASE_URL=/api`. The deployment script reads
these values from the production environment and defaults to the same paths.

Uploaded images are stored in the Docker volume rather than in an object-storage service. PostgreSQL and uploaded files are captured together by the recovery commands:

```bash
npm run backup
npm run backup:verify -- backups/<UTC-timestamp>
npm run restore -- backups/<UTC-timestamp>
```

Backup creation briefly pauses API writes for consistency. Verification restores into a temporary database without changing live data. A real restore validates the set, requires an exact confirmation, and creates an automatic pre-restore safety backup. See the [backup and restore runbook](docs/BACKUP_RESTORE.md) before using this with production data.

Administrators can also open **Settings → Backup & Restore** to create/download backups, access retained server copies, validate uploads, and run a password-confirmed restore.

The **Settings → Game Data** item and spell tabs support add-only bulk imports from CSV or Excel (`.xlsx`). Each importer provides a CSV template, previews up to 1,000 rows, resolves spell school names to database IDs, and validates the entire file before a transactional save. Duplicate or invalid rows block the import without changing existing game data.

For long-running installations, the API removes expired sessions after a 24-hour grace period and collaboration change events after 14 days. Cleanup runs every six hours in bounded batches. Administrators can inspect pending rows and trigger an immediate pass under **Settings → Admin Panel → Maintenance**. These defaults are configurable through the `HOUSEKEEPING_*`, `EXPIRED_SESSION_RETENTION_HOURS`, and `CHANGE_EVENT_RETENTION_DAYS` values in `.env`; set `HOUSEKEEPING_INTERVAL_MINUTES=0` to disable only the automatic schedule.

## Development and verification

Install frontend dependencies with `npm install`. With the Docker database and API running, `npm run dev` starts Vite with `/api` proxied to port 3000.

```bash
npm run build
npm test -- --run
npm run lint
```

The canonical fresh-database schema is [docker/postgres/001_schema.sql](docker/postgres/001_schema.sql). The clearly labeled starter reference data is in [docker/postgres/002_seed.sql](docker/postgres/002_seed.sql).

Every schema change after that baseline belongs in a new `server/migrations/NNNN_description.sql` file. API startup applies pending migrations transactionally under a PostgreSQL advisory lock and verifies the checksum of every previously applied file. Never edit or renumber a migration after it has reached a persistent database. Administrator restores also run pending migrations before the application leaves maintenance mode.

The local security integration rehearsal creates and removes disposable accounts and directly expires test sessions in PostgreSQL:

```bash
SECURITY_TEST_PASSWORD='<current-admin-password>' \
SECURITY_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:security
```

Run it only against a local/disposable stack. It verifies user isolation, party membership, owner-only encounter actions, upsert conflicts, expired sessions, and projector token rejection.

The broader workflow rehearsal creates isolated administrator content plus a two-user party, exercises the main shared tools and local object storage, and removes every generated record when it finishes:

```bash
WORKFLOW_TEST_PASSWORD='<current-admin-password>' \
WORKFLOW_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:workflow
```

Run it only against a local/disposable stack. It verifies all administrator game-data editors, compendium entries/templates, party joining and character linking, chat permissions, inventory logs, tasks, time tracking, random tables, notes, story ideas, maps, uploads, and encounter operations.

The realtime rehearsal verifies cursor initialization, historical-event replay prevention, authorized cross-user delivery, cross-party isolation, and insert/update/delete events for the shared party tools:

```bash
REALTIME_TEST_PASSWORD='<current-admin-password>' \
REALTIME_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:realtime
```

Collaboration uses authorized 1.2-second event polling rather than a hosted WebSocket service. Chat, inventory, party/member state, encounters, maps, tasks, time tracking, random tables, party notes, and story-library changes refresh connected party views. Projector displays independently refresh every 1.5 seconds.

The housekeeping rehearsal also requires a local/disposable stack because it inserts deliberately expired rows and invokes real retention cleanup:

```bash
HOUSEKEEPING_TEST_PASSWORD='<current-admin-password>' \
HOUSEKEEPING_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:housekeeping
```

See [docs/POSTGRES_TRANSITION.md](docs/POSTGRES_TRANSITION.md) for the audit, architecture decisions, limitations, and production transition plan.
