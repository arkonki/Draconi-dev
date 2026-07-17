#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/backup-common.sh"

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: sh scripts/verify-backup.sh <backup-directory> [--checksums-only]" >&2
  exit 1
fi

requested_backup=$1
mode=${2:-full}
if [ "$mode" != full ] && [ "$mode" != --checksums-only ]; then
  echo "Unknown verification option: $mode" >&2
  exit 1
fi

case "$requested_backup" in
  /*) ;;
  *) requested_backup="$PROJECT_ROOT/$requested_backup" ;;
esac

if [ ! -d "$requested_backup" ]; then
  echo "Backup directory does not exist: $requested_backup" >&2
  exit 1
fi
backup_dir=$(CDPATH= cd -- "$requested_backup" && pwd -P)

for required_file in database.dump storage.tar.gz manifest.json SHA256SUMS; do
  if [ ! -f "$backup_dir/$required_file" ]; then
    echo "Backup is incomplete; missing: $required_file" >&2
    exit 1
  fi
done

echo "Checking backup checksums..."
verify_checksums "$backup_dir"

require_database
require_command tar

echo "Checking PostgreSQL archive structure..."
compose exec -T db pg_restore --list < "$backup_dir/database.dump" >/dev/null

echo "Checking storage archive structure..."
validate_storage_archive "$backup_dir/storage.tar.gz"

if [ "$mode" = --checksums-only ]; then
  echo "Backup archive and checksums are valid: $backup_dir"
  exit 0
fi

verify_database="dragonbane_verify_$(date -u '+%Y%m%d%H%M%S')_$$"
validate_database_name "$verify_database" "verification database name"
verify_database_created=false
verify_temp_dir=''

cleanup() {
  status=$?
  trap - 0 1 2 15

  if [ "$verify_database_created" = true ]; then
    compose exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$verify_database' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
    compose exec -T db dropdb -U "$DB_USER" --if-exists "$verify_database" >/dev/null 2>&1 || true
  fi

  if [ -n "$verify_temp_dir" ]; then
    case "$verify_temp_dir" in
      */dragonbane-backup-verify.*) rm -rf -- "$verify_temp_dir" ;;
      *) echo "Refusing to clean unexpected verification directory: $verify_temp_dir" >&2 ;;
    esac
  fi

  exit "$status"
}
trap cleanup 0 1 2 15

echo "Restoring into temporary database '$verify_database'..."
compose exec -T db createdb -U "$DB_USER" "$verify_database"
verify_database_created=true
compose exec -T db pg_restore \
  -U "$DB_USER" \
  -d "$verify_database" \
  --no-owner \
  --no-acl \
  --exit-on-error < "$backup_dir/database.dump"

expected_table_count=$(compose exec -T db psql -U "$DB_USER" -d "$verify_database" -At -v ON_ERROR_STOP=1 \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'characters', 'parties', 'app_credentials');")
if [ "$expected_table_count" != 4 ]; then
  echo "Restored database is missing one or more critical tables." >&2
  exit 1
fi

restored_user_count=$(compose exec -T db psql -U "$DB_USER" -d "$verify_database" -At -v ON_ERROR_STOP=1 \
  -c 'SELECT COUNT(*) FROM users;')

verify_temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/dragonbane-backup-verify.XXXXXX")
tar -C "$verify_temp_dir" -xzf "$backup_dir/storage.tar.gz"
restored_file_count=$(find "$verify_temp_dir" -type f | wc -l | tr -d ' ')

echo "Restore verification passed: $restored_user_count users and $restored_file_count uploaded files recovered."
echo "The live database '$DB_NAME' was not modified."
