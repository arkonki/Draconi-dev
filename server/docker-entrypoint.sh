#!/bin/sh
set -eu

mkdir -p /data/storage /data/backups
chown -R node:node /data/storage /data/backups
chmod 700 /data/backups

case "${DRACONI_SERVICE:-api}" in
  api)
    entrypoint="server/index.js"
    ;;
  mcp)
    entrypoint="server/mcp/index.js"
    ;;
  *)
    echo "Unknown DRACONI_SERVICE: ${DRACONI_SERVICE}" >&2
    exit 1
    ;;
esac

exec su node -s /bin/sh -c "exec node ${entrypoint}"
