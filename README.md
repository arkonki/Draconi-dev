# Dragonbane Character Manager

Dragonbane Character Manager is a self-hosted React application for characters, parties, encounters, maps, notes, shared inventory, and game reference data.

The application now runs without Supabase, Netlify, or another hosted backend. Its runtime is four local containers:

- PostgreSQL 16 stores application, identity, and session data.
- A Node.js API provides authentication, authorization, data access, RPC operations, collaboration events, and local file storage.
- A thin MCP server exposes controlled Dragonbane tools and resources through the versioned API.
- Nginx serves the production React build and proxies `/api` to Node.

## Run locally with Docker

Prerequisites: Docker Desktop (or Docker Engine with Compose v2).

1. Copy the environment template and replace the example passwords and
   development token. Keep the password inside `DATABASE_URL` in sync with
   `POSTGRES_PASSWORD` if you plan to run Node directly on the host:

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
| Helper API documentation | `http://localhost:3000/docs` | none |
| MCP Streamable HTTP | `http://localhost:3100/mcp` | none |
| PostgreSQL | `localhost:5432` | `postgres_data` |
| Server recovery sets | Admin Settings | `backup_data` |

All ports are configurable in `.env`. Browser traffic normally uses the web address; Nginx routes its `/api` requests internally.

## Dragonbane Helper API and MCP MVP

The Helper integration uses the existing data model instead of duplicating it:

- `parties` are campaigns;
- `characters` and active `encounter_combatants` are actors;
- `encounters` are combats;
- PostgreSQL remains the sole authoritative state store;
- MCP calls the `/api/v1` REST contract and never accesses PostgreSQL directly.

The current MVP provides the read-only MCP tools `list_campaigns`,
`get_campaign_state`, `get_actor`, `get_combat_state`,
`get_encounter_setup_options`, `get_session_history`, `get_recent_events`,
`get_solo_options`, and `get_solo_state`.
It also provides the
modifying tools `apply_actor_changes`, `append_campaign_event`,
`create_encounter`, `add_encounter_participants`,
`remove_encounter_participant`, `start_combat`, `resolve_game_action`,
`advance_combat_turn`, `end_combat`, `start_session`, `complete_session`,
`enable_solo_mode`, `disable_solo_mode`, `select_solo_heroic_ability`,
`ask_fortune`, `draw_inspiration`, `start_solo_mission`, `reveal_waypoint`,
`search_waypoint`, `scavenge_waypoint`, `advance_threat`, and
`complete_solo_mission`.
Actor changes support HP, WP,
conditions, and quantity changes for existing character inventory items.
Encounter preparation is GM-only, uses party characters and the local monster
catalog, and expands monster ferocity into separate initiative actions. Combat
actions apply effects to multiple participants in one transaction and enforce
the active turn. Session lifecycle tools bind subsequent events to an active
game session and persist its ending summary, scene, and unresolved threads.

Every modifying call:

- requires the latest campaign revision through `If-Match`;
- requires a unique `Idempotency-Key`;
- runs in one PostgreSQL transaction;
- increments the campaign revision exactly once;
- records immutable campaign events;
- returns structured state and the resulting revision.

If another client changes campaign state first, the API returns HTTP 409 with
`REVISION_CONFLICT`. Read the state again and reassess instead of retrying the
old arguments.

### Environment variables

Set these values in `.env` in addition to the normal database and administrator
settings:

```dotenv
AUTH_MODE=development_token
DEVELOPMENT_TOKEN=replace-with-a-separate-long-random-token
DEVELOPMENT_USER_EMAIL=admin@example.com
HELPER_RATE_LIMIT_PER_MINUTE=120
MCP_PORT=3100
```

Generate a suitable local token with `openssl rand -base64 32`. The configured
email must already exist in `users`; on a fresh installation it should match
`ADMIN_EMAIL`. The server derives identity and permissions from that user and
never accepts a user ID from an MCP tool argument.

Restart the stack after changing these values:

```bash
docker compose up --build -d
```

Database migrations are applied automatically when the API starts. Never edit
an applied migration; add the next numbered file under `server/migrations`.

### REST API and OpenAPI

The complete OpenAPI 3.1 document and the self-contained documentation page are
available at:

```text
http://localhost:3000/openapi.json
http://localhost:3000/docs
```

Example read:

```bash
export DRACONI_DEV_TOKEN='<value from DEVELOPMENT_TOKEN>'
curl http://localhost:3000/api/v1/campaigns \
  -H "Authorization: Bearer $DRACONI_DEV_TOKEN"
```

Example idempotent damage write:

