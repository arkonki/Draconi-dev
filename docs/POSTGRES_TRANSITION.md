# PostgreSQL self-hosting transition

## Current result

The application has a working local, self-contained Docker baseline. A clean startup creates PostgreSQL, a Node API, local persistent file storage, and the production frontend. The browser no longer loads the Supabase SDK or requires Supabase/Netlify environment variables.

The unavailable Supabase database was treated as unrecoverable. No production records are represented as restored. `002_seed.sql` contains only a deliberately small starter set of kin, professions, schools, skills, spells, items, heroic abilities, and biography choices so character creation can be exercised.

## Audit findings

The original frontend was tightly coupled to the Supabase browser client:

- 63 source files used the shared client and roughly 190 query-builder operations.
- The UI addressed 33 application tables and an `images` storage bucket.
- Seven Edge Function endpoints, nine runtime RPCs, and ten realtime subscription sites were part of active flows.
- Authentication, public profiles, storage, database access, and collaboration events all crossed directly from the browser into Supabase.
- The checked-in legacy migration chain could not recreate the production database by itself. Foundational tables were absent, helper functions were referenced before definition, manual fixes lived outside the chain, and some later migrations conflicted with frontend field names.
- The repository contained no production export or application-data seed.

Because the source UI has dozens of direct data calls, rewriting every screen before obtaining a runnable baseline would have introduced unnecessary UI regressions. The transition therefore uses a same-origin compatibility client: existing query chains are translated into calls to the local Node API, where authorization and SQL execution now live. This compatibility layer is an internal adapter and does not use the Supabase package or service.

## Runtime architecture

```text
Browser
  -> Nginx :80
       -> static React/Vite files
       -> /api/* -> Node.js :3000
                       -> PostgreSQL :5432
                       -> /data/storage (Docker volume)
```

Responsibilities are intentionally separated:

- Nginx owns SPA routing, static caching, upload-size limits, and the same-origin API proxy.
- Node owns credentials, sessions, authorization, query validation, relationship shaping, RPCs, file-path validation, and projector tokens.
- PostgreSQL owns durable relational data, constraints, updated timestamps, and the collaboration change log.
- Docker named volumes own database files and uploaded images.

## Implemented compatibility

- Local scrypt password hashes and opaque, hashed database sessions.
- Bootstrap administrator and administrator-driven account creation.
- Server-side table allowlists, identifier validation, ownership assignment, and party/user access checks.
- Select, insert, update, upsert, delete, common filters, ordering, limits, single-row modes, and the nested relations used by the UI.
- Encounter, party-join, stat-advancement, and test-connection RPCs.
- Projector session creation, layout updates, renewal, revocation, and public token state.
- Local `images` upload, list, delete, and public-read routes with path traversal protection.
- PostgreSQL change-event triggers, `LISTEN/NOTIFY`, and an authenticated first-party WebSocket for the existing collaborative refresh hooks.
- Canonical schema and idempotent reference seed for a clean database.
- Checksum-verified, transaction-scoped incremental SQL migrations serialized by a PostgreSQL advisory lock at API startup.
- Coordinated database/upload recovery through both CLI tooling and the administrator Settings console, including automatic pre-restore safety sets.
- Repeatable API security coverage for cross-user isolation, party membership, owner-only mutations, upsert conflicts, session expiry, and projector-token expiry/revocation.
- Cleanup-safe workflow coverage for every administrator game-data editor and the major party, storage, map, and encounter paths.
- Replay-safe realtime cursor initialization, WebSocket reconnect reconciliation, polling fallback, and authorized event delivery tests.
- Live refresh coverage for chat, inventory, membership/characters, encounters/combatants, maps, tasks, time tracking, random tables, party notes, and story ideas.
- Configurable, advisory-locked retention cleanup for expired sessions and collaboration events, with bounded batches and administrator status/manual controls.
- Party-workflow compatibility migration for text inventory actors and automatic synchronization between party membership and `characters.party_id`.
- Party chat deletion enforcement that permits authors and party owners, plus explicit PostgreSQL typing for initiative swaps.

## Intentional differences and open work

- Historical user, character, party, note, encounter, and uploaded-file data is unavailable and is not recreated.
- Web Push delivery is disabled. The local endpoint returns a clear `skipped` result, and the UI remains disabled unless a VAPID key is configured. A fully local push implementation would still require browser-reachable HTTPS and a Web Push delivery path.
- No outbound email or automatic password-reset mail is sent. Administrators can create accounts and share temporary credentials; users can change their password after login.
- Public registration defaults to disabled (`ALLOW_REGISTRATION=false`).
- Collaboration uses an authenticated WebSocket backed by PostgreSQL `LISTEN/NOTIFY` and the durable authorized event log. Channels establish a current cursor without replaying retained history and replay missed events after reconnecting. One shared four-second HTTP poll is retained only as a fallback when the WebSocket upgrade path is unavailable.
- Uploaded images are intentionally public once their URL is known, matching the old public `images` bucket behavior. Upload/list/delete operations require authentication.
- The reference seed is a functional starter, not a complete rules compendium. Content must be reviewed and expanded by the application owner.
- The legacy `supabase/` directory remains only as historical implementation evidence. Docker does not mount or execute it.

