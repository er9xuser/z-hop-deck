"""Talk to network printers: Moonraker (Klipper), OctoPrint, PrusaLink. Standard library only."""
import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
import uuid

TYPES = {"moonraker": "Klipper / Moonraker", "octoprint": "OctoPrint", "prusalink": "PrusaLink"}
TIMEOUT = 6
UPLOAD_TIMEOUT = 900


class PrinterError(Exception):
    pass


def _ctx():
    # printers on the LAN almost always use self-signed certificates
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def _base(p):
    url = (p.get("conn_url") or "").strip().rstrip("/")
    if not url:
        raise PrinterError("no address configured")
    if not url.startswith(("http://", "https://")):
        url = "http://" + url
    return url


def _headers(p, extra=None):
    h = {"Accept": "application/json", "User-Agent": "Z-Hop Deck"}
    if p.get("conn_key"):
        h["X-Api-Key"] = p["conn_key"]
    h.update(extra or {})
    return h


def _req(p, method, path, data=None, headers=None, timeout=TIMEOUT):
    req = urllib.request.Request(_base(p) + path, data=data, method=method, headers=_headers(p, headers))
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as r:
            body = r.read()
            if not body:
                return {}
            if "html" in (r.headers.get("Content-Type") or "") or body[:15].lstrip().lower().startswith((b"<!doctype", b"<html")):
                raise PrinterError(
                    "got a web page instead of printer data (login page or the web UI itself) – use the printer's "
                    "IP address here, e.g. http://192.168.0.x, and put the domain into 'Web address'")
            try:
                return json.loads(body)
            except ValueError:
                return {"raw": body[:500].decode("utf-8", "ignore")}
    except urllib.error.HTTPError as e:
        msg = e.read()[:300].decode("utf-8", "ignore")
        if e.code in (401, 403):
            raise PrinterError(f"access denied ({e.code}) - check the API key")
        if e.code == 409 and p.get("conn_type") == "octoprint":
            return {"_409": True}
        raise PrinterError(f"HTTP {e.code}: {msg or e.reason}")
    except urllib.error.URLError as e:
        raise PrinterError(f"cannot reach printer: {e.reason}")
    except TimeoutError:
        raise PrinterError("printer did not answer (timeout)")


def _multipart_stream(path, filename, fields):
    """Builds a multipart body as a file-like object without loading the file into memory."""
    boundary = uuid.uuid4().hex
    pre = b""
    for k, v in fields.items():
        pre += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
    pre += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode()
    post = f"\r\n--{boundary}--\r\n".encode()
    size = len(pre) + os.path.getsize(path) + len(post)

    class Body:
        def __init__(self):
            self.parts = [pre, open(path, "rb"), post]

        def read(self, n=-1):
            while self.parts:
                part = self.parts[0]
                if isinstance(part, bytes):
                    self.parts.pop(0)
                    if part:
                        return part
                    continue
                chunk = part.read(1 << 20 if n is None or n < 0 else n)
                if chunk:
                    return chunk
                part.close()
                self.parts.pop(0)
            return b""

    return Body(), size, f"multipart/form-data; boundary={boundary}"


# --------------------------------------------------------------------------- status
def status(p):
    """Normalised status: state, file, progress (0-1), remaining_s, nozzle, bed (temps: [actual, target])."""
    t = p.get("conn_type")
    if t == "moonraker":
        r = _req(p, "GET", "/printer/objects/query?print_stats&display_status&extruder&heater_bed&virtual_sdcard")
        s = r.get("result", {}).get("status", {})
        ps, ds = s.get("print_stats", {}), s.get("display_status", {})
        prog = ds.get("progress") or s.get("virtual_sdcard", {}).get("progress") or 0
        dur = ps.get("print_duration") or 0
        remaining = int(dur / prog - dur) if prog > 0.01 and dur else None
        ex, bed = s.get("extruder", {}), s.get("heater_bed", {})
        out = {"state": ps.get("state", "unknown"), "file": ps.get("filename") or None, "progress": prog,
               "remaining_s": remaining, "nozzle": [ex.get("temperature"), ex.get("target")],
               "bed": [bed.get("temperature"), bed.get("target")], "message": ps.get("message") or ds.get("message")}
        try:  # Moonraker's [spoolman] section: which spool is loaded right now
            sid = _req(p, "GET", "/server/spoolman/spool_id", timeout=3).get("result", {}).get("spool_id")
            if sid:
                out["spoolman_spool_id"] = sid
        except PrinterError:
            pass
        return out
    if t == "octoprint":
        job = _req(p, "GET", "/api/job")
        pr = _req(p, "GET", "/api/printer")
        temps = pr.get("temperature", {}) if not pr.get("_409") else {}
        t0, bed = temps.get("tool0", {}), temps.get("bed", {})
        prog = (job.get("progress") or {}).get("completion")
        return {"state": (job.get("state") or "unknown").lower() if not pr.get("_409") else "disconnected",
                "file": ((job.get("job") or {}).get("file") or {}).get("name"),
                "progress": (prog or 0) / 100, "remaining_s": (job.get("progress") or {}).get("printTimeLeft"),
                "nozzle": [t0.get("actual"), t0.get("target")], "bed": [bed.get("actual"), bed.get("target")]}
    if t == "prusalink":
        r = _req(p, "GET", "/api/v1/status")
        pr, job = r.get("printer", {}), r.get("job") or {}
        return {"state": (pr.get("state") or "unknown").lower(), "file": None,
                "progress": (job.get("progress") or 0) / 100, "remaining_s": job.get("time_remaining"),
                "nozzle": [pr.get("temp_nozzle"), pr.get("target_nozzle")], "bed": [pr.get("temp_bed"), pr.get("target_bed")]}
    raise PrinterError("printer has no connection configured")


# --------------------------------------------------------------------------- upload
def upload(p, path, filename, start=False):
    t = p.get("conn_type")
    filename = filename.replace("/", "_").replace("\\", "_")
    if t == "moonraker":
        fields = {"root": "gcodes"}
        if start:
            fields["print"] = "true"
        body, size, ctype = _multipart_stream(path, filename, fields)
        _req(p, "POST", "/server/files/upload", data=body,
             headers={"Content-Type": ctype, "Content-Length": str(size)}, timeout=UPLOAD_TIMEOUT)
        return {"uploaded": filename, "started": start}
    if t == "octoprint":
        fields = {"select": "true", "print": "true"} if start else {}
        body, size, ctype = _multipart_stream(path, filename, fields)
        _req(p, "POST", "/api/files/local", data=body,
             headers={"Content-Type": ctype, "Content-Length": str(size)}, timeout=UPLOAD_TIMEOUT)
        return {"uploaded": filename, "started": start}
    if t == "prusalink":
        size = os.path.getsize(path)
        with open(path, "rb") as fh:
            _req(p, "PUT", "/api/v1/files/usb/" + urllib.parse.quote(filename), data=fh,
                 headers={"Content-Type": "application/octet-stream", "Content-Length": str(size),
                          "Overwrite": "?1", "Print-After-Upload": "?1" if start else "?0"}, timeout=UPLOAD_TIMEOUT)
        return {"uploaded": filename, "started": start}
    raise PrinterError("printer has no connection configured")


def can_print(p, ext):
    t = p.get("conn_type")
    if t == "prusalink":
        return ext in ("gcode", "gco", "g", "bgcode")
    if t in ("moonraker", "octoprint"):
        return ext in ("gcode", "gco", "g")
    return False
