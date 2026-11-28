"""Z-Hop Deck - self-hosted 3D print library."""
import csv
import io
import ipaddress
import re
import json
import logging
import os
import secrets
import shutil
import sys
import sqlite3
import tempfile
import threading
import time
import zipfile
from datetime import timedelta
from functools import wraps

from flask import Flask, Response, abort, jsonify, redirect, request, send_file, send_from_directory, session
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from PIL import Image
from werkzeug.middleware.proxy_fix import ProxyFix

import db
import library as lib
import meshes
import printers as prn
import spoolman as sm
import autolog

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("zhopdeck")

VERSION = "1.25.5"  # bump on every release - shown in the UI
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "4096"))
STATUSES = ["none", "want", "queued", "printing", "printed", "failed"]

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
# honour X-Forwarded-* headers from a reverse proxy (NPM, Traefik, Caddy...) so generated links are correct
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

# --------------------------------------------------------------------------- request watchdog
# Every request (including streaming the response body) is tracked. A request that runs unusually long gets its
# stack written to the log once, so a hang can be diagnosed with `docker compose logs`. If most worker threads are
# stuck, the worker exits and gunicorn starts a fresh one (the UI recovers on its own instead of spinning forever).
THREADS = int(os.environ.get("THREADS", "16"))
SLOW_REQUEST_S = int(os.environ.get("SLOW_REQUEST_S", "120"))
STUCK_REQUEST_S = int(os.environ.get("STUCK_REQUEST_S", "600"))
LONG_PATHS = ("/api/upload", "/p/", "/api/files/local", "/api/printers/", "/api/backup", "/api/restore", "/dl/",
              "/api/files/zip", "/api/rethumb", "/api/scan")
_inflight = {}
_inflight_lock = threading.Lock()


class _RequestTracker:
    def __init__(self, wsgi):
        self.wsgi = wsgi

    def __call__(self, environ, start_response):
        key = object()
        entry = {"t": time.monotonic(), "m": environ.get("REQUEST_METHOD", ""), "p": environ.get("PATH_INFO", ""),
                 "th": threading.get_ident(), "warned": False}
        with _inflight_lock:
            _inflight[key] = entry

        def done():
            with _inflight_lock:
                _inflight.pop(key, None)
        try:
            it = self.wsgi(environ, start_response)
        except BaseException:
            done()
            raise
        orig = getattr(it, "close", None)

        heavy = entry["p"].endswith(("/mesh", "/gcode", "/rendered.stl")) or (
            entry["p"].startswith("/api/bundles/") and entry["p"].endswith("/thumb"))

        def close():
            try:
                if orig:
                    orig()
            finally:
                done()
                if heavy:
                    lib.release_memory()
        try:
            it.close = close  # keeps gunicorn's sendfile path for file downloads
            return it
        except AttributeError:
            return _ClosingIter(it, close)


class _ClosingIter:
    def __init__(self, it, close):
        self._it, self.close = it, close

    def __iter__(self):
        return iter(self._it)


def _stack_of(ident):
    import traceback
    fr = sys._current_frames().get(ident)
    return "".join(traceback.format_stack(fr)) if fr else "(thread gone)"