```bash
curl -X POST \
  http://localhost:3000/api/v1/campaigns/<campaign-id>/actors/<actor-id>/changes \
  -H "Authorization: Bearer $DRACONI_DEV_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "42"' \
  -H 'Idempotency-Key: combat-round-3-goblin-hit-1' \
  --data '{"reason":"Goblin longsword hit","changes":[{"type":"damage","amount":6,"damage_type":"slashing"}]}'
```

The same idempotency key may be retried only with identical arguments. The
original response is returned without applying the change twice.

### MCP development and testing

The Docker stack starts the MCP endpoint at
`http://localhost:3100/mcp`. It uses Streamable HTTP and expects the same bearer
token. Inspect it locally with the MCP Inspector and configure its Authorization
header as `Bearer <DEVELOPMENT_TOKEN>`:

```bash
npx @modelcontextprotocol/inspector@latest
```

The disposable integration rehearsal creates a temporary campaign, actors, and
encounter. It tests encounter discovery and preparation, damage, idempotent
replay, revision conflict, event ordering, the complete combat lifecycle,
GM-only combat authorization, OpenAPI, and MCP discovery, then removes its test
data:

```bash
docker compose exec -T \
  -e MCP_SMOKE_URL=http://mcp:3100/mcp \
  api node server/helper/smoke.mjs
```

It is intended for a local stack. `npm run test:helper-api` runs the same script
from the host when `DATABASE_URL`, `DEVELOPMENT_TOKEN`, and
`DEVELOPMENT_USER_EMAIL` are exported.

### Production MCP and OAuth

`development_token` mode uses one long-lived secret with all permissions of the
mapped local user. Keep it out of source control, logs, screenshots, browser
code, and public endpoints. Use it only on localhost or a private development
network. Rotate it by changing `.env` and restarting the API.

Production exposes Streamable HTTP at `https://draconi.ee/mcp` from the same
Node process as the API. It uses OAuth 2.1 Authorization Code + S256 PKCE,
dynamic client registration, rotating refresh tokens, protected-resource and
authorization-server discovery, explicit read/write scopes, and Draconi's own
login screen. OAuth tokens are stored only as SHA-256 hashes. Campaign access
is still resolved from the authenticated Draconi user on every Helper API call.
No OpenAI API key is needed or used by the public Helper endpoint.

The production environment should set:

```dotenv
AUTH_MODE=oauth
PUBLIC_BASE_URL=https://draconi.ee
OAUTH_ACCESS_TOKEN_MINUTES=60
OAUTH_REFRESH_TOKEN_DAYS=30
```

The deployment script defaults to these production-safe values, refuses
`development_token` mode, creates a PostgreSQL safety dump before migrations,
and verifies OAuth discovery plus the unauthenticated `/mcp` challenge.

See [docs/HELPER_MCP.md](docs/HELPER_MCP.md) for the architecture, data-model
mapping, consistency rules, deliberate MVP limits, and the next implementation
phases.

For the production domain `https://draconi.ee`, build the frontend with
`VITE_BASE_PATH=/` and `VITE_API_BASE_URL=/api`. The deployment script reads
these values from the production environment and defaults to the same paths.
It also renders the Apache proxy configuration, including the WebSocket
upgrade route, `/mcp`, and OAuth endpoints, from
`hosting/apache.htaccess.template`. On Veebimajutus,
`ELKDATA_APP_IP` is used automatically when the hosting panel supplies it;
otherwise Node binds to all interfaces and Apache reaches it on localhost.

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
npm run lint
npm run typecheck
npm test
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

The realtime rehearsal verifies cursor initialization, historical-event replay prevention, authenticated WebSocket delivery, authorized cross-user delivery, cross-party isolation, and insert/update/delete events for the shared party tools:

```bash
REALTIME_TEST_PASSWORD='<current-admin-password>' \
REALTIME_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:realtime
```

Collaboration uses a first-party authenticated WebSocket connected to the Node
API. PostgreSQL `LISTEN/NOTIFY` wakes the server when the durable change-event
log receives a row, and clients retain their cursor so reconnects replay missed
authorized events. A shared four-second HTTP poll remains available only as a
fallback when the WebSocket upgrade path is unavailable. Chat, inventory,
party/member state, encounters, maps, tasks, time tracking, random tables,
party notes, and story-library changes refresh connected party views.
Projector displays independently refresh every 1.5 seconds.

The housekeeping rehearsal also requires a local/disposable stack because it inserts deliberately expired rows and invokes real retention cleanup:

```bash
HOUSEKEEPING_TEST_PASSWORD='<current-admin-password>' \
HOUSEKEEPING_TEST_DATABASE_URL='postgresql://dragonbane:<postgres-password>@localhost:5432/dragonbane' \
npm run test:housekeeping
```

See [docs/POSTGRES_TRANSITION.md](docs/POSTGRES_TRANSITION.md) for the audit, architecture decisions, limitations, and production transition plan.
