# Installation

- [Option 1: published Docker image](#option-1-published-docker-image) – quickest
- [Option 2: build from source](#option-2-build-from-source)
- [Option 3: guided install on a fresh machine or Proxmox LXC](#option-3-guided-install-install-sh)
- [Configuration (.env)](#configuration)
- [Behind a reverse proxy](#behind-a-reverse-proxy) · [Single sign-on (Authelia, Authentik)](#single-sign-on)
- [Updating](#updating) · [Backup and restore](#backup-and-restore) · [Troubleshooting](#troubleshooting) · [Development](#development)

---

## Option 1: published Docker image

```bash
mkdir -p /opt/zhopdeck && cd /opt/zhopdeck
curl -fsSLO https://raw.githubusercontent.com/er9xuser/z-hop-deck/main/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/er9xuser/z-hop-deck/main/.env.example -o .env
nano .env
docker compose pull
docker compose up -d
```

In `.env`, set at least:

| | |
|---|---|
| `LIBRARY_PATH` | the folder with your models on the host, e.g. `/srv/3d-models` |
| `APP_PASSWORD` | the password for the login screen |
| `PUID` / `PGID` | the owner of that folder (`id youruser`), so uploaded files belong to you and not to root |

Open `http://<server-ip>:8080`.

The image is available for `linux/amd64` and `linux/arm64`: `ghcr.io/er9xuser/z-hop-deck:latest`, or a fixed version such as `:1.23.0`. To pin a version, set `ZHOPDECK_IMAGE=ghcr.io/er9xuser/z-hop-deck:1.23.0` in `.env`.

## Option 2: build from source

```bash
git clone https://github.com/er9xuser/z-hop-deck.git /opt/zhopdeck
cd /opt/zhopdeck
cp .env.example .env && nano .env
docker compose up -d --build
```

The build downloads three.js, OpenSCAD and the STEP converter, which takes a few minutes the first time. To leave out the big optional parts:

```bash
docker compose build --build-arg WITH_OPENSCAD=0 --build-arg WITH_STEP=0
docker compose up -d
```

## Option 3: guided install (`install.sh`)

On a fresh Debian/Ubuntu machine or LXC, as root:

```bash
apt update && apt install -y git
git clone https://github.com/er9xuser/z-hop-deck.git /opt/zhopdeck
cd /opt/zhopdeck
./install.sh
```

The script installs Docker, creates the user that owns the model files and the library folder, asks for the password and network settings and writes `.env`, can copy a `data/` folder from a backup, then builds and starts Z-Hop Deck and prints its address. It skips anything that is already done, so it is safe to run again. `./install.sh --defaults` runs without questions.

**Proxmox LXC:** a Debian 12/13 container with 2 CPU cores, 2–3 GB RAM, 1 GB swap and *nesting* enabled (Options → Features → `nesting=1`) works well. Docker inside an unprivileged LXC is fine.

---

## Configuration

All settings are environment variables in `.env` next to `docker-compose.yml`. The compose file itself contains no passwords or addresses.

| Variable | Default | |
|---|---|---|
| `LIBRARY_PATH` | – | Folder with your models on the host. Mounted as `/library` in the container. |
| `APP_PASSWORD` | *(empty)* | Password for the login screen. Empty = no login (only on a network you trust). |
| `PUID` / `PGID` | `0` (root) | User/group the app runs as, so files it writes belong to you on the host. `.env.example` sets `1000`. |
| `TRUSTED_NETWORKS` | *(empty)* | IPs or subnets that never need the password, e.g. `192.168.1.20,192.168.1.0/24`. |
| `AUTH_PROXY_IPS` | *(empty)* | IP(s) of a reverse proxy that does single sign-on. Requests from there with the user header are logged in. |
| `AUTH_PROXY_HEADER` | `Remote-User` | Header with the user name from the proxy. |
| `LOGOUT_URL` | *(empty)* | Where *Log out* sends you when signed in through the proxy, e.g. `https://auth.example.lan/logout`. |
| `PUBLIC_URL` | *(auto)* | Address slicers download from for *Open in slicer*, e.g. `http://192.168.1.10:8080`. Only needed when auto-detection is wrong. |
| `SPOOLMAN_URL` | *(empty)* | Spoolman as the server reaches it, e.g. `http://192.168.1.30:7912`. Can also be set in Settings. |
| `SPOOLMAN_WEB_URL` | *(empty)* | Spoolman link for the browser, if different. |
| `TZ` | `UTC` | Time zone, e.g. `Europe/Berlin`. |
| `PORT` | `8080` | Port on the host. |
| `SCAN_INTERVAL` | `30` | Minutes between automatic rescans (0 = off). Also in Settings. |
| `MAX_UPLOAD_MB` | `4096` | Largest upload. |
| `MEM_LIMIT` | `2g` | Container memory limit. |
| `THREADS` | `16` | Parallel requests. |
| `LIBRARY_DIRS` | `/library` | Several libraries: comma-separated container paths, each mounted as its own volume. |
| `OPENSCADPATH` | *(empty)* | Folders with OpenSCAD libraries (BOSL2, NopSCADlib…) inside the container, e.g. `/library/_libs`. |
| `SCAD_TIMEOUT` / `STEP_TIMEOUT` | `180` / `300` | Seconds allowed to render one OpenSCAD file / convert one STEP file. |
| `STEP_TOLERANCE` | `0.05` | Mesh accuracy of STEP conversion in mm. |
| `ZHOPDECK_IMAGE` | `ghcr.io/er9xuser/z-hop-deck:latest` | Image to run (pin a version, or name your own build). |

Prices, currency, electricity cost, slicer buttons, preview colour, theme and background are set in **Settings** inside the app.

### Several model folders

```yaml
# docker-compose.override.yml
services:
  zhopdeck:
    environment:
      - LIBRARY_DIRS=/library,/nas
    volumes:
      - /mnt/nas/3d:/nas
```

If a network share is not mounted when a scan runs, its files are **not** marked missing – nothing is lost when the NAS is offline.

---

## Behind a reverse proxy

Z-Hop Deck works on a (sub)domain behind Nginx, Nginx Proxy Manager, Traefik, Caddy and similar. Raise the upload limit and turn off request buffering, e.g. for Nginx / NPM (*Advanced* tab):

```nginx
client_max_body_size 4096m;
proxy_request_buffering off;
proxy_read_timeout 900s;
```

## Single sign-on

With Authelia, Authentik, oauth2-proxy and similar in front of the app:

1. Set `AUTH_PROXY_IPS` to the IP of the reverse proxy and keep `APP_PASSWORD` set.
2. Make the proxy forward the user name. Authelia's standard Nginx snippet does that:
   ```nginx
   auth_request_set $user $upstream_http_remote_user;
   proxy_set_header Remote-User $user;
   ```
3. Set `LOGOUT_URL` to the logout page of your login portal.

Requests **through the proxy** are logged in by the proxy; requests **straight to** `http://host:8080` still need the app password. The header is only trusted from the proxy's real IP, so another machine on the network cannot fake it.

If your login portal lets some IPs in without a password (Authelia `bypass` rule), put the same IPs into `TRUSTED_NETWORKS`, so the app doesn't ask either.

**Slicer downloads** (*Open in slicer*) use signed links that expire after one hour and need no login. If slicers can't download through your proxy (self-signed certificate, login redirect), set `PUBLIC_URL=http://<docker-host-ip>:8080` and allow that port from your PCs.

---

## Updating

Published image:

```bash
cd /opt/zhopdeck
docker compose pull && docker compose up -d
```

From source:

```bash
cd /opt/zhopdeck
git pull && docker compose up -d --build
```

The database is upgraded automatically on start. Previews are regenerated only when a new version renders them differently. After an update, reload the page with **Ctrl+F5**.

## Backup and restore

| What | Where | |
|---|---|---|
| Database (tags, collections, notes, print log, spools, printers, settings) | `data/zhopdeck.db` | **Settings → Download backup** gives a consistent copy while the app runs |
| Previews | `data/thumbs/` | regenerated if missing |
| Deleted files | `data/trash/` | until you empty the trash in Settings |
| Your models | `LIBRARY_PATH` | not part of the app backup – back up that folder yourself |
| Settings | `.env` | |

Restore: **Settings → Restore backup**, or stop the app and copy the files back into `data/`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Upload fails with "no write permission" | `PUID`/`PGID` must match the owner of `LIBRARY_PATH` (`ls -ln`, `id youruser`). |
| Upload through the proxy fails with 413 | Raise the proxy's upload limit (`client_max_body_size`). |
| *Open in slicer* does nothing | The slicer must be installed on the PC you browse from (its installer registers `orcaslicer://` / `cura://`). The PC must reach `PUBLIC_URL`. |
| Printer shows "got a web page instead of printer data" | The printer address points to a login page. Use the printer's IP, put the nice domain into *Web address*. |
| The 3D view keeps loading / "too large for the server's memory" | The model is too big for `MEM_LIMIT`. Raise it (e.g. `3g`), then Settings → *Regenerate all previews*. |
| Something hangs | `docker compose logs --tail 200`. Requests that take unusually long are written to the log as `watchdog: … still running` with the place where they stopped; if most threads are stuck the app restarts itself. |
| Page looks broken after an update | Ctrl+F5. |

Useful commands:

```bash
docker compose logs -f --tail 100      # what's happening
docker compose restart                 # restart the app
docker stats --no-stream zhopdeck      # memory use
docker exec zhopdeck env | sort        # settings the app sees
```

---

## Development

```
z-hop-deck/
├── Dockerfile, docker-compose.yml, entrypoint.sh, install.sh, requirements.txt
├── .github/workflows/docker.yml   builds the image for ghcr.io on every version tag
└── app/
    ├── app.py        Flask REST API, auth, OctoPrint-compatible upload endpoint
    ├── library.py    scanner, hashing, analysis worker, model folders, file operations
    ├── meshes.py     STL/OBJ/3MF loaders (incl. colours), stats, software renderer
    ├── parsers.py    G-code / 3MF slicer metadata and thumbnails
    ├── printers.py   Moonraker / OctoPrint / PrusaLink client
    ├── spoolman.py   Spoolman sync
    ├── autolog.py    automatic print log from Moonraker job history
    ├── db.py         SQLite schema and migrations
    └── static/       single-page UI (vanilla JS, no build step) + three.js viewer
```

Run without Docker:

```bash
pip install -r requirements.txt
cd app && DATA_DIR=./data LIBRARY_DIRS=/path/to/models flask --app app run --debug
```

Put three.js `build/` and `addons/controls/OrbitControls.js` under `app/static/vendor/three/` for the 3D viewer (the Dockerfile does this for you). Previews are rendered on the server in pure Python/NumPy – no GPU or headless browser needed.