def _watchdog():
    while True:
        time.sleep(15)
        try:
            now = time.monotonic()
            with _inflight_lock:
                items = list(_inflight.values())
            stuck = 0
            for e in items:
                age = now - e["t"]
                if e["p"].startswith(LONG_PATHS):
                    continue
                if age > SLOW_REQUEST_S and not e["warned"]:
                    e["warned"] = True
                    log.warning("watchdog: %s %s still running after %ds (%d requests in flight)\n%s",
                                e["m"], e["p"], age, len(items), _stack_of(e["th"]))
                if age > STUCK_REQUEST_S:
                    stuck += 1
            if stuck >= max(2, THREADS // 2):
                log.error("watchdog: %d of %d threads stuck for more than %ds - restarting the worker", stuck, THREADS,
                          STUCK_REQUEST_S)
                for ident, fr in sys._current_frames().items():
                    log.error("thread %s:\n%s", ident, _stack_of(ident))
                logging.shutdown()
                os._exit(3)  # gunicorn starts a new worker
        except Exception:
            log.exception("watchdog")


app.wsgi_app = _RequestTracker(app.wsgi_app)
PUBLIC_URL = os.environ.get("PUBLIC_URL", "").rstrip("/")

# Single sign-on through a reverse proxy (Authelia, Authentik, oauth2-proxy...):
# requests that come *from* one of these addresses and carry the user header are trusted.
AUTH_PROXY_HEADER = os.environ.get("AUTH_PROXY_HEADER", "Remote-User")
AUTH_PROXY_NETS = []
for _n in os.environ.get("AUTH_PROXY_IPS", "").split(","):
    if _n.strip():
        AUTH_PROXY_NETS.append(ipaddress.ip_network(_n.strip(), strict=False))
# Clients from these IPs/subnets never need a password (e.g. your PC, or the LAN that Authelia bypasses).
TRUSTED_NETS = [ipaddress.ip_network(n.strip(), strict=False)
                for n in os.environ.get("TRUSTED_NETWORKS", "").split(",") if n.strip()]


def _secret_key():
    p = os.path.join(db.DATA_DIR, "secret.key")
    if os.path.exists(p):
        return open(p).read().strip()
    k = secrets.token_hex(32)
    with open(p, "w") as f:
        f.write(k)
    os.chmod(p, 0o600)
    return k


db.init()
app.secret_key = _secret_key()


# --------------------------------------------------------------------------- helpers
def body():
    return request.get_json(silent=True) or {}


def public_error(e):
    """Message of an expected error that is safe to show in the browser (no paths, no internals)."""
    if isinstance(e, OSError):
        return e.strerror or "file system error"
    return str(e)[:300]


def err(msg, code=400):
    return jsonify({"error": msg}), code


def num(v, default=None, cast=float):
    try:
        return cast(v)
    except (TypeError, ValueError):
        return default


def _peer():
    return request.environ.get("werkzeug.proxy_fix.orig", {}).get("REMOTE_ADDR") or request.environ.get("REMOTE_ADDR")


def _in(ip, nets):
    try:
        a = ipaddress.ip_address(ip)
    except (TypeError, ValueError):
        return False
    return any(a in n for n in nets)


def client_ip():
    """Real client address. X-Forwarded-For is only believed when the request comes from a trusted proxy."""
    peer = _peer()
    if _in(peer, AUTH_PROXY_NETS):
        xff = [x.strip() for x in (request.headers.get("X-Forwarded-For") or "").split(",") if x.strip()]
        if xff:
            return xff[-1]  # the address the proxy itself saw
    return peer


def trusted_client():
    return bool(TRUSTED_NETS) and _in(client_ip(), TRUSTED_NETS)


def proxy_user():
    """User name forwarded by a trusted auth proxy, else None. Uses the real TCP peer, not X-Forwarded-For."""
    if not AUTH_PROXY_NETS:
        return None
    peer = request.environ.get("werkzeug.proxy_fix.orig", {}).get("REMOTE_ADDR") or request.environ.get("REMOTE_ADDR")
    try:
        ip = ipaddress.ip_address(peer)
    except (TypeError, ValueError):
        return None
    if any(ip in n for n in AUTH_PROXY_NETS):
        return request.headers.get(AUTH_PROXY_HEADER) or None
    return None


OCTO_RE = re.compile(r"^(/p/\d+)?/api/(version|files/local|server)$")


def octo_key_ok():
    k = request.headers.get("X-Api-Key") or request.args.get("apikey") or ""
    real = db.setting("octo_api_key", "")
    return bool(real) and secrets.compare_digest(k, real)


def _same_origin():
    """Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE. Reject requests coming from another site
    (CSRF): important because trusted networks / proxy headers authenticate without a cookie."""
    origin = request.headers.get("Origin")
    if not origin:
        return True  # non-browser clients (OrcaSlicer, curl) and same-origin requests of some browsers
    from urllib.parse import urlsplit
    o = urlsplit(origin)
    host = request.host.split(":")[0]
    fwd = (request.headers.get("X-Forwarded-Host") or "").split(",")[0].strip().split(":")[0]
    return o.hostname in {host, fwd} or (PUBLIC_URL and o.hostname == urlsplit(PUBLIC_URL).hostname)


@app.before_request
def auth_gate():
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and not _same_origin():
        log.warning("blocked cross-site %s %s from Origin %s", request.method, request.path, request.headers.get("Origin"))
        return err("cross-site request blocked", 403)
    if OCTO_RE.match(request.path) and octo_key_ok():
        return
    if not APP_PASSWORD or proxy_user() or trusted_client():
        return
    p = request.path
    if (p.startswith("/api/") or (p.startswith("/p/") and "/api/" in p)) and p not in ("/api/login", "/api/me") \
            and not session.get("auth"):
        return err("login required", 401)


@app.after_request
def headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    return resp


def tags_for(ids):
    if not ids:
        return {}
    marks = ",".join("?" * len(ids))
    out = {i: [] for i in ids}
    for r in db.q(f"""SELECT ft.file_id, t.id, t.name, t.color FROM file_tags ft JOIN tags t ON t.id=ft.tag_id
                      WHERE ft.file_id IN ({marks}) ORDER BY t.name""", ids):
        out[r["file_id"]].append({"id": r["id"], "name": r["name"], "color": r["color"]})
    return out


def colls_for(ids):
    if not ids:
        return {}
    marks = ",".join("?" * len(ids))
    out = {}
    for r in db.q(f"""SELECT cf.file_id, c.id, c.name, c.color FROM collection_files cf JOIN collections c
                      ON c.id=cf.collection_id WHERE cf.file_id IN ({marks}) ORDER BY LOWER(c.name)""", list(ids)):
        out.setdefault(r["file_id"], []).append({"id": r["id"], "name": r["name"], "color": r["color"]})
    return out


def attach_colls(items):
    """Adds `collections` to list items; a model folder is in a collection when any of its parts is."""
    ids = set()
    for it in items:
        ids.update(it["part_ids"] if it.get("type") == "bundle" else [it["id"]])
    cm = colls_for(sorted(ids))
    for it in items:
        seen = {}
        for fid in (it["part_ids"] if it.get("type") == "bundle" else [it["id"]]):
            for c in cm.get(fid, []):
                seen.setdefault(c["id"], c)
        it["collections"] = sorted(seen.values(), key=lambda c: c["name"].lower())
    return items


def est_grams(f, meta, settings):
    if meta.get("filament_g"):
        return meta["filament_g"]
    if f.get("volume_cm3"):
        dens = num(settings.get("default_density"), 1.24)
        fill = num(settings.get("mesh_fill_factor"), 0.45)
        return round(f["volume_cm3"] * dens * fill, 1)
    return None


def serialize(f, tags=None, settings=None, full=False):
    meta = db.loads(f.get("meta"))
    settings = settings or db.settings()
    d = {k: f[k] for k in ("id", "name", "ext", "kind", "folder", "root", "size", "mtime", "added_at", "missing",
                           "thumb", "dim_x", "dim_y", "dim_z", "triangles", "volume_cm3", "title", "rating",
                           "favorite", "status", "designer", "license", "source_url", "sha256", "error")}
    d["display_name"] = f["title"] or f["name"].rsplit(".", 1)[0]
    d["print_time_s"] = meta.get("print_time_s")
    d["grams"] = est_grams(f, meta, settings)
    d["grams_estimated"] = not meta.get("filament_g") or meta.get("filament_g_estimated", False)
    d["material"] = meta.get("material")
    d["layer_height"] = meta.get("layer_height")
    d["tags"] = tags or []
    d["thumb_v"] = int(f["mtime"] or 0) + (f["thumb"] or 0) * 7 + (f["analyzed"] or 0)
    if full:
        d["meta"] = meta
        d["notes"] = f["notes"]
        d["area_cm2"] = f["area_cm2"]
        d["path"] = f["path"]
        d["analyzed"] = f["analyzed"] >= lib.ANALYZER_VERSION
    return d


def get_file(fid):
    f = db.q1("SELECT * FROM files WHERE id=?", (fid,))
    if not f:
        abort(404)
    return f


def set_tags(fid, names, mode="replace"):
    names = [n.strip()[:60] for n in names if n and n.strip()]
    ids = []
    for n in names:
        r = db.q1("SELECT id FROM tags WHERE name=?", (n,))
        ids.append(r["id"] if r else db.ex("INSERT INTO tags(name) VALUES (?)", (n,)))
    if mode == "replace":
        db.ex("DELETE FROM file_tags WHERE file_id=?", (fid,))
    if mode == "remove":
        for t in ids:
            db.ex("DELETE FROM file_tags WHERE file_id=? AND tag_id=?", (fid, t))
    else:
        for t in ids:
            db.ex("INSERT OR IGNORE INTO file_tags(file_id, tag_id) VALUES (?,?)", (fid, t))


# --------------------------------------------------------------------------- auth
@app.get("/api/me")
def me():
    user = proxy_user()
    return jsonify({"auth_required": bool(APP_PASSWORD), "version": VERSION, "user": user,
                    "authenticated": bool(user) or bool(session.get("auth")) or not APP_PASSWORD or trusted_client(),
                    "trusted": trusted_client() and not user, "client_ip": client_ip(),
                    "session": bool(session.get("auth")), "logout_url": db.setting("logout_url", "") or ""})


@app.post("/api/login")
def login():
    if not APP_PASSWORD:
        return jsonify({"ok": True})
    if secrets.compare_digest(str(body().get("password", "")), APP_PASSWORD):
        session.permanent = True
        session["auth"] = True
        return jsonify({"ok": True})
    time.sleep(1.0)
    return err("wrong password", 403)


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


# --------------------------------------------------------------------------- files
SORTS = {"name": "LOWER(COALESCE(f.title, f.name))", "added": "f.added_at", "modified": "f.mtime", "size": "f.size",
         "rating": "f.rating", "height": "f.dim_z", "volume": "f.volume_cm3", "random": "RANDOM()",
         "print_time": "CAST(json_extract(f.meta,'$.print_time_s') AS REAL)",
         "folder": "LOWER(f.folder || '/' || f.name)"}


def build_filter(args):
    where, params = ["1=1"], []
    if args.get("missing") == "1":
        where.append("f.missing=1")
    elif args.get("missing") != "all":
        where.append("f.missing=0")
    for term in (args.get("q") or "").split():
        low = term.lower()
        if ":" in low and low.split(":", 1)[0] in ("tag", "ext", "status", "designer", "material"):
            key, val = term.split(":", 1)
            key = key.lower()
            if key == "tag":
                where.append("EXISTS (SELECT 1 FROM file_tags ft JOIN tags t ON t.id=ft.tag_id WHERE ft.file_id=f.id AND t.name LIKE ?)")
                params.append(val.replace("*", "%"))
            elif key == "ext":
                where.append("f.ext=?"); params.append(val.lower().lstrip("."))
            elif key == "status":
                where.append("f.status=?"); params.append(val.lower())
            elif key == "designer":
                where.append("f.designer LIKE ?"); params.append(f"%{val}%")
            elif key == "material":
                where.append("json_extract(f.meta,'$.material') LIKE ?"); params.append(f"%{val}%")
            continue
        neg = term.startswith("-") and len(term) > 1
        t = f"%{term[1:] if neg else term}%"
        clause = ("(f.name LIKE ? OR COALESCE(f.title,'') LIKE ? OR f.folder LIKE ? OR COALESCE(f.notes,'') LIKE ? "
                  "OR COALESCE(f.designer,'') LIKE ? "
                  "OR EXISTS (SELECT 1 FROM file_tags ft JOIN tags tg ON tg.id=ft.tag_id WHERE ft.file_id=f.id AND tg.name LIKE ?))")
        where.append(("NOT " if neg else "") + clause)
        params += [t] * 6
    if args.get("kind"):
        kinds = args["kind"].split(",")
        where.append(f"f.kind IN ({','.join('?' * len(kinds))})"); params += kinds
    if args.get("ext"):
        exts = args["ext"].lower().split(",")
        where.append(f"f.ext IN ({','.join('?' * len(exts))})"); params += exts
    if args.get("status"):
        sts = args["status"].split(",")
        where.append(f"f.status IN ({','.join('?' * len(sts))})"); params += sts
    if args.get("tag"):
        for tid in args["tag"].split(","):
            where.append("EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id=f.id AND ft.tag_id=?)")
            params.append(num(tid, 0, int))
    if args.get("untagged") == "1":
        where.append("NOT EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id=f.id)")
    if args.get("collection"):
        where.append("EXISTS (SELECT 1 FROM collection_files cf WHERE cf.file_id=f.id AND cf.collection_id=?)")
        params.append(num(args["collection"], 0, int))
    if args.get("favorite") == "1":
        where.append("f.favorite=1")
    if args.get("added_days"):
        where.append("f.added_at >= datetime('now', ?)"); params.append(f"-{num(args['added_days'], 7, int)} days")
    if args.get("in_queue") == "1":
        where.append("EXISTS (SELECT 1 FROM queue qq WHERE qq.file_id=f.id)")
    if args.get("min_rating"):
        where.append("f.rating>=?"); params.append(num(args["min_rating"], 0, int))
    if args.get("root"):
        where.append("f.root=?"); params.append(args["root"])
    if "folder" in args and args.get("folder") is not None and args.get("root"):
        fo = args["folder"].strip("/")
        if args.get("recursive", "1") == "1":
            if fo:
                where.append("(f.folder=? OR substr(f.folder, 1, ?) = ?)"); params += [fo, len(fo) + 1, fo + "/"]
        else:
            where.append("f.folder=?"); params.append(fo)
    if args.get("printer"):
        p = db.q1("SELECT * FROM printers WHERE id=?", (num(args["printer"], 0, int),))
        if p:
            where.append("(f.dim_x IS NULL OR ((f.dim_x<=? AND f.dim_y<=?) OR (f.dim_x<=? AND f.dim_y<=?)) AND f.dim_z<=?)")
            params += [p["bed_x"], p["bed_y"], p["bed_y"], p["bed_x"], p["bed_z"]]
    if args.get("dupes") == "1":
        where.append("f.sha256 IN (SELECT sha256 FROM files WHERE missing=0 GROUP BY sha256 HAVING COUNT(*)>1)")
    return " AND ".join(where), params


GROUP_SORTS = {"name": "COALESCE(LOWER(bu.name), g.nm)", "added": "g.added", "modified": "g.modified", "size": "g.size",
               "rating": "g.rating", "height": "g.height", "volume": "g.volume", "random": "RANDOM()",
               "print_time": "g.pt", "folder": "g.fo"}


def bundle_status(rows):
    sts = {r["status"] for r in rows}
    for s_ in ("printing", "queued", "failed"):
        if s_ in sts:
            return s_
    if sts == {"printed"}:
        return "printed"
    if "printed" in sts:
        return "want" if "want" in sts else "printed"
    return "want" if "want" in sts else "none"


def serialize_bundle(b, rows, st, full=False):
    tg = tags_for([r["id"] for r in rows])
    parts = [serialize(r, tg.get(r["id"]), st) for r in rows]
    tagmap = {}
    for p_ in parts:
        for t in p_["tags"]:
            tagmap.setdefault(t["id"], dict(t, n=0))["n"] += 1
    models = [p_ for p_ in parts if p_["kind"] in ("mesh", "sliced", "gcode", "cad")]
    d = {"type": "bundle", "id": b["id"], "name": b["name"], "display_name": b["name"], "root": b["root"],
         "folder": b["path"], "notes": b["notes"], "parts": len(parts), "models": len(models),
         "part_ids": [p_["id"] for p_ in parts], "size": sum(p_["size"] or 0 for p_ in parts),
         "grams": round(sum(p_["grams"] or 0 for p_ in parts), 1) or None,
         "grams_estimated": any(p_["grams_estimated"] for p_ in parts if p_["grams"]),
         "print_time_s": sum(p_["print_time_s"] or 0 for p_ in parts) or None,
         "exts": sorted({p_["ext"] for p_ in parts}), "favorite": any(p_["favorite"] for p_ in parts),
         "rating": max([p_["rating"] or 0 for p_ in parts] or [0]), "status": bundle_status(rows),
         "added_at": max([p_["added_at"] or "" for p_ in parts] or [""]),
         "tags": sorted(tagmap.values(), key=lambda t: (-t["n"], t["name"].lower())),
         "thumb_v": lib.bundle_signature(rows), "has_mesh": any(lib.can_preview_mesh(r) for r in rows)}
    if full:
        d["part_items"] = parts
    return d


@app.get("/api/files")
def list_files():
    a = request.args
    where, params = build_filter(a)
    if a.get("group") == "1":
        return list_grouped(a, where, params)
    sort = SORTS.get(a.get("sort", "added"), SORTS["added"])
    order = "ASC" if a.get("order") == "asc" else "DESC"
    per = max(1, min(500, num(a.get("per"), 60, int)))
    page = max(1, num(a.get("page"), 1, int))
    total = db.q1(f"SELECT COUNT(*) n FROM files f WHERE {where}", params)["n"]
    rows = db.q(f"SELECT f.* FROM files f WHERE {where} ORDER BY {sort} {order}, f.id DESC LIMIT ? OFFSET ?",
                params + [per, (page - 1) * per])
    tg = tags_for([r["id"] for r in rows])
    st = db.settings()
    return jsonify({"items": attach_colls([serialize(r, tg.get(r["id"]), st) for r in rows]), "total": total, "page": page, "per": per})


def list_grouped(a, where, params):
    return jsonify(grouped_items(a, where, params))


def grouped_items(a, where, params):
    base = f"""SELECT f.*, b.id bid FROM files f LEFT JOIN bundles b ON b.root=f.root AND {lib.IN_BUNDLE_SQL}
               WHERE {where}"""
    sort = GROUP_SORTS.get(a.get("sort", "added"), GROUP_SORTS["added"])
    order = "ASC" if a.get("order") == "asc" else "DESC"
    per = max(1, min(500, num(a.get("per"), 60, int)))
    page = max(1, num(a.get("page"), 1, int))
    total = db.q1(f"SELECT COUNT(DISTINCT COALESCE(m.bid, -m.id)) n FROM ({base}) m", params)["n"]
    groups = db.q(f"""SELECT g.* FROM (
            SELECT COALESCE(m.bid, -m.id) gk, MAX(m.bid) bid, MAX(m.added_at) added, MAX(m.mtime) modified,
                   SUM(m.size) size, MAX(m.rating) rating, MAX(m.dim_z) height, SUM(m.volume_cm3) volume,
                   SUM(CAST(json_extract(m.meta,'$.print_time_s') AS REAL)) pt,
                   MIN(LOWER(COALESCE(m.title, m.name))) nm, MIN(LOWER(m.folder || '/' || m.name)) fo
            FROM ({base}) m GROUP BY gk) g
        LEFT JOIN bundles bu ON bu.id = g.bid
        ORDER BY {sort} {order}, g.gk DESC LIMIT ? OFFSET ?""", params + [per, (page - 1) * per])
    st = db.settings()
    file_ids = [-g["gk"] for g in groups if g["gk"] < 0]
    files = {}
    if file_ids:
        marks = ",".join("?" * len(file_ids))
        rows = db.q(f"SELECT * FROM files WHERE id IN ({marks})", file_ids)
        tg = tags_for(file_ids)
        files = {r["id"]: serialize(r, tg.get(r["id"]), st) for r in rows}
    items = []
    for g in groups:
        if g["gk"] < 0:
            if -g["gk"] in files:
                items.append(files[-g["gk"]])
            continue
        b, rows = lib.bundle_parts(g["bid"])
        if not b or not rows:
            continue
        if len(rows) == 1 and not folder_has_docs(b):  # one file, nothing else: show the file (opens directly)
            one = serialize(rows[0], tags_for([rows[0]["id"]]).get(rows[0]["id"]), st)
            if not rows[0]["title"]:
                one["display_name"] = b["name"]
            one["model_name"] = b["name"]
            items.append(one)
        else:
            it = serialize_bundle(b, rows, st)
            it["docs"] = folder_has_docs(b)
            items.append(it)
    return {"items": attach_colls(items), "total": total, "page": page, "per": per, "grouped": True}


@app.get("/api/files/ids")
def list_file_ids():
    where, params = build_filter(request.args)
    return jsonify([r["id"] for r in db.q(f"SELECT f.id FROM files f WHERE {where}", params)])


@app.get("/api/files/<int:fid>")
def file_detail(fid):
    f = get_file(fid)
    d = serialize(f, tags_for([fid]).get(fid), full=True)
    d["collections"] = db.q("""SELECT c.id, c.name, c.color FROM collections c JOIN collection_files cf
                               ON cf.collection_id=c.id WHERE cf.file_id=?""", (fid,))
    d["prints"] = db.q("""SELECT p.*, pr.name printer_name, s.name spool_name, s.color spool_color FROM prints p
                          LEFT JOIN printers pr ON pr.id=p.printer_id LEFT JOIN spools s ON s.id=p.spool_id
                          WHERE p.file_id=? ORDER BY p.started_at DESC""", (fid,))
    d["duplicates"] = db.q("SELECT id, name, folder, root FROM files WHERE sha256=? AND id<>? AND missing=0",
                           (f["sha256"], fid)) if f["sha256"] else []
    sib = db.q("""SELECT * FROM files WHERE root=? AND folder=? AND id<>? AND missing=0
                  ORDER BY LOWER(name) LIMIT 60""", (f["root"], f["folder"], fid))
    st = db.settings()
    d["siblings"] = [serialize(s, None, st) for s in sib]
    d["in_queue"] = db.q1("SELECT COALESCE(SUM(copies),0) n FROM queue WHERE file_id=?", (fid,))["n"]
    fits = []
    for p in db.q("SELECT * FROM printers ORDER BY name"):
        if f["dim_x"] is None:
            fits.append({"id": p["id"], "name": p["name"], "fits": None})
        else:
            ok_xy = (f["dim_x"] <= p["bed_x"] and f["dim_y"] <= p["bed_y"]) or (f["dim_x"] <= p["bed_y"] and f["dim_y"] <= p["bed_x"])
            fits.append({"id": p["id"], "name": p["name"], "fits": bool(ok_xy and f["dim_z"] <= p["bed_z"])})
    d["fits"] = fits
    d["attachments"] = folder_attachments(f)
    b = lib.bundle_for(f["root"], f["folder"])
    d["bundle"] = {"id": b["id"], "name": b["name"]} if b else None
    if b:
        parts = db.q1(f"SELECT COUNT(*) n FROM files f JOIN bundles b ON b.id=? AND b.root=f.root AND {lib.IN_BUNDLE_SQL} "
                      "WHERE f.missing=0", (b["id"],))["n"]
        d["bundle"]["parts"] = parts
        if parts == 1 and not f["title"]:
            d["display_name"] = b["name"]
    return jsonify(d)


ATTACH_EXTS = lib.IMAGE_EXTS | {"pdf", "txt", "md"}


def folder_has_docs(b):
    """True when a model folder also holds pictures or documents (PDF, readme...) - then it is shown as a folder,
    so they can be seen next to the model."""
    try:
        top = lib.safe_join(b["root"], b["path"])
    except ValueError:
        return False
    for depth, (dp, dn, fn) in enumerate(os.walk(top)):
        dn[:] = [x for x in dn if not x.startswith(".")]
        if any(lib.ext_of(x) in ATTACH_EXTS and not x.startswith(".") for x in fn):
            return True
        if depth > 20:
            break
    return False


def folder_attachments(f):
    d = os.path.dirname(f["path"])
    try:
        items = sorted(x for x in os.listdir(d) if not x.startswith(".") and lib.ext_of(x) in ATTACH_EXTS
                       and os.path.isfile(os.path.join(d, x)))
    except OSError:
        return []
    return [{"name": x, "ext": lib.ext_of(x)} for x in items[:40]]


@app.get("/api/files/<int:fid>/attachment/<path:name>")
def file_attachment(fid, name):
    f = get_file(fid)
    if "/" in name or "\\" in name or name.startswith(".") or lib.ext_of(name) not in ATTACH_EXTS:
        abort(404)
    return send_from_directory(os.path.dirname(f["path"]), name, max_age=3600)


@app.patch("/api/files/<int:fid>")
def update_file(fid):
    f = get_file(fid)
    b = body()
    fields = {}
    for k in ("title", "notes", "designer", "license", "source_url"):
        if k in b:
            fields[k] = (b[k] or "").strip() if isinstance(b[k], str) else b[k]
    if "title" in fields and not fields["title"]:
        fields["title"] = None
    if "rating" in b:
        fields["rating"] = max(0, min(5, num(b["rating"], 0, int)))
    if "favorite" in b:
        fields["favorite"] = 1 if b["favorite"] else 0
    if "status" in b and b["status"] in STATUSES:
        fields["status"] = b["status"]
    if fields:
        db.ex(f"UPDATE files SET {', '.join(k + '=?' for k in fields)} WHERE id=?", list(fields.values()) + [fid])
    if "tags" in b and isinstance(b["tags"], list):
        set_tags(fid, b["tags"])
    if "collections" in b and isinstance(b["collections"], list):
        db.ex("DELETE FROM collection_files WHERE file_id=?", (fid,))
        for cid in b["collections"]:
            db.ex("INSERT OR IGNORE INTO collection_files(collection_id, file_id) VALUES (?,?)", (num(cid, 0, int), fid))
    if "folder" in b or "name" in b:
        try:
            lib.move_file(f, b.get("folder"), b.get("name"))
        except (ValueError, OSError) as e:
            return err(f"move failed: {e}")
    return file_detail(fid)


@app.delete("/api/files/<int:fid>")
def delete_file(fid):
    f = get_file(fid)
    if request.args.get("forget") == "1":
        db.ex("DELETE FROM files WHERE id=?", (fid,))
    else:
        lib.trash_file(f)
    return jsonify({"ok": True})


@app.post("/api/files/batch")
def batch():
    b = body()
    ids = [num(i, 0, int) for i in b.get("ids", [])]
    action, val = b.get("action"), b.get("value")
    if not ids:
        return err("no files selected")
    done, failed = 0, []
    for fid in ids:
        f = db.q1("SELECT * FROM files WHERE id=?", (fid,))
        if not f:
            continue
        try:
            if action == "add_tags":
                set_tags(fid, val or [], "add")
            elif action == "remove_tags":
                set_tags(fid, val or [], "remove")
            elif action == "status" and val in STATUSES:
                db.ex("UPDATE files SET status=? WHERE id=?", (val, fid))
            elif action == "favorite":
                db.ex("UPDATE files SET favorite=? WHERE id=?", (1 if val else 0, fid))
            elif action == "rating":
                db.ex("UPDATE files SET rating=? WHERE id=?", (max(0, min(5, num(val, 0, int))), fid))
            elif action in ("designer", "license"):
                db.ex(f"UPDATE files SET {action}=? WHERE id=?", (val or "", fid))
            elif action == "add_collection":
                db.ex("INSERT OR IGNORE INTO collection_files(collection_id, file_id) VALUES (?,?)", (num(val, 0, int), fid))
            elif action == "remove_collection":
                db.ex("DELETE FROM collection_files WHERE collection_id=? AND file_id=?", (num(val, 0, int), fid))
            elif action == "queue":
                add_to_queue(fid, 1)
            elif action == "move":
                lib.move_file(f, val or "")
            elif action == "delete":
                lib.trash_file(f)
            elif action == "forget":
                db.ex("DELETE FROM files WHERE id=?", (fid,))
            elif action == "reanalyze":
                db.ex("UPDATE files SET analyzed=0 WHERE id=?", (fid,))
            else:
                return err("unknown action")
            done += 1
        except (ValueError, OSError, lib.ScadError) as e:
            failed.append({"id": fid, "error": public_error(e)})
        except Exception:
            log.exception("batch %s on file %s failed", action, fid)
            failed.append({"id": fid, "error": "internal error - see the server log"})
    if action == "reanalyze":
        lib.request_analyze(ids, force_thumb=True)
    return jsonify({"done": done, "failed": failed})


@app.get("/api/files/<int:fid>/thumb")
def file_thumb(fid):
    p = lib.thumb_path(fid)
    if not os.path.exists(p):
        abort(404)
    resp = send_file(p, mimetype="image/webp", max_age=86400 * 30)
    return resp


@app.post("/api/files/<int:fid>/thumb")
def upload_thumb(fid):
    get_file(fid)
    up = request.files.get("image")
    if not up:
        return err("no image")
    try:
        im = Image.open(up.stream)
        im.load()
        lib.save_thumb(fid, im)
    except Exception as e:
        return err(f"bad image: {e}")
    db.ex("UPDATE files SET thumb=3 WHERE id=?", (fid,))
    return jsonify({"ok": True})


@app.delete("/api/files/<int:fid>/thumb")
def reset_thumb(fid):
    get_file(fid)
    db.ex("UPDATE files SET thumb=0, analyzed=0 WHERE id=?", (fid,))
    lib.request_analyze([fid], force_thumb=True)
    return jsonify({"ok": True})


@app.get("/api/files/<int:fid>/download")
def download(fid):
    f = get_file(fid)
    if not os.path.exists(f["path"]):
        abort(404)
    return send_file(f["path"], as_attachment=True, download_name=f["name"])


@app.get("/api/files/<int:fid>/mesh")
def file_mesh(fid):
    f = get_file(fid)
    if f["ext"] not in meshes.MESH_EXTS and f["ext"] not in ("scad",) + lib.STEP_EXTS:
        return err("not a mesh")
    if lib.skipped("view_skip", fid):
        return err("this model is too large for the server's memory (it crashed once) - raise MEM_LIMIT, then "
                   "Settings → Regenerate all previews", 413)
    try:
        with lib.guarded(f"view:{fid}"):
            if request.args.get("c") == "1":  # colour-aware format (multi-colour 3MF)
                body_ = meshes.colored_mesh_to_bytes(*lib.load_preview_colored(f))
            else:
                body_ = meshes.mesh_to_bytes(lib.load_preview_mesh(f))
    except Exception as e:
        return err(f"cannot load mesh: {e}", 422)
    return Response(body_, mimetype="application/octet-stream",
                    headers={"Cache-Control": "private, max-age=86400"})  # URL carries a content version


@app.get("/api/files/<int:fid>/rendered.stl")
def scad_rendered(fid):
    f = get_file(fid)
    if f["ext"] not in ("scad",) + lib.STEP_EXTS:
        return err("only OpenSCAD and STEP files are converted to STL")
    try:
        p = lib.scad_stl(f) if f["ext"] == "scad" else lib.step_stl(f)
    except lib.ScadError as e:
        return err(str(e), 422)
    return send_file(p, as_attachment=True, download_name=f["name"].rsplit(".", 1)[0] + ".stl",
                     mimetype="application/octet-stream")


@app.get("/api/files/<int:fid>/source")
def file_source(fid):
    f = get_file(fid)
    if f["ext"] not in ("scad",):
        return err("no source view for this file type")
    with open(f["path"], "rb") as fh:
        data = fh.read(1024 * 1024)
    return Response(data.decode("utf-8", "replace"), mimetype="text/plain; charset=utf-8")


@app.get("/api/files/<int:fid>/gcode")
def file_gcode(fid):
    f = get_file(fid)
    if f["kind"] == "gcode" and f["ext"] != "bgcode":
        return send_file(f["path"], mimetype="text/plain", max_age=600)
    if f["ext"] == "3mf":
        plate = num(request.args.get("plate"), 1, int)
        with zipfile.ZipFile(f["path"]) as z:
            g = [n for n in z.namelist() if n.lower().endswith(".gcode")]
            g.sort()
            if not g:
                abort(404)
            name = next((n for n in g if n.lower().endswith(f"plate_{plate}.gcode")), g[0])
            return Response(z.read(name), mimetype="text/plain")
    return err("no G-code in this file")


@app.post("/api/files/<int:fid>/extract")
def extract(fid):
    f = get_file(fid)
    if f["kind"] != "archive":
        return err("not an archive")
    dest = lib.unique_path(os.path.join(os.path.dirname(f["path"]), f["name"].rsplit(".", 1)[0]))
    try:
        paths = lib.extract_zip(f["path"], dest)
        if len(paths) > 1:
            lib.create_bundle(f["root"], os.path.relpath(dest, f["root"]))
    except Exception as e:
        return err(f"extract failed: {e}")
    ids = []
    tag_names = [t["name"] for t in tags_for([fid]).get(fid, [])]
    for p in paths:
        nid, _ = lib.register(p)
        if nid:
            ids.append(nid)
            if tag_names:
                set_tags(nid, tag_names, "add")
    lib.request_analyze(ids)
    if body().get("delete_archive"):
        lib.trash_file(f)
    return jsonify({"extracted": len(ids), "ids": ids})


@app.post("/api/download")
def download_many():
    ids = request.form.get("ids") or ",".join(str(i) for i in body().get("ids", []))
    ids = [num(i, 0, int) for i in ids.split(",") if i]
    if not ids:
        return err("no files")
    marks = ",".join("?" * len(ids))
    rows = db.q(f"SELECT * FROM files WHERE id IN ({marks}) AND missing=0", ids)
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    used = set()
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=3) as z:
        for r in rows:
            arc = (r["folder"] + "/" + r["name"]).strip("/")
            base, i = arc, 1
            while arc in used:
                arc = f"{base.rsplit('.', 1)[0]} ({i}).{r['ext']}"
                i += 1
            used.add(arc)
            if os.path.exists(r["path"]):
                z.write(r["path"], arc)
    tmp.close()
    resp = send_file(tmp.name, as_attachment=True, download_name=f"zhopdeck-{time.strftime('%Y%m%d-%H%M')}.zip")
    resp.call_on_close(lambda: os.unlink(tmp.name))
    return resp


