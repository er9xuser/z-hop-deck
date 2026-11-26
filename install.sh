#!/usr/bin/env bash
# Z-Hop Deck installer for a fresh Debian/Ubuntu machine or LXC (run as root, from the cloned repo):
#
#   git clone <repo> /opt/kontejner/zhopdeck && cd /opt/kontejner/zhopdeck && ./install.sh
#
# What it does (each step is skipped when already done, so it is safe to run again):
#   1. installs Docker + git
#   2. creates the user that owns the model files and the library folder
#   3. creates .env (asks for passwords / IPs) – or keeps an existing one
#   4. optionally copies an existing data/ folder (database, previews) from a backup
#   5. builds and starts the container and waits until the app answers
#
# Options:  --defaults   don't ask, use the defaults (or the values already in .env)
#           --no-start   prepare everything, but don't build/start the container
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
DEFAULTS=0
START=1
for a in "$@"; do
  case "$a" in
    --defaults) DEFAULTS=1 ;;
    --no-start) START=0 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 1 ;;
  esac
done

c_ok=$'\e[32m'; c_hd=$'\e[1;33m'; c_er=$'\e[31m'; c_0=$'\e[0m'
step() { echo; echo "${c_hd}==> $*${c_0}"; }
ok()   { echo "${c_ok}✓${c_0} $*"; }
die()  { echo "${c_er}✗ $*${c_0}" >&2; exit 1; }

# ask "Question" default  -> echoes the answer
ask() {
  local q="$1" def="${2-}" ans
  if [ "$DEFAULTS" = 1 ] || [ ! -t 0 ]; then echo "$def"; return; fi
  read -r -p "$q${def:+ [$def]}: " ans </dev/tty || true
  echo "${ans:-$def}"
}

# set_env KEY VALUE  – replace or append a line in .env (value is never interpreted by sed/shell)
set_env() {
  VAL="$2" awk -v k="$1" 'BEGIN { v = ENVIRON["VAL"]; done = 0 }
    $0 ~ "^"k"=" { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' .env > .env.tmp && mv .env.tmp .env
}
get_env() { [ -f .env ] && grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }

[ "$(id -u)" = 0 ] || die "please run as root (sudo ./install.sh)"
[ -f docker-compose.yml ] && [ -f Dockerfile ] || die "run this from the Z-Hop Deck folder (where docker-compose.yml is)"
. /etc/os-release
case "${ID:-}" in debian|ubuntu) ;; *) die "this script supports Debian and Ubuntu (found: ${ID:-unknown})" ;; esac
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

# ---------------------------------------------------------------- 1. Docker
step "1/5 Docker"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker is installed ($(docker --version | cut -d, -f1))"
else
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git >/dev/null
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
  ok "Docker installed"
fi
if ! docker info >/dev/null 2>&1; then
  die "Docker does not run. In a Proxmox LXC enable Options → Features → nesting=1 (and keyctl=1 for unprivileged containers), restart the LXC and run this script again."
fi
command -v git >/dev/null 2>&1 || apt-get install -y -qq git >/dev/null

# ---------------------------------------------------------------- 2. user + library folder
step "2/5 Files user and library folder"
[ -f .env ] || cp .env.example .env
chmod 600 .env
CUR_LIB="$(get_env LIBRARY_PATH)"
FUSER="$(ask "User that owns the model files" "$( [ -n "$CUR_LIB" ] && stat -c %U "$CUR_LIB" 2>/dev/null || echo print)")"
if id "$FUSER" >/dev/null 2>&1; then
  ok "user $FUSER exists"
else
  useradd -m -s /bin/bash "$FUSER"
  ok "user $FUSER created (set a password later with: passwd $FUSER)"
fi
FUID="$(id -u "$FUSER")"; FGID="$(id -g "$FUSER")"
LIB="$(ask "Folder with your 3D model files" "${CUR_LIB:-/home/$FUSER/printfiles}")"
mkdir -p "$LIB"
chown "$FUSER:$FGID" "$LIB"
ok "library: $LIB (uid $FUID, gid $FGID)"
set_env LIBRARY_PATH "$LIB"
set_env PUID "$FUID"
set_env PGID "$FGID"

