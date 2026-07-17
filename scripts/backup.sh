#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/backup-common.sh"

require_database
require_command tar

timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
backup_root=${BACKUP_ROOT:-"$PROJECT_ROOT/backups"}
case "$backup_root" in
  /*) ;;
  *) backup_root="$PROJECT_ROOT/$backup_root" ;;
esac

requested_target=${1:-"$backup_root/$timestamp"}
case "$requested_target" in
  /*) ;;
  *) requested_target="$PROJECT_ROOT/$requested_target" ;;
esac
backup_dir=$(absolute_path "$requested_target")

if [ -e "$backup_dir" ]; then
  echo "Backup target already exists: $backup_dir" >&2
  exit 1
fi

umask 077
mkdir "$backup_dir"

api_was_running=false
backup_complete=false

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

  if [ "$status" -ne 0 ] || [ "$backup_complete" != true ]; then
    echo "Backup did not complete. Partial files were retained at: $backup_dir" >&2
  fi

  exit "$status"
}
trap cleanup 0 1 2 15

if api_is_running; then
  api_was_running=true
  echo "Pausing API writes for a consistent database and file snapshot..."
  compose stop api >/dev/null
fi

echo "Dumping PostgreSQL database '$DB_NAME'..."
compose exec -T db pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -Fc \
  --no-owner \
  --no-acl > "$backup_dir/database.dump.partial"
mv "$backup_dir/database.dump.partial" "$backup_dir/database.dump"

echo "Archiving uploaded files..."
compose run --rm --no-deps --entrypoint tar api \
  -C /data/storage -czf - . > "$backup_dir/storage.tar.gz.partial"
mv "$backup_dir/storage.tar.gz.partial" "$backup_dir/storage.tar.gz"

database_bytes=$(file_size "$backup_dir/database.dump")
storage_bytes=$(file_size "$backup_dir/storage.tar.gz")
app_version=$(cd "$PROJECT_ROOT" && node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); process.stdout.write(p.version)" 2>/dev/null || printf 'unknown')

printf '%s\n' \
  '{' \
  '  "formatVersion": 1,' \
  "  \"createdAtUtc\": \"$timestamp\"," \
  "  \"applicationVersion\": \"$app_version\"," \
  "  \"databaseName\": \"$DB_NAME\"," \
  "  \"databaseBytes\": $database_bytes," \
  "  \"storageBytes\": $storage_bytes," \
  '  "consistency": "API writes paused during database and storage snapshot"' \
  '}' > "$backup_dir/manifest.json"

write_checksums "$backup_dir" > "$backup_dir/SHA256SUMS.partial"
mv "$backup_dir/SHA256SUMS.partial" "$backup_dir/SHA256SUMS"
chmod 600 "$backup_dir/database.dump" "$backup_dir/storage.tar.gz" "$backup_dir/manifest.json" "$backup_dir/SHA256SUMS"

backup_complete=true

if [ "$api_was_running" = true ]; then
  echo "Restarting API..."
  compose start api >/dev/null
  wait_for_api
  api_was_running=false
fi

trap - 0 1 2 15
echo "Backup complete: $backup_dir"
echo "Verify it with: npm run backup:verify -- \"$backup_dir\""
