#!/bin/sh
# Run as PUID/PGID so uploaded files belong to your normal user on the host.
set -e
PUID="${PUID:-0}"
PGID="${PGID:-0}"
mkdir -p "${DATA_DIR:-/data}"
# a writable home for the app user (OpenSCAD, fontconfig etc. keep settings/caches there)
export HOME="${DATA_DIR:-/data}/.home"
mkdir -p "$HOME"
if [ "$PUID" != "0" ]; then
  chown -R "$PUID:$PGID" "${DATA_DIR:-/data}" 2>/dev/null || true
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
fi
exec "$@"
