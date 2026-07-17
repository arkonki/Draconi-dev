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

`docker:reset` permanently deletes the local Docker data volumes. The SQL initialization scripts run only when PostgreSQL starts with an empty volume.

## Local ports and persistence

| Service | Default address | Persistent volume |
| --- | --- | --- |
| Web app | `http://localhost:8080` | none |
| Node API | `http://localhost:3000/api` | `storage_data` |
| PostgreSQL | `localhost:5432` | `postgres_data` |

All ports are configurable in `.env`. Browser traffic normally uses the web address; Nginx routes its `/api` requests internally.

Uploaded images are stored in the Docker volume rather than in an object-storage service. PostgreSQL and uploaded files must both be backed up before production deployment.

## Development and verification

Install frontend dependencies with `npm install`. With the Docker database and API running, `npm run dev` starts Vite with `/api` proxied to port 3000.

```bash
npm run build
npm test -- --run
npm run lint
```

The canonical fresh-database schema is [docker/postgres/001_schema.sql](docker/postgres/001_schema.sql). The clearly labeled starter reference data is in [docker/postgres/002_seed.sql](docker/postgres/002_seed.sql).

See [docs/POSTGRES_TRANSITION.md](docs/POSTGRES_TRANSITION.md) for the audit, architecture decisions, limitations, and production transition plan.
