#!/bin/sh
set -eu

mkdir -p /data/storage
chown -R node:node /data/storage

exec su node -s /bin/sh -c 'exec node server/index.js'
