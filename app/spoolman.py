"""Spoolman (https://github.com/Donkie/Spoolman) integration: pull spools, report filament use."""
import json
import logging
import ssl
import threading
import time
import urllib.error
import urllib.request

import db

log = logging.getLogger("zhopdeck.spoolman")
TIMEOUT = 8
_last = {"at": None, "error": None, "count": 0}
_lock = threading.Lock()


class SpoolmanError(Exception):
    pass


def base_url(url=None):
    url = (url if url is not None else db.setting("spoolman_url", "") or "").strip().rstrip("/")
    if url and not url.startswith(("http://", "https://")):
        url = "http://" + url
    return url


def _ctx():
    # home-lab proxies (NPMplus etc.) usually use self-signed certificates
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def _req(method, path, body=None, url=None):
    b = base_url(url)
    if not b:
        raise SpoolmanError("Spoolman address is not set")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(b + path, data=data, method=method,
                                 headers={"Accept": "application/json", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=_ctx()) as r:
            raw = r.read()
            ctype = r.headers.get("Content-Type", "")
            if "html" in ctype or raw[:15].lstrip().lower().startswith((b"<!doctype", b"<html")):
                where = r.geturl()
                raise SpoolmanError(
                    "got a web page instead of Spoolman data" + (f" ({where.split('?')[0]})" if where else "") +
                    " – probably the Authelia login. Add the Z-Hop Deck server's IP to a bypass rule for this "
                    "domain, or use Spoolman directly: http://<voron-ip>:7912")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise SpoolmanError(f"Spoolman answered HTTP {e.code}: {e.read()[:200].decode('utf-8', 'ignore')}")
    except urllib.error.URLError as e:
        raise SpoolmanError(f"cannot reach Spoolman: {e.reason}")
    except (TimeoutError, ValueError) as e:
        raise SpoolmanError(f"Spoolman error: {e}")


def test(url):
    info = _req("GET", "/api/v1/info", url=url)
    spools = _req("GET", "/api/v1/spool?allow_archived=true", url=url)
    return {"version": info.get("version"), "spools": len(spools)}


def _color(fil):
    c = (fil.get("color_hex") or "").strip().lstrip("#")
    if not c and fil.get("multi_color_hexes"):
        c = fil["multi_color_hexes"].split(",")[0].strip().lstrip("#")
    return "#" + c[:6] if len(c) >= 6 else "#cccccc"


def sync():
    """Mirror all Spoolman spools into the local spools table (Spoolman is the source of truth)."""
    with _lock:
        try:
            spools = _req("GET", "/api/v1/spool?allow_archived=true")
        except SpoolmanError as e:
            _last.update(at=time.strftime("%Y-%m-%d %H:%M:%S"), error=str(e))
            raise
        seen = set()
        for sp in spools:
            fil = sp.get("filament") or {}
            vendor = (fil.get("vendor") or {}).get("name") or ""
            total = sp.get("initial_weight") or fil.get("weight") or 1000
            used = sp.get("used_weight")
            if used is None and sp.get("remaining_weight") is not None:
                used = total - sp["remaining_weight"]
            price = sp.get("price") if sp.get("price") is not None else (fil.get("price") or 0)
            name = fil.get("name") or f"Spool {sp['id']}"
            row = {"name": name, "brand": vendor, "material": fil.get("material") or "", "color": _color(fil),
                   "diameter": fil.get("diameter") or 1.75, "weight_total": total, "weight_used": used or 0,
                   "price": price, "density": fil.get("density") or 1.24,
                   "archived": 1 if sp.get("archived") else 0, "spoolman_id": sp["id"]}
            existing = db.q1("SELECT id FROM spools WHERE spoolman_id=?", (sp["id"],))
            if existing:
                db.ex(f"UPDATE spools SET {', '.join(k + '=?' for k in row)} WHERE id=?", list(row.values()) + [existing["id"]])
            else:
                db.ex(f"INSERT INTO spools({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", list(row.values()))
            seen.add(sp["id"])
        # spools deleted in Spoolman: keep them locally (print history), but archive them
        for r in db.q("SELECT id, spoolman_id FROM spools WHERE spoolman_id IS NOT NULL"):
            if r["spoolman_id"] not in seen:
                db.ex("UPDATE spools SET archived=1 WHERE id=?", (r["id"],))
        _last.update(at=time.strftime("%Y-%m-%d %H:%M:%S"), error=None, count=len(spools))
        return {"synced": len(spools)}


def use(spoolman_id, grams):
    """Report used filament to Spoolman (it decreases the remaining weight)."""
    return _req("PUT", f"/api/v1/spool/{int(spoolman_id)}/use", {"use_weight": float(grams)})


def status():
    return dict(_last, configured=bool(base_url()))


def _loop():
    while True:
        time.sleep(300)
        if base_url():
            try:
                sync()
            except SpoolmanError as e:
                log.info("Spoolman sync failed: %s", e)


def start_background():
    threading.Thread(target=_loop, daemon=True, name="spoolman").start()
    if base_url():
        threading.Thread(target=lambda: _safe_sync(), daemon=True).start()


def _safe_sync():
    try:
        sync()
    except SpoolmanError as e:
        log.info("Spoolman sync failed: %s", e)
