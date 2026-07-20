#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY_URL="https://github.com/arkonki/Draconi-dev.git"
readonly DEPLOY_BRANCH="Postgres-SQL"
readonly PM2_APP_NAME="draconi-api"

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly APP_DIR="${DRACONI_APP_DIR:-${HOME}/apps/draconi}"
readonly PUBLIC_DIR="${DRACONI_PUBLIC_DIR:-${SCRIPT_DIR}}"
readonly ENV_FILE="${DRACONI_ENV_FILE:-${HOME}/.config/draconi/production.env}"
readonly DATA_DIR="${DRACONI_DATA_DIR:-${HOME}/.local/share/draconi}"
readonly LOCK_DIR="${TMPDIR:-/tmp}/draconi-deploy-${USER}.lock"

PULL_ONLY=false
NO_RESTART=false

usage() {
  cat <<'USAGE'
Usage: ./deploy.sh [--pull-only] [--no-restart]

  --pull-only   Clone or fast-forward the Postgres-SQL branch, then stop.
  --no-restart  Build and publish the frontend without starting/restarting PM2.

Optional path overrides:
  DRACONI_APP_DIR     Private Git checkout (default: $HOME/apps/draconi)
  DRACONI_PUBLIC_DIR  Frontend destination (default: deploy.sh directory)
  DRACONI_ENV_FILE    API environment file (default: $HOME/.config/draconi/production.env)
  DRACONI_DATA_DIR    Upload/backup root (default: $HOME/.local/share/draconi)
USAGE
}

fail() {
  printf 'Deployment failed: %s\n' "$*" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --pull-only) PULL_ONLY=true ;;
    --no-restart) NO_RESTART=true ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

for command_name in git npm rsync; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "Required command not found: ${command_name}"
done

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  fail "Another deployment may be running (${LOCK_DIR} exists)"
fi
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT INT TERM

mkdir -p "$(dirname -- "${APP_DIR}")"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  if [[ -e "${APP_DIR}" ]] && [[ -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    fail "${APP_DIR} exists and is not an empty Git checkout"
  fi

  printf 'Cloning %s (%s)...\n' "${REPOSITORY_URL}" "${DEPLOY_BRANCH}"
  git clone --branch "${DEPLOY_BRANCH}" --single-branch "${REPOSITORY_URL}" "${APP_DIR}"
else
  actual_remote="$(git -C "${APP_DIR}" remote get-url origin 2>/dev/null || true)"
  [[ "${actual_remote}" == "${REPOSITORY_URL}" ]] \
    || fail "Unexpected origin in ${APP_DIR}: ${actual_remote:-missing}"

  if [[ -n "$(git -C "${APP_DIR}" status --porcelain --untracked-files=no)" ]]; then
    fail "Tracked local changes exist in ${APP_DIR}; commit or remove them before deploying"
  fi

  printf 'Fetching %s...\n' "${DEPLOY_BRANCH}"
  git -C "${APP_DIR}" fetch --prune origin "${DEPLOY_BRANCH}"
  git -C "${APP_DIR}" checkout "${DEPLOY_BRANCH}"
  git -C "${APP_DIR}" merge --ff-only "origin/${DEPLOY_BRANCH}"
fi

commit_ref="$(git -C "${APP_DIR}" rev-parse --short HEAD)"
printf 'Checked out %s at %s.\n' "${DEPLOY_BRANCH}" "${commit_ref}"

if [[ "${PULL_ONLY}" == true ]]; then
  exit 0
fi

if [[ "${NO_RESTART}" == false ]]; then
  command -v pm2 >/dev/null 2>&1 || fail "PM2 is required to run the API"
  command -v psql >/dev/null 2>&1 || fail "psql is required to verify PostgreSQL access"

  if [[ ! -f "${ENV_FILE}" ]]; then
    cat >&2 <<EOF
The deployment environment file is missing:
  ${ENV_FILE}

Create it with at least DATABASE_URL, ADMIN_EMAIL, ADMIN_USERNAME,
ADMIN_PASSWORD, and PORT. Use a strong password; never use change-me-now.
Use --no-restart only when intentionally publishing the frontend without the API.
EOF
    exit 1
  fi

  set -a
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
  set +a

  : "${DATABASE_URL:?DATABASE_URL must be set in ${ENV_FILE}}"
  : "${ADMIN_EMAIL:?ADMIN_EMAIL must be set in ${ENV_FILE}}"
  : "${ADMIN_USERNAME:?ADMIN_USERNAME must be set in ${ENV_FILE}}"
  : "${ADMIN_PASSWORD:?ADMIN_PASSWORD must be set in ${ENV_FILE}}"
  [[ "${ADMIN_PASSWORD}" != "change-me-now" ]] || fail "Refusing to deploy with the default administrator password"

  export NODE_ENV=production
  export PORT="${PORT:-3000}"
  export STORAGE_ROOT="${STORAGE_ROOT:-${DATA_DIR}/storage}"
  export BACKUP_ROOT="${BACKUP_ROOT:-${DATA_DIR}/backups}"

  [[ "${STORAGE_ROOT}" != "${BACKUP_ROOT}" ]] || fail "STORAGE_ROOT and BACKUP_ROOT must be different"
  mkdir -p "${STORAGE_ROOT}" "${BACKUP_ROOT}"
  chmod 700 "${STORAGE_ROOT}" "${BACKUP_ROOT}"

  psql "${DATABASE_URL}" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --command 'SELECT 1' >/dev/null \
    || fail "Unable to connect to PostgreSQL using DATABASE_URL"
fi

printf 'Installing frontend dependencies and building...\n'
npm --prefix "${APP_DIR}" ci
COMMIT_REF="${commit_ref}" npm --prefix "${APP_DIR}" run build

printf 'Installing production API dependencies...\n'
npm --prefix "${APP_DIR}/server" ci --omit=dev

mkdir -p "${PUBLIC_DIR}"
if [[ "${NO_RESTART}" == true ]]; then
  printf 'Publishing frontend to %s...\n' "${PUBLIC_DIR}"
  rsync -a --delete-delay \
    --exclude '/deploy.sh' \
    --exclude '/.htaccess' \
    --exclude '/.well-known/' \
    "${APP_DIR}/dist/" "${PUBLIC_DIR}/"
  printf 'Frontend deployed. PM2 restart skipped by request.\n'
  exit 0
fi

if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  printf 'Restarting %s...\n' "${PM2_APP_NAME}"
  pm2 restart "${PM2_APP_NAME}" --update-env
else
  printf 'Starting %s...\n' "${PM2_APP_NAME}"
  pm2 start "${APP_DIR}/server/index.js" \
    --name "${PM2_APP_NAME}" \
    --cwd "${APP_DIR}" \
    --interpreter node \
    --time
fi

health_url="http://127.0.0.1:${PORT}/api/health"
healthy=false
for _attempt in {1..20}; do
  if curl --fail --silent --show-error "${health_url}" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done

[[ "${healthy}" == true ]] || fail "API health check failed: ${health_url}"

printf 'Publishing frontend to %s...\n' "${PUBLIC_DIR}"
rsync -a --delete-delay \
  --exclude '/deploy.sh' \
  --exclude '/.htaccess' \
  --exclude '/.well-known/' \
  "${APP_DIR}/dist/" "${PUBLIC_DIR}/"

pm2 save
printf 'Deployment %s completed successfully.\n' "${commit_ref}"