# --------------------------------------------------------------------------- slicer links
def _signer():
    return URLSafeTimedSerializer(app.secret_key, salt="slicer-link")


@app.post("/api/files/<int:fid>/link")
def file_link(fid):
    """Short-lived public download URL, so a desktop slicer can fetch the file without logging in."""
    f = get_file(fid)
    rendered = f["ext"] == "scad"  # slicers get the rendered STL of an OpenSCAD file
    if rendered:
        try:
            lib.scad_stl(f)
        except lib.ScadError as e:
            return err(str(e), 422)
    token = _signer().dumps([fid, 1 if rendered else 0])
    base = PUBLIC_URL or request.host_url.rstrip("/")
    name = f["name"].rsplit(".", 1)[0] + ".stl" if rendered else f["name"]
    from urllib.parse import quote
    return jsonify({"url": f"{base}/dl/{token}/{quote(name)}", "expires_in": 3600})


@app.get("/dl/<token>/<path:_name>")
def signed_download(token, _name):
    try:
        data = _signer().loads(token, max_age=3600)
    except SignatureExpired:
        abort(410)
    except BadSignature:
        abort(403)
    fid, rendered = (data, 0) if isinstance(data, int) else (data[0], data[1])
    f = get_file(fid)
    if rendered:
        try:
            return send_file(lib.scad_stl(f), as_attachment=True, download_name=f["name"].rsplit(".", 1)[0] + ".stl",
                             mimetype="application/octet-stream")
        except lib.ScadError:
            abort(404)
    if not os.path.exists(f["path"]):
        abort(404)
    return send_file(f["path"], as_attachment=True, download_name=f["name"], mimetype="application/octet-stream")


