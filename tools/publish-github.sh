#!/usr/bin/env bash
# Publish the current version of this repository to GitHub - one commit per release, without private files.
#
#   tools/publish-github.sh            # uses the defaults below
#   GITHUB_REMOTE=git@github.com:you/z-hop-deck.git tools/publish-github.sh
#
# What it does:
#   1. takes the committed state of this repo (git archive HEAD - uncommitted changes are NOT published)
#   2. leaves out private files (PRIVATE below)
#   3. copies it into a separate working copy of the GitHub repo, commits "Z-Hop Deck <version>",
#      tags v<version> and pushes. The tag starts the GitHub Action that builds the Docker image.
set -euo pipefail

GITHUB_REMOTE="${GITHUB_REMOTE:-git@github.com:er9xuser/z-hop-deck.git}"
PUB_DIR="${PUB_DIR:-$HOME/z-hop-deck-github}"
GIT_NAME="${GIT_NAME:-er9xuser}"
GIT_EMAIL="${GIT_EMAIL:-er9xuser@users.noreply.github.com}"   # GitHub's no-reply address keeps your e-mail private
PRIVATE=(NAVODILA.md app/static/carbon-photo.jpg)

SRC="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SRC"
VER="$(grep -oP 'VERSION = "\K[^"]+' app/app.py)"
[ -n "$VER" ] || { echo "cannot read VERSION from app/app.py"; exit 1; }
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "! uncommitted changes in $SRC are not published - commit them first if you want them on GitHub"
fi

export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o StrictHostKeyChecking=accept-new}"
if [ ! -d "$PUB_DIR/.git" ]; then
  echo "== first run: preparing $PUB_DIR"
  mkdir -p "$PUB_DIR"
  git -C "$PUB_DIR" init -q -b main
  git -C "$PUB_DIR" remote add origin "$GITHUB_REMOTE"
  if git -C "$PUB_DIR" ls-remote --exit-code origin main >/dev/null 2>&1; then
    git -C "$PUB_DIR" fetch -q origin main && git -C "$PUB_DIR" reset -q --hard origin/main
  fi
fi
git -C "$PUB_DIR" config user.name "$GIT_NAME"
git -C "$PUB_DIR" config user.email "$GIT_EMAIL"
git -C "$PUB_DIR" pull -q --ff-only origin main 2>/dev/null || true

if git -C "$PUB_DIR" rev-parse -q --verify "refs/tags/v$VER" >/dev/null; then
  echo "v$VER is already published - bump VERSION in app/app.py for a new release"; exit 1
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git archive HEAD | tar -x -C "$TMP"
for f in "${PRIVATE[@]}"; do rm -rf "${TMP:?}/$f"; done
# replace the working copy with the new snapshot (deleted files disappear too)
find "$PUB_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$TMP/." "$PUB_DIR/"

cd "$PUB_DIR"
git add -A
if git diff --cached --quiet; then echo "nothing changed since the last release"; exit 0; fi
git commit -q -m "Z-Hop Deck $VER"
git tag -a "v$VER" -m "Z-Hop Deck $VER"
git push -q origin main
git push -q origin "v$VER"
echo "== published Z-Hop Deck $VER to $GITHUB_REMOTE"
echo "   the Docker image is being built: https://github.com/${GITHUB_REMOTE#*:}" | sed 's/\.git$/\/actions/'
