#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${repo_dir}/.env"
profile_dir="${repo_dir}/.tunnel-client"
tunnel_bin="${TUNNEL_CLIENT_BIN:-/Users/arvimaantoa/.local/bin/tunnel-client}"
tunnel_alias="${DRACONI_TUNNEL_ALIAS:-draconi-local}"
profile_name="${DRACONI_TUNNEL_PROFILE:-draconi-local}"
mcp_url="${DRACONI_TUNNEL_MCP_URL:-http://127.0.0.1:3100/mcp}"

if [[ ! -x "${tunnel_bin}" ]]; then
  echo "tunnel-client is not executable at ${tunnel_bin}" >&2
  exit 1
fi

if [[ ! -f "${env_file}" ]]; then
  echo "Missing ${env_file}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a

: "${CONTROL_PLANE_TUNNEL_ID:?Set CONTROL_PLANE_TUNNEL_ID in .env}"
: "${CONTROL_PLANE_API_KEY:?Set CONTROL_PLANE_API_KEY in .env}"
: "${DEVELOPMENT_TOKEN:?Set DEVELOPMENT_TOKEN in .env}"

export MCP_EXTRA_HEADERS="Authorization: Bearer ${DEVELOPMENT_TOKEN}"
export MCP_DISCOVERY_EXTRA_HEADERS="${MCP_EXTRA_HEADERS}"

mkdir -p "${profile_dir}"

case "${1:-}" in
  start)
    curl -fsS "${mcp_url%/mcp}/health/live" >/dev/null
    "${tunnel_bin}" runtimes connect \
      --json \
      --alias "${tunnel_alias}" \
      --profile "${profile_name}" \
      --profile-dir "${profile_dir}" \
      --tunnel-id "${CONTROL_PLANE_TUNNEL_ID}" \
      --runtime-api-key env:CONTROL_PLANE_API_KEY \
      --mcp-server-url "${mcp_url}" \
      --tunnel-client-bin "${tunnel_bin}"
    "${tunnel_bin}" runtimes status "${tunnel_alias}" --json
    ;;
  status)
    "${tunnel_bin}" runtimes status "${tunnel_alias}" --json
    ;;
  doctor)
    "${tunnel_bin}" doctor \
      --profile "${profile_name}" \
      --profile-dir "${profile_dir}" \
      --explain \
      --json
    ;;
  stop)
    "${tunnel_bin}" runtimes stop "${tunnel_alias}" --json
    ;;
  *)
    echo "Usage: $0 {start|status|doctor|stop}" >&2
    exit 2
    ;;
esac