# ---------------------------------------------------------------- 3. .env
step "3/5 Settings (.env)"
CUR_PW="$(get_env APP_PASSWORD)"
if [ -z "$CUR_PW" ] || [ "$CUR_PW" = "change-me" ]; then
  GEN_PW="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20 || true)"
  set_env APP_PASSWORD "$(ask "App password (used when someone opens :8080 directly)" "$GEN_PW")"
else
  set_env APP_PASSWORD "$(ask "App password" "$CUR_PW")"
fi
CUR_PORT="$(get_env PORT)"; PORT="$(ask "Port" "${CUR_PORT:-8080}")"; set_env PORT "$PORT"
CUR_PUB="$(get_env PUBLIC_URL)"
case "$CUR_PUB" in ""|*YY*) CUR_PUB="http://${HOST_IP}:${PORT}" ;; esac
set_env PUBLIC_URL "$(ask "Address of this server for slicer links" "$CUR_PUB")"
set_env AUTH_PROXY_IPS "$(ask "IP of your reverse proxy with Authelia (NPMplus), empty = none" "$(get_env AUTH_PROXY_IPS)")"
set_env TRUSTED_NETWORKS "$(ask "IPs/subnets that never need a password (comma separated), empty = none" "$(get_env TRUSTED_NETWORKS)")"
set_env LOGOUT_URL "$(ask "Logout URL of Authelia, empty = none" "$(get_env LOGOUT_URL)")"
set_env SPOOLMAN_URL "$(ask "Spoolman address for the server, empty = none" "$(get_env SPOOLMAN_URL)")"
set_env SPOOLMAN_WEB_URL "$(ask "Spoolman address for the browser, empty = same" "$(get_env SPOOLMAN_WEB_URL)")"
set_env TZ "$(ask "Time zone" "$(get_env TZ | grep . || cat /etc/timezone 2>/dev/null || echo UTC)")"
ok ".env written (only on this machine – it is not in git)"

# ---------------------------------------------------------------- 4. existing data
step "4/5 Existing data (optional)"
if [ -f data/zhopdeck.db ] || [ -f data/layerdeck.db ]; then
  ok "data/ already contains a database – kept"
else
  SRC="$(ask "Path to a data/ folder from a backup to copy (empty = start fresh)" "")"
  if [ -n "$SRC" ]; then
    [ -f "$SRC/zhopdeck.db" ] || [ -f "$SRC/layerdeck.db" ] || die "no zhopdeck.db (or layerdeck.db) in $SRC"
    mkdir -p data && cp -a "$SRC/." data/
    ok "data copied from $SRC"
  else
    ok "starting with an empty database (tip: Settings → Restore backup can import a .db later)"
  fi
fi
mkdir -p data
chown -R "$FUID:$FGID" data

# ---------------------------------------------------------------- 5. build + start
step "5/5 Build and start"
if [ "$START" = 0 ]; then
  ok "skipped (--no-start). Start later with: docker compose up -d --build"
  exit 0
fi
docker compose up -d --build
echo -n "waiting for Z-Hop Deck "
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/me" >/dev/null 2>&1; then
    echo; ok "Z-Hop Deck is running"
    VER="$(curl -fsS "http://127.0.0.1:${PORT}/api/me" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')"
    echo
    echo "  Version:   ${VER:-?}"
    echo "  Open:      http://${HOST_IP}:${PORT}"
    echo "  Models:    $LIB"
    echo "  Settings:  $(pwd)/.env   (docker compose up -d   after changes)"
    echo
    if docker exec zhopdeck python -c "import trimesh, cascadio" >/dev/null 2>&1; then ok "STEP previews available"; else echo "  (STEP previews not available on this platform)"; fi
    if docker exec zhopdeck sh -c "command -v openscad" >/dev/null 2>&1; then ok "OpenSCAD available"; fi
    echo
    echo "Next: point NPMplus / the firewall / Orca to http://${HOST_IP}:${PORT} if this is a new machine."
    exit 0
  fi
  echo -n "."; sleep 2
done
echo
die "Z-Hop Deck did not answer within 3 minutes – check: docker compose logs --tail 50"
