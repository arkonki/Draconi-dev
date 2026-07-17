#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/backup-common.sh"

if [ "$#" -lt 1 ]; then
  echo "Usage: sh scripts/restore.sh <backup-directory> [--yes] [--skip-safety-backup]" >&2
  exit 1
fi

requested_backup=$1
shift
assume_yes=false
skip_safety_backup=false

for option in "$@"; do
  case "$option" in
    --yes) assume_yes=true ;;
    --skip-safety-backup) skip_safety_backup=true ;;
    *) echo "Unknown restore option: $option" >&2; exit 1 ;;
  esac
done

case "$requested_backup" in
  /*) ;;
  *) requested_backup="$PROJECT_ROOT/$requested_backup" ;;
esac
if [ ! -d "$requested_backup" ]; then
  echo "Backup directory does not exist: $requested_backup" >&2
  exit 1
fi
backup_dir=$(CDPATH= cd -- "$requested_backup" && pwd -P)

require_database
reject_system_database "$DB_NAME"

echo "Validating backup before restore..."
sh "$SCRIPT_DIR/verify-backup.sh" "$backup_dir" --checksums-only

echo
echo "WARNING: this will replace database '$DB_NAME' and all uploaded files in the local Docker stack."
if [ "$assume_yes" != true ]; then
  printf "Type RESTORE %s to continue: " "$DB_NAME"
  IFS= read -r confirmation
  if [ "$confirmation" != "RESTORE $DB_NAME" ]; then
    echo "Restore cancelled."
    exit 1
  fi
fi

safety_backup='not created (--skip-safety-backup was used)'
if [ "$skip_safety_backup" != true ]; then
  safety_backup="$PROJECT_ROOT/backups/pre-restore-$(date -u '+%Y%m%dT%H%M%SZ')"
  echo "Creating automatic pre-restore safety backup..."
  sh "$SCRIPT_DIR/backup.sh" "$safety_backup"
fi

api_was_running=false
restore_complete=false

cleanup() {
  status=$?
  trap - 0 1 2 15

  if [ "$api_was_running" = true ]; then
    echo "Restarting API..."
    if compose start api >/dev/null 2>&1; then
      wait_for_api || status=1
    else
      echo "Failed to restart the API container." >&2
      status=1
    fi
  fi

  if [ "$status" -ne 0 ] || [ "$restore_complete" != true ]; then
    echo "Restore did not complete." >&2
    echo "Pre-restore safety backup: $safety_backup" >&2
  fi

  exit "$status"
}
trap cleanup 0 1 2 15

if api_is_running; then
  api_was_running=true
  echo "Stopping API writes..."
  compose stop api >/dev/null
fi

echo "Replacing PostgreSQL database '$DB_NAME'..."
compose exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" >/dev/null
compose exec -T db dropdb -U "$DB_USER" --if-exists "$DB_NAME"
compose exec -T db createdb -U "$DB_USER" "$DB_NAME"
compose exec -T db pg_restore \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  --exit-on-error < "$backup_dir/database.dump"

echo "Replacing uploaded files..."
compose run --rm --no-deps --entrypoint sh api -c '
  set -eu
  restore_dir=$(mktemp -d /tmp/dragonbane-storage-restore.XXXXXX)
  trap '\''rm -rf -- "$restore_dir"'\'' 0 1 2 15
  tar -C "$restore_dir" -xzf -
  find /data/storage -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  tar -C "$restore_dir" -cf - . | tar -C /data/storage -xf -
' < "$backup_dir/storage.tar.gz"

restore_complete=true

if [ "$api_was_running" = true ]; then
  echo "Restarting API..."
  compose start api >/dev/null
  wait_for_api
  api_was_running=false
fi

trap - 0 1 2 15
restored_user_count=$(compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) FROM users;')
echo "Restore complete: $restored_user_count users recovered from $backup_dir"
echo "Pre-restore safety backup: $safety_backup"
