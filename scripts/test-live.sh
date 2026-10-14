#!/usr/bin/env bash
# One command for the live tests: rebuilds the local Docker stack, makes a throwaway administrator, runs the smoke
# scripts against the running API, and cleans everything up again.
#
#   npm run test:live                    everything below, after rebuilding api and web
#   npm run test:live -- --no-build      skip the rebuild (the stack must already run the code you want to test)
#   npm run test:live -- --only ai,roles run just these
#   npm run test:live -- --list          show the names
#
# The scripts run inside the API container, next to the code and the database, so Node does not have to be installed
# on this machine. The AI test brings its own stand-in for OpenRouter, so no real key or money is involved. The
# recovery test (backup and restore) is not part of the default set because it replaces data.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# name:ENV_PREFIX:needs the stand-in AI server (1 or 0)
SUITES=(
  "user-admin:USERADMIN:0"
  "admin-overview:OVERVIEW:0"
  "party-management:PARTY:0"
  "roles:ROLES:0"
  "combat:COMBAT:0"
  "table:TABLE:0"
  "connections:CONN:0"
  "workflow:WORKFLOW:0"
  "game-data-usage:GAMEDATA:0"
  "security:SECURITY:0"
  "housekeeping:HOUSEKEEPING:0"
  "realtime:REALTIME:0"
  "ai:AI:1"
)

BUILD=1
ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) BUILD=0 ;;
    --only) ONLY="${2:-}"; shift ;;
    --only=*) ONLY="${1#--only=}" ;;
    --list)
      for entry in "${SUITES[@]}"; do echo "${entry%%:*}"; done
      exit 0
      ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 2; }
[[ -f .env ]] || { echo "No .env file here. Copy .env.example to .env and start the stack first." >&2; exit 2; }

ADMIN_EMAIL="live-admin-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8)@example.com"
ADMIN_PASSWORD="Live-$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20)"
SECRET="live-test-secret-$(LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 40)"
STAND_IN_URL="http://localhost:4010"
PSQL='psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=0'
WORK=/app/server

compose_up_for_tests() {
  AI_KEY_ENCRYPTION_SECRET="$SECRET" OPENROUTER_BASE_URL="$STAND_IN_URL" AI_CALLS_PER_MINUTE=500 docker compose up -d "$@"
}

# Puts the stack back the way it normally runs, with the live-test settings gone.
restore() {
  echo
  echo "Cleaning up…"
  docker compose exec -T db sh -c "$PSQL" >/dev/null 2>&1 <<SQL
DELETE FROM parties WHERE created_by IN (SELECT id FROM users WHERE email = '$ADMIN_EMAIL');
DELETE FROM characters WHERE user_id IN (SELECT id FROM users WHERE email = '$ADMIN_EMAIL');
DELETE FROM app_sessions WHERE user_id IN (SELECT id FROM users WHERE email = '$ADMIN_EMAIL');
DELETE FROM users WHERE email = '$ADMIN_EMAIL';
SQL
  for entry in "${SUITES[@]}"; do docker compose exec -T api sh -c "rm -f $WORK/live-${entry%%:*}.mjs" >/dev/null 2>&1; done
  docker compose up -d api >/dev/null 2>&1
  docker compose exec -T api sh -c 'rm -rf /data/backups/dragonbane-auto-*' >/dev/null 2>&1
}
trap restore EXIT

selected() {
  [[ -z "$ONLY" ]] && return 0
  [[ ",$ONLY," == *",$1,"* ]]
}

echo "Starting the stack with the live-test settings…"
if [[ $BUILD -eq 1 ]]; then
  compose_up_for_tests --build api web >/dev/null 2>&1 || { echo "The build failed. Run 'docker compose up -d --build api web' to see why." >&2; exit 1; }
else
  compose_up_for_tests db api web >/dev/null 2>&1 || { echo "Could not start the stack." >&2; exit 1; }
  # Recreate the API so it picks up the test settings.
  compose_up_for_tests --force-recreate api >/dev/null 2>&1 || exit 1
fi

for attempt in $(seq 1 60); do
  if docker compose exec -T api node -e "fetch('http://localhost:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
  sleep 2
  if [[ $attempt -eq 60 ]]; then echo "The API did not become healthy." >&2; exit 1; fi
done

echo "Making a throwaway administrator ($ADMIN_EMAIL)…"
HASH="$(docker compose exec -T api node -e "import('/app/server/auth.js').then(async (m) => process.stdout.write(await m.hashPassword(process.argv[1])))" "$ADMIN_PASSWORD")"
[[ -n "$HASH" ]] || { echo "Could not hash the password." >&2; exit 1; }
docker compose exec -T db sh -c "$PSQL" >/dev/null <<SQL || { echo "Could not create the administrator." >&2; exit 1; }
WITH u AS (INSERT INTO users (email, username, role) VALUES ('$ADMIN_EMAIL', 'live-admin', 'admin') RETURNING id)
INSERT INTO app_credentials (user_id, password_hash) SELECT id, '$HASH' FROM u;
SQL

PASSED=()
FAILED=()
SKIPPED=()
echo
for entry in "${SUITES[@]}"; do
  IFS=: read -r name prefix needs_stand_in <<<"$entry"
  if ! selected "$name"; then SKIPPED+=("$name"); continue; fi
  script="scripts/${name}-smoke.mjs"
  [[ -f "$script" ]] || { echo "  ?  $name (no $script)"; FAILED+=("$name"); continue; }
  docker compose cp "$script" "api:$WORK/live-$name.mjs" >/dev/null 2>&1 || { echo "  x  $name (could not copy the script)"; FAILED+=("$name"); continue; }
  started=$SECONDS
  output="$(docker compose exec -T \
    -e "${prefix}_TEST_API=http://localhost:3000/api" \
    -e "${prefix}_TEST_EMAIL=$ADMIN_EMAIL" \
    -e "${prefix}_TEST_PASSWORD=$ADMIN_PASSWORD" \
    api sh -c "cd $WORK && export ${prefix}_TEST_DATABASE_URL=\"\$DATABASE_URL\" && node ./live-$name.mjs" 2>&1)"
  status=$?
  took=$((SECONDS - started))
  if [[ $status -eq 0 ]]; then
    printf '  ok %-18s %ss\n' "$name" "$took"
    PASSED+=("$name")
  else
    printf '  FAIL %-16s %ss\n' "$name" "$took"
    echo "$output" | grep -v '^    at ' | tail -40 | sed 's/^/       /'
    FAILED+=("$name")
  fi
done

echo
echo "Passed: ${#PASSED[@]}   Failed: ${#FAILED[@]}   Skipped: ${#SKIPPED[@]}"
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed: ${FAILED[*]}"
  exit 1
fi