## Transition plan

### Phase 1 — local baseline (complete)

- Reconstruct the application schema from source contracts and surviving migrations.
- Replace hosted authentication, query, RPC, storage, function, and realtime calls with local equivalents.
- Containerize PostgreSQL, Node, and the frontend proxy.
- Verify a clean database startup and end-to-end authenticated smoke flow.

### Phase 2 — content and operational hardening (in progress)

- Use the coordinated PostgreSQL/upload backup tools and administrator Settings recovery console. CLI and UI backup/restore paths are implemented and validated; production scheduling and off-machine copying remain deployment work.
- API security integration tests for user isolation, party membership, owner-only mutations, upsert conflicts, expired sessions, and invalid projector tokens are implemented and passing against the Docker stack.
- Versioned incremental migrations are implemented. API startup and administrator restores apply them transactionally, serialize concurrent runners, and refuse changed or unknown applied migrations.
- Expired-session and change-event retention is implemented and tested. Defaults retain expired sessions for 24 hours, change events for 14 days, and run at six-hour intervals in batches of at most 20,000 rows per table per pass.
- Review the minimal reference seed and import any lawful source material available outside Supabase.
- Administrator editors and the major party tools are exercised by a repeatable disposable workflow suite; the current Docker checkpoint passes it end to end.
- Realtime delivery and authorization are covered by a disposable two-user/outsider rehearsal across the shared party tables; migration `0003_shared_tool_realtime.sql` adds the remaining change triggers and enforces one time tracker per party, while migration `0005_realtime_notifications.sql` wakes the WebSocket hub after committed changes.
- Replace the current compatibility query endpoint over time with explicit domain endpoints for the most security-sensitive workflows.

### Phase 3 — server deployment

- Install Docker Engine/Compose on the Node/PostgreSQL-capable server or run Node/PostgreSQL directly using the same environment contract.
- Generate long random values for `POSTGRES_PASSWORD` and `ADMIN_PASSWORD`; never deploy the documented local defaults.
- Bind PostgreSQL to localhost/private networking only. Remove its public port mapping if external administration is unnecessary.
- Put the web container behind the server's HTTPS reverse proxy and configure the real domain.
- Use named host paths or managed local disks with enough capacity for PostgreSQL and uploads.
- Run the smoke checklist against the server before inviting users.

### Phase 4 — cutover and recovery discipline

- Freeze schema changes during the first production cutover.
- Take an initial coordinated database and file-volume backup immediately after the production seed/content import.
- Schedule automatic local backups and copy encrypted backup sets to a second machine or offline medium. Avoiding third-party runtime services must not mean keeping only one copy of the data.
- Practice a restore into a separate database before declaring backups reliable.
- Monitor disk space, container health, failed logins, PostgreSQL errors, and backup age.

The implemented recovery workflow captures PostgreSQL and uploaded files together, generates a manifest and SHA-256 checksums, and briefly pauses API writes to keep both resources consistent:

```bash
npm run backup
npm run backup:verify -- backups/<UTC-timestamp>
npm run restore -- backups/<UTC-timestamp>
```

Administrators can perform the equivalent packaged workflow through **Settings → Backup & Restore**. See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for safety behavior, off-machine copy requirements, verification details, and both recovery procedures.

The repeatable local authorization/session/projector rehearsal is:

```bash
SECURITY_TEST_PASSWORD='<current-admin-password>' \
SECURITY_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:security
```

This suite creates and removes disposable users and directly expires its own test rows, so it is intended for local or otherwise disposable environments.

The broader administrator/party workflow rehearsal is:

```bash
WORKFLOW_TEST_PASSWORD='<current-admin-password>' \
WORKFLOW_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:workflow
```

It creates unique administrator reference/compendium records, a two-user party, shared tool data, an uploaded file, and encounter data. It verifies CRUD, party linking, authorization, local storage, and encounter RPCs before deleting the generated rows and object.

The realtime delivery rehearsal is:

```bash
REALTIME_TEST_PASSWORD='<current-admin-password>' \
REALTIME_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:realtime
```

It proves that channel initialization does not replay historical events, new events reach authorized party members, outsiders receive no party records, invalid cursors are rejected, and the shared tools emit insert/update/delete events. It deletes its disposable users, party data, and matching change-log rows when complete.

Retention cleanup has a separate local rehearsal:

```bash
HOUSEKEEPING_TEST_PASSWORD='<current-admin-password>' \
HOUSEKEEPING_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:housekeeping
```

It verifies administrator-only access, configuration visibility, pending-row counts, and deletion of eligible session/event sentinels.

## Acceptance checklist

- `docker compose ps` shows `db`, `api`, and `web` healthy.
- `GET /api/health` returns PostgreSQL status `ok` through Nginx.
- The bootstrap administrator can sign in.
- Reference tables load and an administrator can edit them.
- A character and party can be created, linked, queried, and deleted.
- Encounter combatants can be added through the local RPC.
- Projector tokens load public display state and respect expiry/revocation.
- An uploaded file can be fetched through its local public URL and deleted.
- Another non-admin user cannot edit records outside their ownership/party scope.
- Database and upload backups pass checksum/archive validation and restore successfully into an isolated verification database and temporary file directory.
