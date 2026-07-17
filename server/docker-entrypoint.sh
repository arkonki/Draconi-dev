#!/bin/sh
set -eu

mkdir -p /data/storage /data/backups
chown -R node:node /data/storage /data/backups
chmod 700 /data/backups

exec su node -s /bin/sh -c 'exec node server/index.js'