# --------------------------------------------------------------------------- upload & folders
@app.post("/api/upload")
def upload():
    root = lib.library_root(request.form.get("root") or lib.UPLOAD_ROOT, lib.LIBRARY_DIRS[0])
    try:
        base = lib.safe_join(root, request.form.get("folder", ""))
    except ValueError as e:
        return err(str(e))
    extract_zips = request.form.get("extract_zips") == "1"
    bundle_folders = request.form.get("bundle_folders", "1") == "1"
    tag_names = [t for t in (request.form.get("tags") or "").split(",") if t.strip()]
    coll = num(request.form.get("collection"), None, int)
    saved, skipped, ids, errors = [], [], [], []
    for up in request.files.getlist("files"):
        raw = (up.filename or "").replace("\\", "/")
        try:
            parts = [lib.clean_name(p) for p in raw.split("/") if p not in ("", ".", "..")]
            if not parts:
                continue
            e = lib.ext_of(parts[-1])
            if e not in lib.KINDS and e not in ATTACH_EXTS:
                skipped.append(raw)
                continue
            target = lib.safe_join(base, "/".join(parts))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            target = lib.unique_path(target)
            up.save(target)
            if bundle_folders and len(parts) > 1:  # uploaded as part of a folder -> that folder is one model
                lib.create_bundle(root, os.path.relpath(os.path.join(base, parts[0]), root))
            if e == "zip" and extract_zips:
                try:
                    zdest = lib.unique_path(target.rsplit(".", 1)[0])
                    paths = lib.extract_zip(target, zdest)
                    os.remove(target)
                    if bundle_folders and paths:
                        lib.create_bundle(root, os.path.relpath(zdest, root))
                except Exception as ex:
                    skipped.append(f"{raw} ({ex})")
                    paths = [target]
            elif e in lib.KINDS:
                paths = [target]
            else:
                paths = []  # attachment (image / pdf) - stored next to the models, not indexed
                saved.append(raw)
            for p in paths:
                fid, _ = lib.register(p)
                if fid:
                    ids.append(fid)
                    saved.append(os.path.relpath(p, root))
                    if tag_names:
                        set_tags(fid, tag_names, "add")
                    if coll:
                        db.ex("INSERT OR IGNORE INTO collection_files(collection_id, file_id) VALUES (?,?)", (coll, fid))
        except PermissionError as e:
            log.error("upload %s: %s", raw, e)
            errors.append(f"{raw}: no write permission for {e.filename or 'the library folder'} - the container runs as "
                          f"uid {os.getuid()}, check PUID/PGID and the folder owner on the host")
        except OSError as e:
            log.error("upload %s: %s", raw, e)
            errors.append(f"{raw}: {e.strerror or e}")
        except Exception:
            log.exception("upload %s failed", raw)
            errors.append(f"{raw}: internal error - see the server log")
    if ids:
        lib.request_analyze(ids)
    out = {"saved": saved, "skipped": skipped, "ids": ids, "errors": errors}
    if errors and not saved:
        out["error"] = errors[0]
        return jsonify(out), 500
    return jsonify(out)


@app.get("/api/bundles")
def list_bundles():
    return jsonify(db.q("SELECT id, root, path, name FROM bundles ORDER BY root, path"))


@app.post("/api/bundles")
def make_bundle():
    b = body()
    root = lib.library_root(b.get("root"))
    if not root or not (b.get("path") or "").strip("/"):
        return err("pick a folder inside the library")
    if b.get("subfolders"):
        base = lib.safe_join(root, b["path"])
        made = []
        for name in sorted(os.listdir(base)):
            if os.path.isdir(os.path.join(base, name)) and not name.startswith("."):
                rel = (b["path"].strip("/") + "/" + name)
                made.append(lib.create_bundle(root, rel))
        lib.request_analyze([])
        return jsonify({"created": len([m for m in made if m])})
    bid = lib.create_bundle(root, b["path"], b.get("name"))
    lib.request_analyze([])  # renders the composite preview in the background
    return jsonify({"id": bid})


def get_bundle(bid):
    b, rows = lib.bundle_parts(bid)
    if not b:
        abort(404)
    return b, rows


@app.get("/api/bundles/<int:bid>")
def bundle_detail(bid):
    b, rows = get_bundle(bid)
    d = serialize_bundle(b, rows, db.settings(), full=True)
    ids = d["part_ids"]
    if ids:
        marks = ",".join("?" * len(ids))
        d["prints"] = db.q(f"""SELECT p.*, pr.name printer_name FROM prints p LEFT JOIN printers pr ON pr.id=p.printer_id
                               WHERE p.file_id IN ({marks}) ORDER BY p.started_at DESC LIMIT 50""", ids)
        d["in_queue"] = db.q1(f"SELECT COALESCE(SUM(copies),0) n FROM queue WHERE file_id IN ({marks})", ids)["n"]
    else:
        d["prints"], d["in_queue"] = [], 0
    # images & documents anywhere inside the model folder
    try:
        top = lib.safe_join(b["root"], b["path"])
    except ValueError:  # library folder no longer configured
        top = None
    att = []
    for dp, dn, fn in (os.walk(top) if top else []):
        dn[:] = [x for x in dn if not x.startswith(".")]
        for x in sorted(fn):
            if lib.ext_of(x) in ATTACH_EXTS and not x.startswith("."):
                att.append({"name": os.path.relpath(os.path.join(dp, x), top).replace("\\", "/"), "ext": lib.ext_of(x)})
        if len(att) > 60:
            break
    d["attachments"] = att[:60]
    dims = [(p_["dim_x"], p_["dim_y"], p_["dim_z"]) for p_ in d["part_items"] if p_["dim_x"] is not None]
    fits = []
    for pr in db.q("SELECT * FROM printers ORDER BY name"):
        ok = all(((x <= pr["bed_x"] and y <= pr["bed_y"]) or (x <= pr["bed_y"] and y <= pr["bed_x"])) and z <= pr["bed_z"]
                 for x, y, z in dims) if dims else None
        fits.append({"id": pr["id"], "name": pr["name"], "fits": ok})
    d["fits"] = fits
    return jsonify(d)


