"""Automatic print log: import finished jobs from Moonraker's job history (Klipper printers).

Works no matter how a print was started (Z-Hop Deck, OrcaSlicer, Mainsail, AFC...). Every Moonraker job is
logged once (prints.ext_id = "mr:<printer id>:<job_id>"). Only jobs that started after auto-logging was first
enabled for a printer are imported, so old history is not dumped into the log.
"""
import logging
import math
import os
import threading
import time

import db
import printers as prn

log = logging.getLogger("zhopdeck.autolog")
POLL_SECONDS = 60
RESULT = {"completed": "success", "cancelled": "cancelled", "error": "failed", "klippy_shutdown": "failed",
          "klippy_disconnect": "failed", "interrupted": "failed", "server_exit": "failed"}
_lock = threading.Lock()


def enabled():
    return db.setting("auto_print_log", "1") == "1"


def _grams(mm, spool):
    dia = (spool or {}).get("diameter") or 1.75
    dens = (spool or {}).get("density") or float(db.setting("default_density", "1.24") or 1.24)
    return round(math.pi * (dia / 20) ** 2 * (mm / 10) * dens, 2)  # cm^2 * cm * g/cm^3


def _spool_ids(job):
    for aux in job.get("auxiliary_data") or []:
        if "spool" in str(aux.get("name", "")).lower():
            v = aux.get("value")
            if isinstance(v, list):
                return [int(x) for x in v if str(x).isdigit()]
            if str(v).isdigit():
                return [int(v)]
    return []


def _match_file(filename):
    base = os.path.basename(filename or "")
    if not base:
        return None
    return db.q1("SELECT * FROM files WHERE name=? AND missing=0 ORDER BY mtime DESC LIMIT 1", (base,))


def import_job(p, job, calc_cost):
    """Create a print log entry for one finished Moonraker job. Returns the new print id or None."""
    status = job.get("status")
    if status not in RESULT:
        return None  # in_progress etc.
    ext_id = f"mr:{p['id']}:{job.get('job_id')}"
    if db.q1("SELECT id FROM prints WHERE ext_id=?", (ext_id,)):
        return None
    result = RESULT[status]
    f = _match_file(job.get("filename"))
    sids = _spool_ids(job)
    spool = db.q1("SELECT * FROM spools WHERE spoolman_id=?", (sids[0],)) if sids else None
    mm = float(job.get("filament_used") or 0)
    grams = _grams(mm, spool)
    dur = int(job.get("print_duration") or job.get("total_duration") or 0)
    started = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(job.get("start_time") or time.time()))
    notes = ["Logged automatically from Moonraker"]
    if len(sids) > 1:
        names = []
        for sid in sids:
            s = db.q1("SELECT name FROM spools WHERE spoolman_id=?", (sid,))
            names.append(f"{s['name']} (#{sid})" if s else f"#{sid}")
        notes.append("Spools: " + ", ".join(names))
    cost = calc_cost(grams, dur, spool, p, db.settings())
    with db.tx():
        pid = db.ex("""INSERT INTO prints(file_id, file_name, printer_id, spool_id, started_at, duration_s, grams, copies,
                       result, cost, notes, ext_id) VALUES (?,?,?,?,?,?,?,1,?,?,?,?)""",
                    (f["id"] if f else None, (f["title"] or f["name"]) if f else os.path.basename(job.get("filename") or "?"),
                     p["id"], spool["id"] if spool else None, started, dur, grams, result, cost, " · ".join(notes), ext_id))
        # local (non-Spoolman) spools: deduct here; Spoolman spools are kept up to date by Moonraker/AFC itself
        if spool and not spool.get("spoolman_id") and grams:
            db.ex("UPDATE spools SET weight_used=MIN(weight_total, weight_used+?) WHERE id=?", (grams, spool["id"]))
        if f:
            if result == "success":
                db.ex("UPDATE files SET status='printed' WHERE id=?", (f["id"],))
                q = db.q1("SELECT id FROM queue WHERE file_id=? ORDER BY position LIMIT 1", (f["id"],))
                if q:
                    db.ex("DELETE FROM queue WHERE id=?", (q["id"],))
            elif result == "failed" and f["status"] != "printed":
                db.ex("UPDATE files SET status='failed' WHERE id=?", (f["id"],))
            elif result == "cancelled" and f["status"] == "printing":
                db.ex("UPDATE files SET status='want' WHERE id=?", (f["id"],))
    log.info("auto-logged %s on %s: %s, %.1f g, %d s", job.get("filename"), p["name"], result, grams, dur)
    return pid


def sync_printer(p, calc_cost):
    key = f"autolog_since_{p['id']}"
    since = db.setting(key)
    if since is None:  # first time: start from now, don't import the whole history
        db.set_setting(key, str(int(time.time())))
        return 0
    try:
        r = prn._req(p, "GET", "/server/history/list?limit=100&order=desc")
    except prn.PrinterError as e:
        log.debug("history %s: %s", p["name"], e)
        return 0
    jobs = (r.get("result") or {}).get("jobs") or []
    n = 0
    for job in sorted(jobs, key=lambda j: j.get("start_time") or 0):
        if (job.get("start_time") or 0) < float(since):
            continue
        try:
            if import_job(p, job, calc_cost):
                n += 1
        except Exception:
            log.exception("auto-log of job %s failed", job.get("job_id"))
    return n


def sync_all(calc_cost):
    if not enabled():
        return 0
    with _lock:
        total = 0
        for p in db.q("SELECT * FROM printers WHERE conn_type='moonraker'"):
            total += sync_printer(p, calc_cost)
        return total


def start_background(calc_cost):
    def loop():
        while True:
            try:
                sync_all(calc_cost)
            except Exception:
                log.exception("auto print log failed")
            time.sleep(POLL_SECONDS)
    threading.Thread(target=loop, daemon=True, name="autolog").start()
