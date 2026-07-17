#!/bin/sh

# Shared helpers for the local PostgreSQL backup, verification, and restore tools.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

compose() {
  (cd "$PROJECT_ROOT" && docker compose "$@")
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

validate_database_name() {
  value=$1
  label=$2

  case "$value" in
    ''|*[!A-Za-z0-9_]*)
      echo "Unsafe $label: only letters, numbers, and underscores are supported." >&2
      exit 1
      ;;
  esac
}

require_database() {
  require_command docker

  if ! compose ps --status running --services 2>/dev/null | grep -qx 'db'; then
    echo "The PostgreSQL container is not running. Start it with: npm run docker:up" >&2
    exit 1
  fi

  DB_USER=$(compose exec -T db sh -c 'printf %s "$POSTGRES_USER"')
  DB_NAME=$(compose exec -T db sh -c 'printf %s "$POSTGRES_DB"')

  validate_database_name "$DB_USER" "database user"
  validate_database_name "$DB_NAME" "database name"
}

reject_system_database() {
  case "$1" in
    postgres|template0|template1)
      echo "Refusing to restore over PostgreSQL system database: $1" >&2
      exit 1
      ;;
  esac
}

absolute_path() {
  requested_path=$1
  requested_parent=$(dirname -- "$requested_path")
  requested_name=$(basename -- "$requested_path")

  mkdir -p "$requested_parent"
  resolved_parent=$(CDPATH= cd -- "$requested_parent" && pwd -P)
  printf '%s/%s\n' "$resolved_parent" "$requested_name"
}

file_size() {
  if stat -f '%z' "$1" >/dev/null 2>&1; then
    stat -f '%z' "$1"
  else
    stat -c '%s' "$1"
  fi
}

write_checksums() {
  checksum_dir=$1

  if command -v shasum >/dev/null 2>&1; then
    (cd "$checksum_dir" && shasum -a 256 database.dump storage.tar.gz manifest.json)
  elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$checksum_dir" && sha256sum database.dump storage.tar.gz manifest.json)
  else
    echo "Neither shasum nor sha256sum is available." >&2
    exit 1
  fi
}

verify_checksums() {
  checksum_dir=$1

  if command -v shasum >/dev/null 2>&1; then
    (cd "$checksum_dir" && shasum -a 256 -c SHA256SUMS)
  elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$checksum_dir" && sha256sum -c SHA256SUMS)
  else
    echo "Neither shasum nor sha256sum is available." >&2
    exit 1
  fi
}

validate_storage_archive() {
  archive_path=$1

  tar -tzf "$archive_path" | while IFS= read -r archive_entry; do
    case "$archive_entry" in
      /*)
        echo "Unsafe absolute path in storage archive: $archive_entry" >&2
        exit 1
        ;;
    esac
    case "/$archive_entry/" in
      */../*)
        echo "Unsafe parent traversal in storage archive: $archive_entry" >&2
        exit 1
        ;;
    esac
  done

  tar -tvzf "$archive_path" | while IFS= read -r archive_entry; do
    case "$archive_entry" in
      d*|-*) ;;
      *)
        echo "Storage archive contains an unsupported link or special file: $archive_entry" >&2
        exit 1
        ;;
    esac
  done
}

api_is_running() {
  compose ps --status running --services 2>/dev/null | grep -qx 'api'
}

wait_for_api() {
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    if compose exec -T api wget -q -O /dev/null http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  echo "The API did not become healthy within 30 seconds." >&2
  return 1
}