@app.patch("/api/bundles/<int:bid>")
def update_bundle(bid):
    get_bundle(bid)
    b = body()
    if isinstance(b.get("name"), str) and b["name"].strip():
        db.ex("UPDATE bundles SET name=? WHERE id=?", (b["name"].strip()[:200], bid))
    if isinstance(b.get("notes"), str):
        db.ex("UPDATE bundles SET notes=? WHERE id=?", (b["notes"], bid))
    return bundle_detail(bid)


@app.delete("/api/bundles/<int:bid>")
def delete_bundle(bid):
    """Ungroup: the files stay, they're just shown separately again."""
    db.ex("DELETE FROM bundles WHERE id=?", (bid,))
    for old in os.listdir(lib.THUMB_DIR):
        if old.startswith(f"b{bid}_"):
            os.remove(os.path.join(lib.THUMB_DIR, old))
    return jsonify({"ok": True})


@app.get("/api/bundles/<int:bid>/mesh")
def bundle_mesh(bid):
    _, rows = get_bundle(bid)
    if lib.skipped("viewb_skip", bid):
        return err("this model folder is too large for the server's memory (it crashed once) - open the parts one by one", 413)
    try:
        with lib.guarded(f"viewb:{bid}"):
            body_ = meshes.mesh_to_bytes(lib.bundle_mesh(rows, max_total=1_500_000))
    except Exception as e:
        return err(str(e), 422)
    return Response(body_, mimetype="application/octet-stream",
                    headers={"Cache-Control": "private, max-age=600"})


@app.get("/api/bundles/<int:bid>/thumb")
def bundle_thumb(bid):
    p = lib.ensure_bundle_thumb(bid)
    if not p:
        abort(404)
    return send_file(p, mimetype="image/webp", max_age=86400 * 30)


@app.get("/api/bundles/<int:bid>/attachment/<path:name>")
def bundle_attachment(bid, name):
    b, _ = get_bundle(bid)
    if lib.ext_of(name) not in ATTACH_EXTS or any(x.startswith(".") for x in name.split("/")):
        abort(404)
    try:
        p = lib.safe_join(lib.safe_join(b["root"], b["path"]), name)
    except ValueError:
        abort(404)
    if not os.path.isfile(p):
        abort(404)
    return send_file(p, max_age=3600)


@app.get("/api/folders")
def folders():
    roots = []
    for r in lib.LIBRARY_DIRS:
        counts = {x["folder"]: x["n"] for x in db.q(
            "SELECT folder, COUNT(*) n FROM files WHERE root=? AND missing=0 GROUP BY folder", (r,))}
        dirs = set(counts)
        if os.path.isdir(r):
            for dp, dn, _ in os.walk(r, followlinks=True):
                dn[:] = [d for d in dn if not d.startswith(".") and d not in lib.SKIP_DIRS]
                rel = os.path.relpath(dp, r)
                if rel != ".":
                    dirs.add(rel.replace("\\", "/"))
                if len(dirs) > 5000:
                    break
        roots.append({"root": r, "name": os.path.basename(r) or r, "available": os.path.isdir(r),
                      "folders": [{"path": d, "count": counts.get(d, 0)} for d in sorted(dirs, key=str.lower)]})
    return jsonify(roots)


@app.get("/api/folders/attachments")
def folder_attachments_api():
    """Images and documents directly in a folder, plus its subfolders that hold only images/documents
    (e.g. images/ of a Printables download) - those are shown as folder cards instead of being mixed in."""
    root = lib.library_root(request.args.get("root"))
    folder = (request.args.get("folder") or "").strip("/")
    if root is None:
        return jsonify({"files": [], "folders": []})
    try:
        d = lib.safe_join(root, folder)
    except ValueError:
        return jsonify({"files": [], "folders": []})
    files, folders = [], []
    try:
        entries = sorted(os.listdir(d), key=str.lower)
    except OSError:
        entries = []
    for x in entries:
        if x.startswith(".") or x in lib.SKIP_DIRS:
            continue
        full = os.path.join(d, x)
        if os.path.isfile(full) and lib.ext_of(x) in ATTACH_EXTS:
            files.append({"name": x, "ext": lib.ext_of(x), "size": os.path.getsize(full)})
        elif os.path.isdir(full):
            sub = f"{folder}/{x}".strip("/")
            has_models = db.q1("SELECT 1 FROM files WHERE root=? AND missing=0 AND (folder=? OR substr(folder, 1, ?) = ?) LIMIT 1",
                               (root, sub, len(sub) + 1, sub + "/"))
            if has_models:
                continue  # its models are already shown in the grid
            imgs, docs = [], 0
            for dp, dn, fn in os.walk(full):
                dn[:] = [y for y in dn if not y.startswith(".")]
                for y in sorted(fn, key=str.lower):
                    e = lib.ext_of(y)
                    if y.startswith("."):
                        continue
                    if e in lib.IMAGE_EXTS:
                        imgs.append(os.path.relpath(os.path.join(dp, y), full).replace("\\", "/"))
                    elif e in ATTACH_EXTS:
                        docs += 1
            if imgs or docs:
                folders.append({"name": x, "path": sub, "images": len(imgs), "docs": docs, "cover": imgs[0] if imgs else None})
    return jsonify({"files": files[:80], "folders": folders[:40]})


@app.get("/api/folders/thumb")
def folder_thumb():
    """Small cached WEBP preview of an image in a library folder (for the grid)."""
    root = lib.library_root(request.args.get("root"))
    name = request.args.get("name", "")
    if root is None or "\\" in name or any(x.startswith(".") for x in name.split("/")) \
            or lib.ext_of(name) not in lib.IMAGE_EXTS:
        abort(404)
    try:
        p = lib.safe_join(lib.safe_join(root, request.args.get("folder", "")), name)
    except ValueError:
        abort(404)
    if not os.path.isfile(p):
        abort(404)
    import hashlib
    st = os.stat(p)
    key = hashlib.sha1(f"{p}:{st.st_mtime}:{st.st_size}".encode()).hexdigest()[:20]
    cache_dir = os.path.join(lib.THUMB_DIR, "att")
    os.makedirs(cache_dir, exist_ok=True)
    out = os.path.join(cache_dir, key + ".webp")
    if not os.path.exists(out):
        try:
            im = Image.open(p)
            im.load()
            from PIL import ImageOps
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((640, 640), Image.LANCZOS)
            tmp = f"{out}.{threading.get_ident()}.tmp"
            im.save(tmp, "WEBP", quality=82, method=4)
            os.replace(tmp, out)
        except Exception:
            return send_file(p, max_age=3600)
    return send_file(out, mimetype="image/webp", max_age=86400 * 30)


@app.get("/api/folders/file")
def folder_file():
    root = lib.library_root(request.args.get("root"))
    name = request.args.get("name", "")
    if root is None or "\\" in name or any(x.startswith(".") for x in name.split("/")) \
            or lib.ext_of(name) not in ATTACH_EXTS:
        abort(404)
    try:
        p = lib.safe_join(lib.safe_join(root, request.args.get("folder", "")), name)
    except ValueError:
        abort(404)
    if not os.path.isfile(p):
        abort(404)
    return send_file(p, max_age=3600)


@app.post("/api/folders")
def make_folder():
    b = body()
    root = lib.library_root(b.get("root"), lib.LIBRARY_DIRS[0])
    try:
        parts = [lib.clean_name(p) for p in (b.get("path") or "").replace("\\", "/").split("/") if p.strip()]
        p = lib.safe_join(root, "/".join(parts))
        os.makedirs(p, exist_ok=True)
    except (ValueError, OSError) as e:
        return err(str(e))
    return jsonify({"ok": True, "path": os.path.relpath(p, root)})


# --------------------------------------------------------------------------- tags & collections
@app.get("/api/tags")
def list_tags():
    return jsonify(db.q("""SELECT t.*, (SELECT COUNT(*) FROM file_tags ft JOIN files f ON f.id=ft.file_id
                          WHERE ft.tag_id=t.id AND f.missing=0) n FROM tags t ORDER BY LOWER(t.name)"""))


@app.post("/api/tags")
def create_tag():
    b = body()
    name = (b.get("name") or "").strip()[:60]
    if not name:
        return err("name required")
    try:
        tid = db.ex("INSERT INTO tags(name, color) VALUES (?,?)", (name, b.get("color") or "#7c8aa5"))
    except sqlite3.IntegrityError:
        return err("tag exists")
    return jsonify(db.q1("SELECT * FROM tags WHERE id=?", (tid,)))


@app.patch("/api/tags/<int:tid>")
def update_tag(tid):
    b = body()
    if "name" in b and b["name"].strip():
        other = db.q1("SELECT id FROM tags WHERE name=? AND id<>?", (b["name"].strip(), tid))
        if other:  # merge into existing tag
            db.ex("INSERT OR IGNORE INTO file_tags(file_id, tag_id) SELECT file_id, ? FROM file_tags WHERE tag_id=?",
                  (other["id"], tid))
            db.ex("DELETE FROM tags WHERE id=?", (tid,))
            return jsonify({"merged_into": other["id"]})
        db.ex("UPDATE tags SET name=? WHERE id=?", (b["name"].strip()[:60], tid))
    if "color" in b:
        db.ex("UPDATE tags SET color=? WHERE id=?", (b["color"], tid))
    return jsonify(db.q1("SELECT * FROM tags WHERE id=?", (tid,)))


@app.delete("/api/tags/<int:tid>")
def delete_tag(tid):
    db.ex("DELETE FROM tags WHERE id=?", (tid,))
    return jsonify({"ok": True})


@app.get("/api/collections")
def list_collections():
    rows = db.q("""SELECT c.*, (SELECT COUNT(*) FROM collection_files cf JOIN files f ON f.id=cf.file_id
                  WHERE cf.collection_id=c.id AND f.missing=0) n,
                  (SELECT cf.file_id FROM collection_files cf JOIN files f ON f.id=cf.file_id
                   WHERE cf.collection_id=c.id AND f.thumb>0 ORDER BY cf.added_at LIMIT 4) cover
                  FROM collections c ORDER BY LOWER(c.name)""")
    for r in rows:
        r["covers"] = [x["file_id"] for x in db.q(
            """SELECT cf.file_id FROM collection_files cf JOIN files f ON f.id=cf.file_id
               WHERE cf.collection_id=? AND f.thumb>0 AND f.missing=0 ORDER BY cf.added_at LIMIT 4""", (r["id"],))]
    return jsonify(rows)


@app.post("/api/collections")
def create_collection():
    b = body()
    if not (b.get("name") or "").strip():
        return err("name required")
    cid = db.ex("INSERT INTO collections(name, description, color) VALUES (?,?,?)",
                (b["name"].strip()[:100], b.get("description", ""), b.get("color") or "#f29d38"))
    return jsonify(db.q1("SELECT * FROM collections WHERE id=?", (cid,)))


@app.patch("/api/collections/<int:cid>")
def update_collection(cid):
    b = body()
    for k in ("name", "description", "color"):
        if k in b:
            db.ex(f"UPDATE collections SET {k}=? WHERE id=?", (b[k], cid))
    return jsonify(db.q1("SELECT * FROM collections WHERE id=?", (cid,)))


@app.delete("/api/collections/<int:cid>")
def delete_collection(cid):
    db.ex("DELETE FROM collections WHERE id=?", (cid,))
    return jsonify({"ok": True})


# --------------------------------------------------------------------------- printers / spools
def mask(row):
    if row and "conn_key" in row:
        row["conn_key_set"] = bool(row.pop("conn_key"))
        row["web_link"] = printer_web_url(dict(row, conn_key=""))
    return row


def crud(table, fields):
    def lst():
        order = "archived, LOWER(name)" if table == "spools" else "LOWER(name)"
        return jsonify([mask(r) for r in db.q(f"SELECT * FROM {table} ORDER BY {order}")])

    def create():
        b = body()
        if not (b.get("name") or "").strip():
            return err("name required")
        cols = [k for k in fields if k in b]
        rid = db.ex(f"INSERT INTO {table}({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                    [b[k] for k in cols])
        return jsonify(mask(db.q1(f"SELECT * FROM {table} WHERE id=?", (rid,))))

    def update(rid):
        b = body()
        cols = [k for k in fields if k in b]
        if cols:
            db.ex(f"UPDATE {table} SET {', '.join(k + '=?' for k in cols)} WHERE id=?", [b[k] for k in cols] + [rid])
        return jsonify(mask(db.q1(f"SELECT * FROM {table} WHERE id=?", (rid,))))

    def delete(rid):
        db.ex(f"DELETE FROM {table} WHERE id=?", (rid,))
        return jsonify({"ok": True})

    app.add_url_rule(f"/api/{table}", f"{table}_list", lst, methods=["GET"])
    app.add_url_rule(f"/api/{table}", f"{table}_create", create, methods=["POST"])
    app.add_url_rule(f"/api/{table}/<int:rid>", f"{table}_update", update, methods=["PATCH"])
    app.add_url_rule(f"/api/{table}/<int:rid>", f"{table}_delete", delete, methods=["DELETE"])


crud("printers", ["name", "model", "bed_x", "bed_y", "bed_z", "watts", "notes", "conn_type", "conn_url", "conn_key", "web_url"])


def get_printer(pid):
    p = db.q1("SELECT * FROM printers WHERE id=?", (pid,))
    if not p:
        abort(404)
    return p


@app.get("/api/printers/<int:pid>/status")
def printer_status(pid):
    p = get_printer(pid)
    if not p.get("conn_type"):
        return jsonify({"connected": False, "state": "not connected"})
    try:
        st = dict(prn.status(p), connected=True)
    except prn.PrinterError as e:
        return jsonify({"connected": False, "state": "offline", "error": str(e)})
    if st.get("spoolman_spool_id"):
        sp = db.q1("SELECT id, name, color, material, weight_total, weight_used FROM spools WHERE spoolman_id=?",
                   (st["spoolman_spool_id"],))
        if sp:
            st["active_spool"] = sp
    return jsonify(st)


# --------------------------------------------------------------------------- OrcaSlicer / PrusaSlicer upload
# Z-Hop Deck answers like OctoPrint, so a slicer can use it as "print host" (Orca: type "Octo/Klipper").
@app.get("/api/version")
@app.get("/p/<int:pid>/api/version")
def octo_version(pid=None):
    return jsonify({"api": "0.1", "server": "1.10.0", "text": f"OctoPrint 1.10.0 (Z-Hop Deck {VERSION})"})


@app.get("/api/server")
@app.get("/p/<int:pid>/api/server")
def octo_server(pid=None):
    return jsonify({"version": "1.10.0", "safemode": None})


MODEL_EXTS = ("stl", "3mf", "obj", "scad", "step", "stp")


def _folder_for_gcode(name):
    """Put an uploaded G-code next to the model it was sliced from (longest matching file name)."""
    stem = name.rsplit(".", 1)[0].lower()
    best = None
    for r in db.q(f"SELECT root, folder, name FROM files WHERE missing=0 AND ext IN ({','.join('?' * len(MODEL_EXTS))})",
                  MODEL_EXTS):
        mstem = r["name"].rsplit(".", 1)[0].lower()
        if len(mstem) >= 3 and stem.startswith(mstem) and (best is None or len(mstem) > len(best[2])):
            best = (r["root"], r["folder"], mstem)
    if best:
        return best[0], best[1]
    return lib.LIBRARY_DIRS[0], (db.setting("orca_folder", "Orca") or "Orca").strip("/")


def _orca_printer(pid=None):
    if pid:  # per-printer URL: http://server:8080/p/<id>
        return db.q1("SELECT * FROM printers WHERE id=?", (pid,))
    pid = db.setting("orca_printer", "")
    p = db.q1("SELECT * FROM printers WHERE id=? AND conn_type<>''", (pid,)) if pid else None
    return p or db.q1("SELECT * FROM printers WHERE conn_type<>'' ORDER BY id LIMIT 1")


@app.post("/api/files/local")
@app.post("/p/<int:pid>/api/files/local")
def octo_upload(pid=None):
    up = request.files.get("file")
    if not up or not up.filename:
        return err("no file")
    name = lib.clean_name(os.path.basename(up.filename.replace("\\", "/")))
    if lib.ext_of(name) not in lib.KINDS:
        return err(f"unsupported file type: {name}")
    sub = (request.form.get("path") or "").strip("/")
    if sub:
        root, folder = lib.LIBRARY_DIRS[0], sub
    else:
        root, folder = _folder_for_gcode(name)
    try:
        dest_dir = lib.safe_join(root, folder)
        os.makedirs(dest_dir, exist_ok=True)
        target = lib.safe_join(dest_dir, name)
        tmp = target + ".uploading"
        up.save(tmp)
        os.replace(tmp, target)  # re-slicing the same model replaces the old G-code
    except PermissionError as e:
        return err(f"no write permission for {e.filename} (uid {os.getuid()}) - check PUID/PGID", 500)
    except (OSError, ValueError) as e:
        return err(str(e), 500)
    fid, _ = lib.register(target)
    if fid:
        lib.request_analyze([fid])
    want_print = (request.form.get("print") or "").lower() == "true"
    start = want_print and db.setting("orca_start", "never") == "follow"
    sent, warn = None, None
    if fid and pid:
        db.set_setting(f"orca_last_{pid}", f"{fid}:{int(time.time())}")
    p = _orca_printer(pid)
    if fid and not pid and p:
        db.set_setting(f"orca_last_{p['id']}", f"{fid}:{int(time.time())}")
    if pid and not p:
        return err(f"printer {pid} does not exist in Z-Hop Deck - check the URL in Orca", 404)
    if p and not p.get("conn_type"):
        p = None  # printer without network connection: just store the file
    if p and prn.can_print(p, lib.ext_of(name)):
        try:
            prn.upload(p, target, name, start=start)
            sent = p["name"]
            if start and fid:
                db.ex("UPDATE files SET status='printing' WHERE id=?", (fid,))
        except prn.PrinterError as e:
            warn = f"saved in Z-Hop Deck, but sending to {p['name']} failed: {e}"
    log.info("slicer upload %s -> %s/%s, printer=%s start=%s", name, root, folder, sent, start)
    if warn:
        return jsonify({"error": warn}), 502
    return jsonify({"done": True, "files": {"local": {"name": name, "origin": "local", "path": f"{folder}/{name}".strip("/"),
                                                        "refs": {"resource": f"/api/files/{fid}"}}},
                    "zhopdeck": {"id": fid, "folder": folder, "printer": sent, "started": start}}), 201


def printer_web_url(p):
    if p.get("web_url"):
        u = p["web_url"].strip()
        return u if u.startswith(("http://", "https://")) else "http://" + u
    if not p.get("conn_url"):
        return None
    from urllib.parse import urlsplit
    u = urlsplit(prn._base(p))
    host, port = u.hostname or "", u.port
    if p.get("conn_type") == "moonraker" and port == 7125:  # Moonraker API port -> web UI on the default port
        port = None
    netloc = f"[{host}]" if ":" in host else host
    return f"{u.scheme}://{netloc}{':' + str(port) if port else ''}/"


@app.get("/p/<int:pid>")
@app.get("/p/<int:pid>/")
def printer_web(pid):
    """Orca's "Device" tab opens the print host URL: show the file just uploaded from Orca for this printer,
    or - if nothing was uploaded in the last 12 hours - the printer's own web UI (Mainsail/Fluidd/OctoPrint)."""
    p = db.q1("SELECT * FROM printers WHERE id=?", (pid,))
    if not p:
        return redirect("/#/printers")
    last = (db.setting(f"orca_last_{pid}", "") or "").split(":")
    if len(last) == 2 and last[0].isdigit() and time.time() - float(last[1] or 0) < 12 * 3600:
        if db.q1("SELECT id FROM files WHERE id=? AND missing=0", (int(last[0]),)):
            return redirect(f"/#/file/{last[0]}")
    url = printer_web_url(p)
    return redirect(url or "/#/printers")


@app.post("/api/settings/octo-key")
def regen_octo_key():
    db.set_setting("octo_api_key", secrets.token_hex(16).upper())
    return get_settings()


@app.post("/api/autolog/sync")
def autolog_now():
    return jsonify({"imported": autolog.sync_all(calc_cost)})


@app.get("/api/spoolman")
def spoolman_status():
    return jsonify(sm.status())


@app.post("/api/spoolman/test")
def spoolman_test():
    try:
        return jsonify(sm.test(body().get("url") or None))
    except sm.SpoolmanError as e:
        return err(str(e), 502)


@app.post("/api/spoolman/sync")
def spoolman_sync():
    try:
        return jsonify(sm.sync())
    except sm.SpoolmanError as e:
        return err(str(e), 502)


@app.post("/api/printers/test")
def printer_test():
    """Test unsaved connection settings from the edit dialog (falls back to the stored key)."""
    b = body()
    p = {"conn_type": b.get("conn_type"), "conn_url": b.get("conn_url"), "conn_key": b.get("conn_key")}
    if not p["conn_key"] and b.get("id"):
        p["conn_key"] = (db.q1("SELECT conn_key FROM printers WHERE id=?", (b["id"],)) or {}).get("conn_key")
    try:
        return jsonify(dict(prn.status(p), ok=True))
    except prn.PrinterError as e:
        return err(str(e), 502)


@app.post("/api/files/<int:fid>/send")
def send_to_printer(fid):
    f = get_file(fid)
    b = body()
    p = get_printer(num(b.get("printer_id"), 0, int))
    if not p.get("conn_type"):
        return err("this printer has no network connection set up")
    if not prn.can_print(p, f["ext"]):
        return err(f"{prn.TYPES.get(p['conn_type'], 'This printer')} can't print .{f['ext']} files - send sliced G-code")
    start = bool(b.get("start"))
    try:
        r = prn.upload(p, f["path"], f["name"], start=start)
    except prn.PrinterError as e:
        return err(str(e), 502)
    if start:
        db.ex("UPDATE files SET status='printing' WHERE id=?", (fid,))
    return jsonify(r)
crud("spools", ["name", "brand", "material", "color", "diameter", "weight_total", "weight_used", "price",
                "density", "notes", "archived"])


# --------------------------------------------------------------------------- queue
def add_to_queue(fid, copies=1, spool_id=None, printer_id=None, notes=""):
    pos = db.q1("SELECT COALESCE(MAX(position),0)+1 p FROM queue")["p"]
    qid = db.ex("INSERT INTO queue(file_id, copies, position, spool_id, printer_id, notes) VALUES (?,?,?,?,?,?)",
                (fid, max(1, copies), pos, spool_id, printer_id, notes))
    db.ex("UPDATE files SET status='queued' WHERE id=? AND status IN ('none','want','failed')", (fid,))
    return qid


@app.get("/api/queue")
def get_queue():
    rows = db.q("""SELECT q.*, s.name spool_name, s.color spool_color, s.price spool_price, s.weight_total spool_weight,
                   p.name printer_name, p.watts printer_watts FROM queue q
                   LEFT JOIN spools s ON s.id=q.spool_id LEFT JOIN printers p ON p.id=q.printer_id
                   ORDER BY q.position, q.id""")
    st = db.settings()
    fids = [r["file_id"] for r in rows]
    files = {}
    if fids:
        marks = ",".join("?" * len(fids))
        tg = tags_for(fids)
        for f in db.q(f"SELECT * FROM files WHERE id IN ({marks})", fids):
            files[f["id"]] = serialize(f, tg.get(f["id"]), st)
    for r in rows:
        r["file"] = files.get(r["file_id"])
    return jsonify(rows)


@app.post("/api/queue")
def queue_add():
    b = body()
    fid = num(b.get("file_id"), 0, int)
    get_file(fid)
    qid = add_to_queue(fid, num(b.get("copies"), 1, int), b.get("spool_id"), b.get("printer_id"), b.get("notes", ""))
    return jsonify({"id": qid})


@app.patch("/api/queue/<int:qid>")
def queue_update(qid):
    b = body()
    for k in ("copies", "spool_id", "printer_id", "notes"):
        if k in b:
            db.ex(f"UPDATE queue SET {k}=? WHERE id=?", (b[k], qid))
    return jsonify({"ok": True})


@app.delete("/api/queue/<int:qid>")
def queue_delete(qid):
    r = db.q1("SELECT file_id FROM queue WHERE id=?", (qid,))
    db.ex("DELETE FROM queue WHERE id=?", (qid,))
    if r and not db.q1("SELECT 1 FROM queue WHERE file_id=?", (r["file_id"],)):
        db.ex("UPDATE files SET status='want' WHERE id=? AND status='queued'", (r["file_id"],))
    return jsonify({"ok": True})


@app.post("/api/queue/reorder")
def queue_reorder():
    for i, qid in enumerate(body().get("ids", [])):
        db.ex("UPDATE queue SET position=? WHERE id=?", (i, num(qid, 0, int)))
    return jsonify({"ok": True})


# --------------------------------------------------------------------------- prints
def calc_cost(grams, duration_s, spool, printer, st):
    mat = 0.0
    if spool and spool.get("weight_total"):
        mat = grams * (spool["price"] or 0) / spool["weight_total"]
    else:
        mat = grams * num(st.get("default_spool_price"), 20) / 1000
    watts = (printer or {}).get("watts") or num(st.get("default_watts"), 150)
    power = (duration_s / 3600) * watts / 1000 * num(st.get("kwh_price"), 0.2)
    labour = (duration_s / 3600) * num(st.get("hourly_rate"), 0)
    return round(mat + power + labour, 2)


@app.get("/api/prints")
def list_prints():
    lim = num(request.args.get("limit"), 500, int)
    return jsonify(db.q("""SELECT p.*, pr.name printer_name, s.name spool_name, s.color spool_color,
                           f.thumb file_thumb, f.missing file_missing FROM prints p
                           LEFT JOIN printers pr ON pr.id=p.printer_id LEFT JOIN spools s ON s.id=p.spool_id
                           LEFT JOIN files f ON f.id=p.file_id ORDER BY p.started_at DESC, p.id DESC LIMIT ?""", (lim,)))


@app.post("/api/prints")
def log_print():
    b = body()
    fid = num(b.get("file_id"), None, int)
    f = db.q1("SELECT * FROM files WHERE id=?", (fid,)) if fid else None
    copies = max(1, num(b.get("copies"), 1, int))
    grams = num(b.get("grams"), 0) or 0
    dur = num(b.get("duration_s"), 0, int) or 0
    spool = db.q1("SELECT * FROM spools WHERE id=?", (b.get("spool_id"),)) if b.get("spool_id") else None
    printer = db.q1("SELECT * FROM printers WHERE id=?", (b.get("printer_id"),)) if b.get("printer_id") else None
    result = b.get("result") if b.get("result") in ("success", "failed", "cancelled") else "success"
    total_g = grams * copies
    cost = calc_cost(total_g, dur, spool, printer, db.settings())
    with db.tx():
        pid = db.ex("""INSERT INTO prints(file_id, file_name, printer_id, spool_id, started_at, duration_s, grams,
                       copies, result, cost, notes) VALUES (?,?,?,?,COALESCE(?, datetime('now')),?,?,?,?,?,?)""",
                    (fid, (f["title"] or f["name"]) if f else b.get("file_name", "Unknown"),
                     printer["id"] if printer else None, spool["id"] if spool else None,
                     b.get("started_at") or None, dur, grams, copies, result, cost, b.get("notes", "")))
        if spool and total_g and not spool.get("spoolman_id"):
            db.ex("UPDATE spools SET weight_used=MIN(weight_total, weight_used+?) WHERE id=?", (total_g, spool["id"]))
        if f:
            new = "printed" if result == "success" else ("failed" if f["status"] != "printed" else "printed")
            db.ex("UPDATE files SET status=? WHERE id=?", (new, fid))
        if b.get("queue_id"):
            db.ex("DELETE FROM queue WHERE id=?", (num(b["queue_id"], 0, int),))
    out = db.q1("SELECT * FROM prints WHERE id=?", (pid,))
    # Spoolman-linked spool: Spoolman owns the weight. Report usage only if enabled (Moonraker may already do it).
    if spool and spool.get("spoolman_id") and total_g:
        if db.setting("spoolman_deduct") == "1":
            try:
                sm.use(spool["spoolman_id"], total_g)
                sm.sync()
                out["spoolman"] = "deducted"
            except sm.SpoolmanError as e:
                out["warning"] = f"Print logged, but Spoolman was not updated: {e}"
        else:
            out["spoolman"] = "not deducted (Moonraker tracks usage)"
    return jsonify(out)


@app.delete("/api/prints/<int:pid>")
def delete_print(pid):
    p = db.q1("SELECT * FROM prints WHERE id=?", (pid,))
    sp = db.q1("SELECT spoolman_id FROM spools WHERE id=?", (p["spool_id"],)) if p and p["spool_id"] else None
    if p and p["spool_id"] and request.args.get("restore_filament") == "1" and not (sp and sp["spoolman_id"]):
        db.ex("UPDATE spools SET weight_used=MAX(0, weight_used-?) WHERE id=?", (p["grams"] * p["copies"], p["spool_id"]))
    db.ex("DELETE FROM prints WHERE id=?", (pid,))
    return jsonify({"ok": True})


# --------------------------------------------------------------------------- duplicates & stats
@app.get("/api/duplicates")
def duplicates():
    groups = db.q("""SELECT sha256, COUNT(*) n, MAX(size) size FROM files WHERE missing=0 AND sha256 IS NOT NULL
                     GROUP BY sha256 HAVING COUNT(*)>1 ORDER BY MAX(size)*(COUNT(*)-1) DESC LIMIT 500""")
    st = db.settings()
    out = []
    for g in groups:
        rows = db.q("SELECT * FROM files WHERE sha256=? AND missing=0 ORDER BY added_at", (g["sha256"],))
        tg = tags_for([r["id"] for r in rows])
        out.append({"sha256": g["sha256"], "size": g["size"], "wasted": g["size"] * (g["n"] - 1),
                    "files": [dict(serialize(r, tg.get(r["id"]), st), path=r["path"]) for r in rows]})
    return jsonify(out)


@app.get("/api/home")
def home():
    st = db.settings()
    o = {}
    base_where = "f.missing=0"
    g = grouped_items({"sort": "added", "order": "desc", "per": "6"}, base_where, [])
    o["models"] = g["total"]
    o["new"] = g["items"]
    o["new_week"] = grouped_items({"per": "1"}, base_where + " AND f.added_at >= datetime('now','-7 days')", [])["total"]
    o["printed"] = grouped_items({"per": "1"}, base_where + """ AND (f.status='printed' OR EXISTS
        (SELECT 1 FROM prints p WHERE p.file_id=f.id AND p.result='success'))""", [])["total"]
    o["queue_copies"] = db.q1("SELECT COALESCE(SUM(copies),0) n FROM queue")["n"]
    o["printers"] = db.q("SELECT id, name, model, conn_type FROM printers ORDER BY name")
    # last print
    lp = db.q1("""SELECT p.*, f.id fid FROM prints p LEFT JOIN files f ON f.id=p.file_id AND f.missing=0
                  ORDER BY p.started_at DESC, p.id DESC LIMIT 1""")
    if lp:
        f = get_file(lp["fid"]) if lp["fid"] else None
        o["last_print"] = {"name": lp["file_name"], "at": lp["started_at"], "result": lp["result"],
                           "file": serialize(f, [], st) if f else None}
    # spools
    spools = db.q("SELECT * FROM spools WHERE archived=0")
    for sp in spools:
        sp["remaining"] = max(0.0, (sp["weight_total"] or 0) - (sp["weight_used"] or 0))
    low_g = 150
    o["spool_total_g"] = round(sum(sp["remaining"] for sp in spools))
    o["spool_count"] = len(spools)
    o["spool_low"] = sum(1 for sp in spools if sp["remaining"] < low_g)
    o["spools"] = [{k: sp[k] for k in ("id", "name", "brand", "color", "material", "remaining", "weight_total", "spoolman_id")}
                   for sp in sorted(spools, key=lambda x: -x["remaining"])[:6]]
    o["spool_low_g"] = low_g
    # runs out soon: usage per spool over the last 30 days
    use = {r["spool_id"]: r["g"] for r in db.q("""SELECT spool_id, SUM(grams*copies) g FROM prints
            WHERE spool_id IS NOT NULL AND started_at >= datetime('now','-30 days') GROUP BY spool_id""")}
    soon = []
    for sp in spools:
        per_day = (use.get(sp["id"]) or 0) / 30.0
        if per_day > 0:
            days = sp["remaining"] / per_day
            if days <= 90:
                soon.append({"id": sp["id"], "name": sp["name"], "color": sp["color"], "days": int(days)})
    o["runs_out"] = sorted(soon, key=lambda x: x["days"])[:4]
    # queue: up next + what the queue needs
    q = db.q("""SELECT q.*, f.title, f.name fname, f.meta, f.id fid FROM queue q JOIN files f ON f.id=q.file_id
                ORDER BY q.position, q.id""")
    if q:
        f0 = get_file(q[0]["fid"])
        o["up_next"] = {"file": serialize(f0, [], st), "copies": q[0]["copies"], "more": len(q) - 1}
    by_id = {sp["id"]: sp for sp in spools}
    needs = []
    for r in q:
        f = get_file(r["fid"])
        sf = serialize(f, [], st)
        need = (sf["grams"] or 0) * (r["copies"] or 1)
        mat = (sf.get("material") or "").split(";")[0].strip()
        what = None
        if r["spool_id"] and r["spool_id"] in by_id:
            sp = by_id[r["spool_id"]]
            if need and sp["remaining"] < need:
                what = f"more {sp['name']} ({round(need - sp['remaining'])} g missing)"
        elif r["spool_id"]:
            what = "its spool (archived or deleted)"
        elif mat and not any((sp["material"] or "").lower() == mat.lower() and sp["remaining"] >= need for sp in spools):
            what = f"{mat}" + (f" ({round(need)} g)" if need else "")
        if what:
            needs.append({"file_id": f["id"], "name": sf["display_name"], "needs": what})
    o["needs"] = needs[:5]
    # nothing queued: suggest something you wanted to print, else the newest unprinted model
    if not q:
        sug = db.q1("""SELECT * FROM files WHERE missing=0 AND status='want' AND kind IN ('mesh','sliced','gcode','cad')
                       ORDER BY added_at DESC LIMIT 1""") or \
            db.q1("""SELECT * FROM files WHERE missing=0 AND status='none' AND kind IN ('mesh','sliced','gcode')
                     ORDER BY added_at DESC LIMIT 1""")
        if sug:
            o["suggest"] = serialize(sug, [], st)
    # this month
    m = db.q1("""SELECT COUNT(*) n, COALESCE(SUM(grams*copies),0) g,
                 COALESCE(SUM(CASE WHEN result='success' THEN 1 ELSE 0 END),0) ok
                 FROM prints WHERE started_at >= date('now','start of month')""")
    o["month"] = {"prints": m["n"], "grams": round(m["g"]), "ok_pct": round(100 * m["ok"] / m["n"]) if m["n"] else None}
    weeks = []
    for w in range(3, -1, -1):
        r = db.q1("""SELECT COUNT(*) n FROM prints WHERE started_at >= datetime('now', ?) AND started_at < datetime('now', ?)""",
                  (f"-{(w + 1) * 7} days", f"-{w * 7} days" if w else "+1 day"))
        weeks.append(r["n"])
    o["weeks"] = weeks
    return jsonify(o)


@app.get("/api/stats")
def stats():
    s = {}
    s["files"] = db.q1("SELECT COUNT(*) n, COALESCE(SUM(size),0) size FROM files WHERE missing=0")
    s["missing"] = db.q1("SELECT COUNT(*) n FROM files WHERE missing=1")["n"]
    s["by_kind"] = db.q("SELECT kind, COUNT(*) n, SUM(size) size FROM files WHERE missing=0 GROUP BY kind ORDER BY n DESC")
    s["by_ext"] = db.q("SELECT ext, COUNT(*) n FROM files WHERE missing=0 GROUP BY ext ORDER BY n DESC")
    s["by_status"] = db.q("SELECT status, COUNT(*) n FROM files WHERE missing=0 GROUP BY status")
    s["prints"] = db.q1("""SELECT COUNT(*) n, COALESCE(SUM(copies),0) copies, COALESCE(SUM(grams*copies),0) grams,
                           COALESCE(SUM(duration_s),0) seconds, COALESCE(SUM(cost),0) cost,
                           COALESCE(SUM(CASE WHEN result='success' THEN 1 ELSE 0 END),0) ok FROM prints""")
    s["prints_by_month"] = db.q("""SELECT strftime('%Y-%m', started_at) month, COUNT(*) n, SUM(grams*copies) grams,
                                   SUM(duration_s) seconds, SUM(cost) cost FROM prints
                                   WHERE started_at >= date('now','-11 months','start of month')
                                   GROUP BY month ORDER BY month""")
    s["added_by_month"] = db.q("""SELECT strftime('%Y-%m', added_at) month, COUNT(*) n FROM files
                                  WHERE added_at >= date('now','-11 months','start of month') GROUP BY month ORDER BY month""")
    s["top_tags"] = db.q("""SELECT t.name, t.color, COUNT(*) n FROM file_tags ft JOIN tags t ON t.id=ft.tag_id
                            GROUP BY t.id ORDER BY n DESC LIMIT 12""")
    s["material_use"] = db.q("""SELECT COALESCE(s.material,'Unknown') material, SUM(p.grams*p.copies) grams FROM prints p
                                LEFT JOIN spools s ON s.id=p.spool_id GROUP BY material ORDER BY grams DESC""")
    s["spools"] = db.q("SELECT * FROM spools WHERE archived=0 ORDER BY (weight_total-weight_used) ASC")
    s["queue"] = db.q1("SELECT COUNT(*) n, COALESCE(SUM(copies),0) copies FROM queue")
    s["dupes"] = db.q1("""SELECT COUNT(*) groups, COALESCE(SUM(w),0) wasted FROM (SELECT MAX(size)*(COUNT(*)-1) w
                          FROM files WHERE missing=0 GROUP BY sha256 HAVING COUNT(*)>1)""")
    s["most_printed"] = db.q("""SELECT p.file_id, p.file_name, SUM(p.copies) n, f.thumb FROM prints p
                                LEFT JOIN files f ON f.id=p.file_id WHERE p.result='success'
                                GROUP BY COALESCE(p.file_id, p.file_name) ORDER BY n DESC LIMIT 8""")
    return jsonify(s)


# --------------------------------------------------------------------------- scan / settings / backup
@app.post("/api/scan")
def start_scan():
    lib.request_scan()
    return jsonify({"ok": True})


@app.get("/api/scan/status")
def scan_status():
    return jsonify(lib.get_status())


@app.post("/api/rethumb")
def rethumb():
    lib.request_rethumb_all()
    return jsonify({"ok": True})


@app.get("/api/settings")
def get_settings():
    s = db.settings()
    s["_library_dirs"] = lib.LIBRARY_DIRS
    s["_upload_root"] = lib.UPLOAD_ROOT
    s["_version"] = VERSION
    s["_auth"] = bool(APP_PASSWORD)
    s["_max_upload_mb"] = MAX_UPLOAD_MB
    s["_openscad"] = bool(lib.OPENSCAD)
    s["_step"] = lib.STEP_OK
    s["PUBLIC_URL_EFFECTIVE"] = PUBLIC_URL or request.host_url.rstrip("/")
    trash = 0
    for fn in os.listdir(lib.TRASH_DIR):
        try:
            trash += os.path.getsize(os.path.join(lib.TRASH_DIR, fn))
        except OSError:
            pass
    s["_trash_bytes"] = trash
    return jsonify(s)


@app.put("/api/settings")
def put_settings():
    b = body()
    for k, v in b.items():
        if k in db.DEFAULT_SETTINGS:
            db.set_setting(k, v)
    if b.get("spoolman_url"):
        threading.Thread(target=sm._safe_sync, daemon=True).start()
    return get_settings()


@app.post("/api/trash/empty")
def empty_trash():
    for fn in os.listdir(lib.TRASH_DIR):
        p = os.path.join(lib.TRASH_DIR, fn)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    return jsonify({"ok": True})


@app.get("/api/backup")
def backup():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    dst = sqlite3.connect(tmp.name)
    db.conn().backup(dst)
    dst.close()
    resp = send_file(tmp.name, as_attachment=True, download_name=f"zhopdeck-backup-{time.strftime('%Y%m%d-%H%M')}.db")
    resp.call_on_close(lambda: os.unlink(tmp.name))
    return resp


@app.post("/api/restore")
def restore():
    up = request.files.get("file")
    if not up:
        return err("no file")
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    up.save(tmp.name)
    tmp.close()
    try:
        src = sqlite3.connect(tmp.name)
        tables = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {"files", "tags", "prints", "spools"} <= tables:
            src.close()
            return err("this is not a Z-Hop Deck backup")
        src.backup(db.conn())
        src.close()
        db.init()  # apply schema upgrades if the backup is older
    except sqlite3.DatabaseError as e:
        return err(f"invalid database: {e}")
    finally:
        os.unlink(tmp.name)
    lib.request_scan()
    return jsonify({"ok": True})


@app.get("/api/export.csv")
def export_csv():
    rows = db.q("SELECT * FROM files WHERE missing=0 ORDER BY folder, name")
    tg = tags_for([r["id"] for r in rows])
    st = db.settings()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "name", "title", "folder", "ext", "size_bytes", "status", "rating", "favorite", "tags",
                "designer", "license", "source_url", "dim_x", "dim_y", "dim_z", "volume_cm3", "est_grams",
                "print_time_h", "material", "sha256", "path"])
    for r in rows:
        d = serialize(r, tg.get(r["id"]), st)
        w.writerow([r["id"], r["name"], r["title"] or "", r["folder"], r["ext"], r["size"], r["status"], r["rating"],
                    r["favorite"], "; ".join(t["name"] for t in d["tags"]), r["designer"], r["license"],
                    r["source_url"], r["dim_x"], r["dim_y"], r["dim_z"], r["volume_cm3"], d["grams"],
                    round(d["print_time_s"] / 3600, 2) if d["print_time_s"] else "", d["material"] or "",
                    r["sha256"], r["path"]])
    return Response(buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=zhopdeck-library.csv"})


@app.get("/api/random")
def random_file():
    where, params = build_filter(request.args)
    r = db.q1(f"SELECT f.id FROM files f WHERE {where} AND f.kind IN ('mesh','sliced','gcode') ORDER BY RANDOM() LIMIT 1",
              params)
    return jsonify(r or {})


# --------------------------------------------------------------------------- custom background image
BG_EXTS = ("jpg", "png", "webp")


def background_path():
    for e in BG_EXTS:
        p = os.path.join(db.DATA_DIR, f"background.{e}")
        if os.path.exists(p):
            return p
    return None


def _migrate_background():
    """Installs that had the carbon photo inside the app (1.21.5 - 1.23) get it as their own background image."""
    old = os.path.join(app.static_folder, "carbon-photo.jpg")
    if os.path.exists(old) and not background_path():
        try:
            shutil.copyfile(old, os.path.join(db.DATA_DIR, "background.jpg"))
        except OSError as e:
            log.warning("could not copy the background photo: %s", e)


@app.get("/background")
def background_image():
    p = background_path()
    if not p:
        abort(404)
    return send_file(p, max_age=86400 * 30)


@app.post("/api/background")
def background_upload():
    up = request.files.get("image")
    if not up:
        return err("no image")
    try:
        img = Image.open(up.stream)
        img.load()
    except Exception:
        return err("not an image")
    img = img.convert("RGB")
    if max(img.size) > 3840:
        img.thumbnail((3840, 3840))
    for e in BG_EXTS:
        try:
            os.remove(os.path.join(db.DATA_DIR, f"background.{e}"))
        except OSError:
            pass
    img.save(os.path.join(db.DATA_DIR, "background.jpg"), quality=88, optimize=True, progressive=True)
    return jsonify({"ok": True, "v": int(time.time())})


@app.delete("/api/background")
def background_delete():
    for e in BG_EXTS:
        try:
            os.remove(os.path.join(db.DATA_DIR, f"background.{e}"))
        except OSError:
            pass
    return jsonify({"ok": True})


# --------------------------------------------------------------------------- SPA
@app.get("/")
@app.get("/<path:_any>")
def index(_any=None):
    if _any and _any.startswith(("api/", "dl/", "p/")):
        abort(404)
    with open(os.path.join(app.static_folder, "index.html"), encoding="utf-8") as fh:
        bg = background_path()
        html = fh.read().replace("__VERSION__", VERSION).replace(
            "__BGVER__", str(int(os.path.getmtime(bg))) if bg else "")
    return Response(html, mimetype="text/html", headers={"Cache-Control": "no-cache"})


@app.errorhandler(413)
def too_large(_e):
    return err(f"upload too large (limit {MAX_UPLOAD_MB} MB)", 413)


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return err("not found", 404)
    return _e


_migrate_background()
if "1" not in (os.environ.get("ZHOPDECK_NO_BACKGROUND"), os.environ.get("LAYERDECK_NO_BACKGROUND")):
    threading.Thread(target=_watchdog, name="watchdog", daemon=True).start()
    lib.start_background()
    sm.start_background()
    autolog.start_background(calc_cost)
