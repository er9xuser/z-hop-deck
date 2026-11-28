"""Library scanning, file analysis, thumbnails and the background worker."""
import gc
import hashlib
import subprocess
import sys
import io
import json
import logging
import os
import queue
import re
import shutil
import tempfile
import threading
import time
import zipfile

from PIL import Image

import numpy as np

import db
import meshes
import parsers

log = logging.getLogger("zhopdeck.library")

ANALYZER_VERSION = 3
RENDER_VERSION = "2"  # bump when the thumbnail renderer changes -> previews are regenerated once
LIBRARY_DIRS = [os.path.normpath(p.strip()) for p in os.environ.get("LIBRARY_DIRS", "/library").split(",") if p.strip()]
UPLOAD_ROOT = os.path.normpath(os.environ.get("UPLOAD_DIR", LIBRARY_DIRS[0]))
THUMB_DIR = os.path.join(db.DATA_DIR, "thumbs")
SCAD_DIR = os.path.join(db.DATA_DIR, "scad")
OPENSCAD = shutil.which(os.environ.get("OPENSCAD_BIN", "openscad"))
SCAD_TIMEOUT = int(os.environ.get("SCAD_TIMEOUT", "180"))
STEP_DIR = os.path.join(db.DATA_DIR, "step")
STEP_TIMEOUT = int(os.environ.get("STEP_TIMEOUT", "300"))
STEP_EXTS = ("step", "stp")


def _step_available():
    import importlib.util
    try:
        return bool(importlib.util.find_spec("trimesh") and importlib.util.find_spec("cascadio"))
    except Exception:
        return False


STEP_OK = _step_available()
TRASH_DIR = os.path.join(db.DATA_DIR, "trash")

KINDS = {
    "stl": "mesh", "obj": "mesh", "3mf": "mesh",
    "step": "cad", "stp": "cad", "iges": "cad", "igs": "cad", "f3d": "cad", "f3z": "cad", "scad": "cad",
    "blend": "cad", "fcstd": "cad", "skp": "cad", "dwg": "cad", "dxf": "cad",
    "easm": "cad", "eprt": "cad", "edrw": "cad", "sldprt": "cad", "sldasm": "cad",  # eDrawings / SolidWorks
    "gcode": "gcode", "gco": "gcode", "g": "gcode", "bgcode": "gcode",
    "zip": "archive",
}
IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}
# CAD formats that often carry a preview picture inside (SketchUp, eDrawings, SolidWorks, DWG)
EMBEDDED_PIC_EXTS = {"skp", "easm", "eprt", "edrw", "sldprt", "sldasm", "dwg"}
SKIP_DIRS = {"@eaDir", "#recycle", "#snapshot", "$RECYCLE.BIN", "System Volume Information", "lost+found"}

status = {"state": "idle", "phase": "", "done": 0, "total": 0, "current": "", "last_scan": None,
          "last_result": None, "pending_analysis": 0}
_status_lock = threading.Lock()
_jobs = queue.Queue()
_queued_scan = threading.Event()


def set_status(**kw):
    with _status_lock:
        status.update(kw)


def get_status():
    with _status_lock:
        s = dict(status)
    s["pending_analysis"] = (db.q1("SELECT COUNT(*) n FROM files WHERE missing=0 AND analyzed<?",
                                   (ANALYZER_VERSION,)) or {"n": 0})["n"]
    # cheap fingerprint of the library: changes when a file is added / removed / analysed / gets a new preview,
    # so open pages can refresh themselves without reloading everything on a timer
    r = db.q1("SELECT COUNT(*) n, COALESCE(MAX(id),0) mx, COALESCE(SUM(analyzed),0) an, COALESCE(SUM(thumb),0) th, "
              "COALESCE(SUM(mtime),0) mt FROM files WHERE missing=0") or {}
    pr = db.q1("SELECT COUNT(*) n, COALESCE(MAX(id),0) mx FROM prints") or {}
    q = db.q1("SELECT COUNT(*) n FROM queue") or {}
    st = db.q1("SELECT COUNT(*) n FROM files WHERE missing=0 AND status='printed'") or {}
    # ...plus prints / queue / printed status, so Home's numbers follow an automatically logged print
    s["lib_sig"] = (f"{r.get('n')}.{r.get('mx')}.{r.get('an')}.{r.get('th')}.{int(r.get('mt') or 0)}"
                    f".{pr.get('n')}.{pr.get('mx')}.{q.get('n')}.{st.get('n')}")
    return s


def ext_of(name):
    n = name.lower()
    if n.endswith(".gcode.3mf"):
        return "3mf"
    return n.rsplit(".", 1)[-1] if "." in n else ""


def is_supported(name):
    return ext_of(name) in KINDS


def root_for(path):
    path = os.path.normpath(path)
    for r in LIBRARY_DIRS:
        if path == r or path.startswith(r.rstrip("/") + "/"):
            return r
    return None


def library_root(value, default=None):
    """The configured library root equal to `value` (the configured string itself, never the user's input),
    or `default` when it is not one of them."""
    for r in LIBRARY_DIRS:
        if value == r:
            return r
    return default


def safe_join(root, rel):
    """Join a user-supplied relative path to a library root, refusing traversal ("..", absolute paths, NUL)."""
    base = library_root(root)
    if base is None:  # a folder inside a library (e.g. the result of an earlier safe_join)
        base = os.path.normpath(root or "")
        if not any(base.startswith(r.rstrip("/") + "/") for r in LIBRARY_DIRS):
            raise ValueError("unknown library folder")
    rel = (rel or "").replace("\\", "/").strip("/")
    if "\0" in rel:
        raise ValueError("invalid path")
    p = os.path.normpath(os.path.join(base, rel))
    if p == base:
        return base
    if not p.startswith(base.rstrip("/") + "/"):  # normalised path must stay below the base
        raise ValueError("path outside library")
    return p


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def thumb_path(fid):
    return os.path.join(THUMB_DIR, f"{fid}.webp")


def _atomic_webp(img, path):
    """Write to a temp file and rename, so a browser never receives a half-written image."""
    img = img.convert("RGBA")
    img.thumbnail((640, 640), Image.LANCZOS)
    tmp = f"{path}.{threading.get_ident()}.tmp"
    img.save(tmp, "WEBP", quality=88, method=4)
    os.replace(tmp, path)


def save_thumb(fid, img):
    _atomic_webp(img, thumb_path(fid))


# --------------------------------------------------------------------------- registration
_id_lock = threading.Lock()


def next_file_id():
    """Never hand out the id of a deleted file again (thumbnails, browser caches and links stay unambiguous)."""
    with _id_lock:
        cur = (db.q1("SELECT MAX(id) m FROM files") or {}).get("m") or 0
        hw = int(db.setting("files_id_hw", "0") or 0)
        nid = max(cur, hw) + 1
        db.set_setting("files_id_hw", nid)
        return nid

def register(path, st=None):
    """Insert or update a single file row. Returns (id, changed)."""
    path = os.path.normpath(path)
    root = root_for(path)
    if root is None:
        return None, False
    st = st or os.stat(path)
    row = db.q1("SELECT id, size, mtime, missing FROM files WHERE path=?", (path,))
    rel_folder = os.path.relpath(os.path.dirname(path), root)
    rel_folder = "" if rel_folder == "." else rel_folder.replace("\\", "/")
    name = os.path.basename(path)
    ext = ext_of(name)
    if row:
        if row["size"] == st.st_size and abs((row["mtime"] or 0) - st.st_mtime) < 0.001 and not row["missing"]:
            return row["id"], False
        sha = sha256_file(path)
        db.ex("UPDATE files SET size=?, mtime=?, sha256=?, missing=0, analyzed=0, folder=?, name=? WHERE id=?",
              (st.st_size, st.st_mtime, sha, rel_folder, name, row["id"]))
        return row["id"], True
    sha = sha256_file(path)
    # moved/renamed file? re-link the old record so tags, notes and history survive
    moved = db.q1("SELECT id FROM files WHERE sha256=? AND missing=1 ORDER BY id LIMIT 1", (sha,))
    if moved:
        db.ex("UPDATE files SET path=?, root=?, folder=?, name=?, ext=?, size=?, mtime=?, missing=0 WHERE id=?",
              (path, root, rel_folder, name, ext, st.st_size, st.st_mtime, moved["id"]))
        return moved["id"], True
    fid = next_file_id()
    db.ex("INSERT INTO files(id, path, root, folder, name, ext, kind, size, mtime, sha256) VALUES (?,?,?,?,?,?,?,?,?,?)",
          (fid, path, root, rel_folder, name, ext, KINDS.get(ext, "other"), st.st_size, st.st_mtime, sha))
    return fid, True


def scan():
    t0 = time.time()
    set_status(state="scanning", phase="Scanning folders", done=0, total=0, current="")
    seen, new, changed, roots_ok = set(), 0, 0, []
    found = []
    for root in LIBRARY_DIRS:
        if not os.path.isdir(root):
            log.warning("library root %s not available - skipping (files will not be marked missing)", root)
            continue
        roots_ok.append(root)
        for dirpath, dirnames, filenames in os.walk(root, followlinks=True):
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS]
            for fn in filenames:
                if fn.startswith(".") or not is_supported(fn):
                    continue
                found.append(os.path.join(dirpath, fn))
    set_status(total=len(found), phase="Indexing files")
    # mark vanished paths missing *before* registering, so moved files can be re-linked by hash
    found_set = {os.path.normpath(p) for p in found}
    for r in roots_ok:
        for x in db.q("SELECT id, path FROM files WHERE root=? AND missing=0", (r,)):
            if x["path"] not in found_set:
                db.ex("UPDATE files SET missing=1 WHERE id=?", (x["id"],))
    for i, p in enumerate(found):
        try:
            st = os.stat(p)
            before = db.q1("SELECT id FROM files WHERE path=?", (os.path.normpath(p),))
            fid, ch = register(p, st)
            if fid:
                seen.add(fid)
                if ch:
                    if before:
                        changed += 1
                    else:
                        new += 1
        except OSError as e:
            log.warning("cannot index %s: %s", p, e)
        if i % 25 == 0:
            set_status(done=i, current=os.path.basename(p))
    missing = sum(db.q1("SELECT COUNT(*) n FROM files WHERE root=? AND missing=1", (r,))["n"] for r in roots_ok)
    result = {"found": len(found), "new": new, "changed": changed, "missing": missing,
              "seconds": round(time.time() - t0, 1)}
    set_status(last_scan=time.strftime("%Y-%m-%d %H:%M:%S"), last_result=result)
    log.info("scan done: %s", result)
    analyze_pending()
    return result


# --------------------------------------------------------------------------- OpenSCAD
class ScadError(Exception):
    pass


def scad_cache_path(f):
    return os.path.join(SCAD_DIR, f"{f['id']}_{int(f['mtime'] or 0)}_{f['size'] or 0}.stl")


def scad_stl(f, force=False):
    """Render a .scad file to a cached binary STL with the OpenSCAD CLI. Returns the STL path."""
    if not OPENSCAD:
        raise ScadError("OpenSCAD is not installed in this container")
    os.makedirs(SCAD_DIR, exist_ok=True)
    out = scad_cache_path(f)
    if os.path.exists(out) and not force:
        return out
    for old in os.listdir(SCAD_DIR):
        if old.startswith(f"{f['id']}_"):
            try:
                os.remove(os.path.join(SCAD_DIR, old))
            except OSError:
                pass
    tmp = out + ".tmp.stl"
    cmd = [OPENSCAD, "-o", tmp, "--export-format", "binstl", f["path"]]
    # OpenSCAD writes settings to $HOME/.config - give it a home we can write to, whatever user we run as
    home = os.path.join(db.DATA_DIR, ".home")
    os.makedirs(os.path.join(home, ".config"), exist_ok=True)
    env = dict(os.environ, HOME=home, XDG_CONFIG_HOME=os.path.join(home, ".config"),
               XDG_CACHE_HOME=os.path.join(home, ".cache"), QT_QPA_PLATFORM="offscreen")
    try:
        r = subprocess.run(cmd, cwd=os.path.dirname(f["path"]), capture_output=True, text=True,
                           timeout=SCAD_TIMEOUT, env=env)
        if r.returncode != 0 and "export-format" in (r.stderr or ""):  # very old OpenSCAD
            r = subprocess.run(cmd[:3] + cmd[5:], cwd=os.path.dirname(f["path"]), capture_output=True, text=True,
                               timeout=SCAD_TIMEOUT, env=env)
    except subprocess.TimeoutExpired:
        raise ScadError(f"rendering took longer than {SCAD_TIMEOUT} s (raise SCAD_TIMEOUT)")
    log_txt = (r.stderr or "") + (r.stdout or "")
    if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 84:
        if os.path.exists(tmp):
            os.remove(tmp)
        if "top level object is empty" in log_txt.lower():
            raise ScadError("no 3D output – probably a library file that only defines modules")
        errs = [l.strip() for l in log_txt.splitlines() if l.strip().startswith(("ERROR", "WARNING: Can't open", "Can't open"))]
        raise ScadError((errs[-1] if errs else log_txt.strip().splitlines()[-1] if log_txt.strip() else "OpenSCAD failed")[:300])
    os.replace(tmp, out)
    return out


def step_stl(f, force=False):
    """Convert a STEP file to a cached binary STL (separate process, timeout)."""
    if not STEP_OK:
        raise ScadError("STEP support (cascadio) is not installed in this container")
    os.makedirs(STEP_DIR, exist_ok=True)
    out = os.path.join(STEP_DIR, f"{f['id']}_{int(f['mtime'] or 0)}_{f['size'] or 0}.stl")
    if os.path.exists(out) and not force:
        return out
    for old in os.listdir(STEP_DIR):
        if old.startswith(f"{f['id']}_"):
            try:
                os.remove(os.path.join(STEP_DIR, old))
            except OSError:
                pass
    tmp = out + ".tmp.stl"
    home = os.path.join(db.DATA_DIR, ".home")
    os.makedirs(home, exist_ok=True)
    env = dict(os.environ, HOME=home, OMP_NUM_THREADS="2")
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "step2stl.py")
    try:
        r = subprocess.run([sys.executable, script, f["path"], tmp, os.environ.get("STEP_TOLERANCE", "0.05")],
                           capture_output=True, text=True, timeout=STEP_TIMEOUT, env=env)
    except subprocess.TimeoutExpired:
        raise ScadError(f"STEP conversion took longer than {STEP_TIMEOUT} s (raise STEP_TIMEOUT)")
    if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 84:
        if os.path.exists(tmp):
            os.remove(tmp)
        msg = (r.stderr or r.stdout or "").strip().splitlines()
        if r.returncode < 0 or r.returncode == 137:
            raise ScadError("STEP conversion was killed – probably out of memory (model too large for the container)")
        raise ScadError((msg[-1] if msg else "STEP conversion failed")[:300])
    os.replace(tmp, out)
    return out


def load_preview_mesh(f, force=False):
    """Triangles for any previewable file (STL/OBJ/3MF directly, SCAD through OpenSCAD, STEP through OpenCASCADE)."""
    if f["ext"] == "scad":
        return meshes.load_stl(scad_stl(f, force=force))
    if f["ext"] in STEP_EXTS:
        return meshes.load_stl(step_stl(f, force=force))
    return meshes.load_mesh(f["path"], f["ext"])


def load_preview_colored(f):
    """(tris, colour index per triangle or None, palette or None) - colours only for multi-colour 3MF."""
    if f["ext"] == "3mf":
        return meshes.load_mesh_colored(f["path"], "3mf")
    return load_preview_mesh(f), None, None


def can_preview_mesh(f):
    return f["ext"] in meshes.MESH_EXTS or (f["ext"] in ("scad",) + STEP_EXTS and f["dim_x"] is not None)


# --------------------------------------------------------------------------- analysis
def _folder_image(path, any_image=True):
    """An image next to the file: same-name image first, else (optionally) any image in the folder."""
    d = os.path.dirname(path)
    stem = os.path.basename(path).rsplit(".", 1)[0].lower()
    try:
        imgs = [f for f in os.listdir(d) if ext_of(f) in IMAGE_EXTS and not f.startswith(".")]
    except OSError:
        return None
    imgs.sort(key=lambda f: (0 if f.lower().startswith(stem) else 1, f.lower()))
    if not imgs or (not any_image and not imgs[0].lower().startswith(stem)):
        return None
    try:
        im = Image.open(os.path.join(d, imgs[0]))
        im.load()
        return im
    except Exception:
        return None


# --------------------------------------------------------------------------- crash guard
# Heavy background work (rendering a preview, converting a STEP file...) is marked in the database while it runs.
# If the process dies in the middle (out of memory -> SIGKILL), the next start finds the mark and skips that
# item instead of trying it again and again, which would kill the worker in a loop.
try:
    import ctypes
    _libc = ctypes.CDLL("libc.so.6")
except Exception:  # not glibc
    _libc = None


def release_memory():
    """Give freed memory back to the OS. Without this a long-running Python process keeps the peak of every big
    preview it ever rendered, and the next big one pushes it over the container memory limit."""
    gc.collect()
    if _libc is not None:
        try:
            _libc.malloc_trim(0)
        except Exception:
            pass


def _busy(what):
    db.set_setting("busy:" + what, "1")


def _idle(what):
    db.ex("DELETE FROM settings WHERE key IN (?, ?)", ("busy:" + what, "retry:" + what))


def guarded(what):
    """Context manager: mark heavy work so a crash in the middle is recognised on the next start."""
    class _G:
        def __enter__(self):
            _busy(what)

        def __exit__(self, *a):
            _idle(what)
            release_memory()
    return _G()


def skipped(key, ident):
    return str(ident) in (db.setting(key) or "").split(",")


def _oom_kills():
    """How many processes the kernel OOM-killed in this container (cgroup v2 / v1), or None if unknown."""
    try:
        with open("/sys/fs/cgroup/memory.events") as fh:
            for line in fh:
                k, _, v = line.partition(" ")
                if k == "oom_kill":
                    return int(v)
    except (OSError, ValueError):
        pass
    try:
        with open("/sys/fs/cgroup/memory/memory.oom_control") as fh:
            for line in fh:
                k, _, v = line.partition(" ")
                if k == "oom_kill":
                    return int(v)
    except (OSError, ValueError):
        pass
    return None


def _container_id():
    return os.environ.get("HOSTNAME") or os.uname().nodename


def _died_of_oom():
    """Was the previous run killed for memory - or just stopped (update, docker restart, LXC reboot)?
    A gunicorn worker killed by the OOM killer is restarted inside the SAME container, whose cgroup counts the
    kill. A recreated / restarted container starts from a clean count, so that was a normal restart."""
    now = _oom_kills()
    ref = db.setting("oom_ref") or ""
    cid, _, old = ref.rpartition(":")
    if now is None or not ref:
        return True            # can't tell: be safe, as before
    if cid != _container_id():
        return False           # new container -> it was stopped / recreated, not killed
    try:
        return now > int(old)
    except ValueError:
        return True


def _recover_from_crash():
    busy = [r["key"] for r in db.q("SELECT key FROM settings WHERE key LIKE 'busy:%'")]
    oom = bool(busy) and _died_of_oom()
    for key in busy:
        db.ex("DELETE FROM settings WHERE key=?", (key,))
        what = key[5:]
        tries = int(db.setting("retry:" + what) or 0) + 1
        if oom or tries >= 3:  # really out of memory - or it keeps dying on this one: stop trying
            db.ex("DELETE FROM settings WHERE key=?", ("retry:" + what,))
            _recover_one(what)
        else:                  # interrupted by a restart: just do it again
            db.set_setting("retry:" + what, str(tries))
            log.warning("previous run was stopped while working on %s - will try it again", what)
            kind, _, ident = what.partition(":")
            if kind == "file" and ident.isdigit():
                db.ex("UPDATE files SET analyzed=0 WHERE id=?", (int(ident),))
    n = _oom_kills()
    if n is not None:
        db.set_setting("oom_ref", f"{_container_id()}:{n}")


def _recover_one(what):
    kind, _, ident = what.partition(":")
    if kind == "file" and ident.isdigit():
        f = db.q1("SELECT name, size FROM files WHERE id=?", (int(ident),))
        log.error("previous run died while analysing file %s (%s) - probably out of memory; skipping its preview",
                  ident, f["name"] if f else "?")
        db.ex("UPDATE files SET analyzed=?, thumb=CASE WHEN thumb=3 THEN 3 ELSE 0 END, error=? WHERE id=?",
              (ANALYZER_VERSION, "preview skipped: the server ran out of memory on this file (raise MEM_LIMIT, then "
                                 "Re-generate preview)", int(ident)))
    elif kind in ("view", "viewb") and ident.isdigit():
        log.error("previous run died while preparing the 3D view of %s %s - probably out of memory; "
                  "the 3D view of it is disabled", "file" if kind == "view" else "model folder", ident)
        key = "view_skip" if kind == "view" else "viewb_skip"
        skip = set(filter(None, (db.setting(key) or "").split(",")))
        skip.add(ident)
        db.set_setting(key, ",".join(sorted(skip)))
    elif kind == "bundle" and ident.isdigit():
        log.error("previous run died while rendering the preview of model folder %s - probably out of memory; "
                  "using a part preview instead", ident)
        skip = set(filter(None, (db.setting("bundle_skip") or "").split(",")))
        skip.add(ident)
        db.set_setting("bundle_skip", ",".join(sorted(skip)))


def analyze(fid, force_thumb=False):
    _busy(f"file:{fid}")
    try:
        return _analyze(fid, force_thumb)
    finally:
        _idle(f"file:{fid}")
        release_memory()


def _analyze(fid, force_thumb=False):
    f = db.q1("SELECT * FROM files WHERE id=?", (fid,))
    if not f or f["missing"]:
        return
    path, ext = f["path"], f["ext"]
    color = db.setting("render_color", "#f29d38")
    meta, thumb_img, thumb_kind, stats, err = {}, None, 0, {}, None
    kind = KINDS.get(ext, "other")
    try:
        if ext in ("stl", "obj"):
            tris = meshes.load_mesh(path, ext)
            stats = meshes.mesh_stats(tris)
            thumb_img, thumb_kind = meshes.render_thumbnail(tris, color=color), 1
        elif ext == "3mf":
            meta, emb, sliced = parsers.parse_3mf(path)
            if sliced:
                kind = "sliced"
            cidx = cpal = None
            try:
                tris, cidx, cpal = meshes.load_mesh_colored(path, ext)
                stats = meshes.mesh_stats(tris)
            except Exception as e:
                tris = None
                if not emb:
                    err = f"mesh: {e}"
            if emb is not None:
                thumb_img, thumb_kind = emb, 2
            elif tris is not None:  # multi-colour 3MF without a slicer picture: render it in its own colours
                rgb = meshes.palette_rgb(cidx, cpal) if cidx is not None else None
                thumb_img, thumb_kind = meshes.render_thumbnail(tris, color=color, tri_rgb=rgb), 1
        elif ext == "scad":
            if OPENSCAD:
                t0 = time.time()
                try:
                    tris = load_preview_mesh(f, force=force_thumb)
                    stats = meshes.mesh_stats(tris)
                    thumb_img, thumb_kind = meshes.render_thumbnail(tris, color=color), 1
                    meta = {"scad_rendered": True, "render_s": round(time.time() - t0, 1)}
                except (ScadError, meshes.MeshError) as e:
                    meta = {"scad_error": str(e)}
            else:
                meta = {"scad_error": "OpenSCAD is not installed in this container"}
        elif ext == "fcstd":  # FreeCAD: ZIP with thumbnails/Thumbnail.png
            im = parsers.zip_member_image(path, ("thumbnails/thumbnail.png",))
            if im is not None:
                thumb_img, thumb_kind = im, 2
        elif ext in EMBEDDED_PIC_EXTS:
            im = parsers.embedded_picture(path)
            if im is not None:
                thumb_img, thumb_kind = im, 2
        elif ext == "blend":
            im = parsers.blend_thumbnail(path)
            if im is not None:
                thumb_img, thumb_kind = im, 2
        elif ext in ("f3d", "f3z"):
            im = parsers.f3d_preview(path)
            if im is not None:
                thumb_img, thumb_kind = im, 2
        elif ext in STEP_EXTS:
            if STEP_OK:
                t0 = time.time()
                try:
                    tris = load_preview_mesh(f, force=force_thumb)
                    stats = meshes.mesh_stats(tris)
                    thumb_img, thumb_kind = meshes.render_thumbnail(tris, color=color), 1
                    meta = {"step_converted": True, "convert_s": round(time.time() - t0, 1)}
                except (ScadError, meshes.MeshError) as e:
                    meta = {"step_error": str(e)}
            else:
                meta = {"step_error": "STEP support is not installed in this container"}
        elif kind == "gcode":
            meta, emb = parsers.parse_gcode(path, ext)
            if emb is not None:
                thumb_img, thumb_kind = emb, 2
            elif ext != "bgcode":
                try:
                    fc = str(meta.get("filament_color") or "")
                    gc = fc if re.fullmatch(r"#[0-9a-fA-F]{6}", fc) else color  # paint it in the sliced filament
                    thumb_img, thumb_kind = meshes.render_gcode_thumbnail(path, color=gc), 1
                except Exception as e:
                    log.info("no toolpath preview for %s: %s", path, e)
        elif kind == "archive":
            items, total = parsers.zip_listing(path)
            meta = {"entries": total, "models": sum(1 for i in items if ext_of(i["name"]) in KINDS)}
            meta["listing"] = items[:300]
            # preview: biggest STL/3MF inside, else first image inside
            mesh_items = sorted([i for i in items if ext_of(i["name"]) in ("stl", "3mf", "obj")],
                                key=lambda i: -i["size"])
            with zipfile.ZipFile(path) as z:
                if mesh_items and mesh_items[0]["size"] < 300 * 1024 * 1024:
                    it = mesh_items[0]
                    with tempfile.NamedTemporaryFile(suffix="." + ext_of(it["name"]), delete=True) as tmp:
                        with z.open(it["name"]) as src:
                            shutil.copyfileobj(src, tmp)
                        tmp.flush()
                        tris = meshes.load_mesh(tmp.name, ext_of(it["name"]))
                        thumb_img, thumb_kind = meshes.render_thumbnail(tris, color=color), 1
                else:
                    imgs = [i for i in items if ext_of(i["name"]) in IMAGE_EXTS]
                    if imgs:
                        im = Image.open(io.BytesIO(z.read(imgs[0]["name"])))
                        im.load()
                        thumb_img, thumb_kind = im, 4
    except Exception as e:  # keep going - a broken file must never stop the library
        err = str(e)[:300]
        log.warning("analyze %s failed: %s", path, e)

    if thumb_img is None:
        im = _folder_image(path, any_image=kind in ("cad", "archive", "other"))
        if im is not None:
            thumb_img, thumb_kind = im, 4

    keep_custom = f["thumb"] == 3 and not force_thumb and os.path.exists(thumb_path(fid))
    if thumb_img is not None and not keep_custom:
        try:
            save_thumb(fid, thumb_img)
        except Exception as e:
            thumb_kind = 0
            err = err or f"thumb: {e}"
    elif not keep_custom:
        thumb_kind = 0
        if os.path.exists(thumb_path(fid)):
            os.remove(thumb_path(fid))

    # pre-fill designer/license from 3MF metadata when the user hasn't set them
    upd_designer = f["designer"] or meta.get("3mf_designer", "")
    upd_license = f["license"] or meta.get("3mf_license", "")
    db.ex("""UPDATE files SET analyzed=?, kind=?, meta=?, thumb=?, error=?,
             dim_x=?, dim_y=?, dim_z=?, triangles=?, volume_cm3=?, area_cm2=?, designer=?, license=?
             WHERE id=?""",
          (ANALYZER_VERSION, kind, json.dumps(meta), 3 if keep_custom else thumb_kind, err,
           stats.get("dim_x"), stats.get("dim_y"), stats.get("dim_z"), stats.get("triangles"),
           stats.get("volume_cm3"), stats.get("area_cm2"), upd_designer, upd_license, fid))


def analyze_pending():
    rows = db.q("SELECT id, name FROM files WHERE missing=0 AND analyzed<? ORDER BY id DESC", (ANALYZER_VERSION,))
    set_status(state="analyzing", phase="Generating previews & metadata", done=0, total=len(rows))
    for i, r in enumerate(rows):
        set_status(done=i, current=r["name"])
        analyze(r["id"])
    set_status(phase="Rendering model previews", done=0, total=0, current="")
    prewarm_bundle_thumbs()
    set_status(state="idle", phase="", done=0, total=0, current="")


# --------------------------------------------------------------------------- worker
def _worker():
    while True:
        job = _jobs.get()
        try:
            kind = job[0]
            if kind == "scan":
                _queued_scan.clear()
                scan()
            elif kind == "analyze":
                set_status(state="analyzing", phase="Generating previews & metadata", current="")
                for fid in job[1]:
                    analyze(fid, force_thumb=job[2] if len(job) > 2 else False)
                prewarm_bundle_thumbs()
                set_status(state="idle", phase="", current="")
            elif kind == "rethumb_all":
                for k in ("bundle_skip", "view_skip", "viewb_skip"):  # give big models another try (e.g. after raising MEM_LIMIT)
                    db.set_setting(k, "")
                db.ex("UPDATE files SET analyzed=0 WHERE missing=0 AND thumb IN (0,1)")
                analyze_pending()
        except Exception:
            log.exception("worker job failed: %s", job)
            set_status(state="idle", phase="")
        finally:
            _jobs.task_done()


def _scheduler():
    while True:
        try:
            minutes = float(db.setting("scan_interval", "30") or 0)
        except ValueError:
            minutes = 30
        if minutes <= 0:
            time.sleep(60)
            continue
        time.sleep(max(60.0, minutes * 60))
        request_scan()


def request_scan():
    if not _queued_scan.is_set():
        _queued_scan.set()
        _jobs.put(("scan",))


def request_analyze(ids, force_thumb=False):
    _jobs.put(("analyze", list(ids), force_thumb))


def request_rethumb_all():
    _jobs.put(("rethumb_all",))


def start_background():
    _recover_from_crash()
    if db.setting("f3d_thumbs") != "1":  # 1.25.8: Fusion 360 preview picture
        db.ex("UPDATE files SET analyzed=0 WHERE missing=0 AND ext IN ('f3d','f3z') AND thumb IN (0,1,4)")
        db.set_setting("f3d_thumbs", "1")
    if db.setting("cad_pics") != "1":  # 1.26.9: embedded pictures of SketchUp / eDrawings / SolidWorks / DWG / FreeCAD
        db.ex("UPDATE files SET analyzed=0 WHERE missing=0 AND ext IN ('skp','easm','eprt','edrw','sldprt','sldasm',"
              "'dwg','fcstd') AND thumb IN (0,1,4)")
        db.set_setting("cad_pics", "1")
    if db.setting("blend_thumbs") != "3":  # 1.25.11 Blender preview, 1.25.13 cropped to the model (also kind 2)
        db.ex("UPDATE files SET analyzed=0 WHERE missing=0 AND ext='blend' AND thumb IN (0,1,2,4)")
        db.set_setting("blend_thumbs", "3")
    if db.setting("gcode_thumbs") != "1":  # 1.25.7: toolpath pictures for G-code without an embedded one, QOI, .bgcode
        db.ex("UPDATE files SET analyzed=0 WHERE missing=0 AND kind='gcode' AND thumb IN (0,1)")
        db.set_setting("gcode_thumbs", "1")
    if db.setting("oom_recheck") != "2":  # 1.25.5 restart != OOM, 1.25.6 lean 3MF reader: retry those files once
        db.ex("UPDATE files SET analyzed=0, error=NULL WHERE error LIKE 'preview skipped: the server ran out of memory%'")
        for k in ("bundle_skip", "view_skip", "viewb_skip"):
            db.set_setting(k, "")
        db.set_setting("oom_recheck", "2")
    if db.setting("render_ver") != RENDER_VERSION:  # renderer improved: redo rendered previews (not slicer images)
        db.ex("UPDATE files SET analyzed=0 WHERE missing=0 AND thumb IN (0,1)")
        db.set_setting("render_ver", RENDER_VERSION)
    if STEP_OK and db.setting("step_ready") != "2":  # (re)convert STEP files - v2: metres -> millimetres fix
        db.ex("UPDATE files SET analyzed=0 WHERE ext IN ('step','stp')")
        shutil.rmtree(STEP_DIR, ignore_errors=True)
        db.set_setting("step_ready", "2")
    if db.setting("mc_thumbs") != "1":  # 1.21: multi-colour 3MF previews are rendered in their own colours
        db.ex("UPDATE files SET analyzed=0 WHERE missing=0 AND ext='3mf' AND thumb IN (0,1)")
        db.set_setting("mc_thumbs", "1")
    if OPENSCAD and db.setting("scad_ready") != "2":  # 2 = after the $HOME fix
        db.ex("UPDATE files SET analyzed=0 WHERE ext='scad'")
        db.set_setting("scad_ready", "2")
    threading.Thread(target=_worker, daemon=True, name="worker").start()
    threading.Thread(target=_scheduler, daemon=True, name="scheduler").start()
    request_scan()


# --------------------------------------------------------------------------- model folders (bundles)
IN_BUNDLE_SQL = "(f.folder = b.path OR substr(f.folder, 1, length(b.path) + 1) = b.path || '/')"
MAX_BUNDLE_PARTS = 40


def bundle_for(root, folder):
    return db.q1("""SELECT * FROM bundles WHERE root=? AND (? = path OR substr(?, 1, length(path) + 1) = path || '/')
                    ORDER BY length(path) LIMIT 1""", (root, folder, folder))


def create_bundle(root, path, name=None):
    """Mark a folder as one model. No nesting: an existing parent bundle wins, child bundles are merged in."""
    path = (path or "").strip("/")
    if not path or root not in LIBRARY_DIRS:
        return None
    parent = bundle_for(root, path)
    if parent:
        return parent["id"]
    db.ex("DELETE FROM bundles WHERE root=? AND substr(path, 1, length(?) + 1) = ? || '/'", (root, path, path))
    db.ex("INSERT OR IGNORE INTO bundles(root, path, name) VALUES (?,?,?)", (root, path, name or path.split("/")[-1]))
    return db.q1("SELECT id FROM bundles WHERE root=? AND path=?", (root, path))["id"]


def bundle_parts(bid):
    b = db.q1("SELECT * FROM bundles WHERE id=?", (bid,))
    if not b:
        return None, []
    rows = db.q(f"""SELECT f.* FROM files f JOIN bundles b ON b.id=? AND b.root=f.root AND {IN_BUNDLE_SQL}
                    WHERE f.missing=0 ORDER BY f.folder, LOWER(f.name)""", (bid,))
    return b, rows


def bundle_signature(rows):
    h = hashlib.sha1()
    for r in rows:
        if can_preview_mesh(r):
            h.update(f"{r['id']}:{r['mtime']}:{r['size']}:{r['dim_x']}:{r['dim_z']};".encode())
    h.update(db.setting("render_color", "").encode() + RENDER_VERSION.encode())
    return h.hexdigest()[:12]


def bundle_mesh(rows, max_total=3_000_000):
    """All parts laid out on one plate. Every part is thinned out right after loading, so memory stays bounded
    however many big parts a model folder has (the triangle count of each file is known from the analysis)."""
    cand = [r for r in rows if can_preview_mesh(r)][:MAX_BUNDLE_PARTS]
    known = sum((r["triangles"] or 0) for r in cand) or 1
    parts = []
    for r in cand:
        try:
            p = load_preview_mesh(r)
        except Exception as e:
            log.info("bundle part %s skipped: %s", r["path"], e)
            continue
        share = max_total * ((r["triangles"] or len(p)) / known) if r["triangles"] else max_total / len(cand)
        keep = max(2000, int(share))
        if len(p) > keep:
            p = np.ascontiguousarray(p[np.linspace(0, len(p) - 1, keep).astype(np.int64)])
        parts.append(p)
    if not parts:
        raise meshes.MeshError("no 3D parts in this model")
    total = sum(len(p) for p in parts)
    if total > max_total:
        k = max_total / total
        parts = [p[np.linspace(0, len(p) - 1, max(1, int(len(p) * k))).astype(np.int64)] for p in parts]
    return meshes.arrange(parts)


_bundle_locks = {}
_bundle_locks_guard = threading.Lock()


def ensure_bundle_thumb(bid):
    """Composite 'all parts on the plate' preview, cached by content signature. Returns path or None."""
    with _bundle_locks_guard:
        lock = _bundle_locks.setdefault(bid, threading.Lock())
    with lock:
        return _ensure_bundle_thumb(bid)


def _ensure_bundle_thumb(bid):
    b, rows = bundle_parts(bid)
    if not b or not rows:
        return None
    sig = bundle_signature(rows)
    path = os.path.join(THUMB_DIR, f"b{bid}_{sig}.webp")
    if os.path.exists(path):
        return path
    for old in os.listdir(THUMB_DIR):
        if old.startswith(f"b{bid}_") and not old.endswith(".tmp"):
            try:
                os.remove(os.path.join(THUMB_DIR, old))
            except OSError:
                pass
    img = None
    skip = str(bid) in (db.setting("bundle_skip") or "").split(",")
    try:
        if skip:
            raise meshes.MeshError("composite preview disabled for this model (ran out of memory before)")
        _busy(f"bundle:{bid}")
        try:
            img = meshes.render_thumbnail(bundle_mesh(rows, max_total=600_000), color=db.setting("render_color", "#f29d38"))
        finally:
            _idle(f"bundle:{bid}")
            release_memory()
    except Exception:
        withthumb = [r for r in rows if r["thumb"] and os.path.exists(thumb_path(r["id"]))]
        if withthumb:
            img = Image.open(thumb_path(withthumb[0]["id"]))
            img.load()
    if img is None:
        return None
    _atomic_webp(img, path)
    return path


def prewarm_bundle_thumbs():
    for b in db.q("SELECT id FROM bundles"):
        try:
            ensure_bundle_thumb(b["id"])
        except Exception:
            log.exception("bundle thumbnail %s failed", b["id"])


# --------------------------------------------------------------------------- file ops
def unique_path(p):
    if not os.path.exists(p):
        return p
    base, dot, ext = os.path.basename(p).partition(".")
    d = os.path.dirname(p)
    i = 1
    while True:
        cand = os.path.join(d, f"{base} ({i}){dot}{ext}")
        if not os.path.exists(cand):
            return cand
        i += 1


SAFE_NAME = re.compile(r"[\x00-\x1f/\\:*?\"<>|]")


def clean_name(n):
    n = SAFE_NAME.sub("_", n).strip().strip(".")
    return n[:200] or "file"


def extract_zip(zpath, dest_dir):
    """Extract supported files + images from a zip into dest_dir. Returns list of extracted paths."""
    out = []
    os.makedirs(dest_dir, exist_ok=True)
    real_dest = os.path.realpath(dest_dir)
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            parts = [clean_name(p) for p in info.filename.replace("\\", "/").split("/") if p not in ("", ".", "..")]
            if not parts or parts[0] == "__MACOSX" or parts[-1].startswith("."):
                continue
            e = ext_of(parts[-1])
            if e not in KINDS and e not in IMAGE_EXTS and e not in ("txt", "md", "pdf"):
                continue
            target = os.path.realpath(os.path.join(dest_dir, *parts))
            if not target.startswith(real_dest + os.sep):
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            target = unique_path(target)
            with z.open(info) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
            if e in KINDS:
                out.append(target)
    return out


def trash_file(f):
    """Move a file into the data trash, remove its row."""
    if os.path.exists(f["path"]):
        dest = os.path.join(TRASH_DIR, time.strftime("%Y%m%d-%H%M%S_") + os.path.basename(f["path"]))
        shutil.move(f["path"], unique_path(dest))
    if os.path.exists(thumb_path(f["id"])):
        os.remove(thumb_path(f["id"]))
    db.ex("DELETE FROM files WHERE id=?", (f["id"],))


def move_file(f, new_folder=None, new_name=None):
    root = f["root"]
    folder = f["folder"] if new_folder is None else new_folder
    name = f["name"] if not new_name else clean_name(new_name)
    if ext_of(name) != f["ext"]:
        name = f"{name}.{f['ext']}"
    dest_dir = safe_join(root, folder)
    os.makedirs(dest_dir, exist_ok=True)
    dest = safe_join(dest_dir, name)
    if os.path.normpath(dest) == os.path.normpath(f["path"]):
        return
    dest = unique_path(dest)
    shutil.move(f["path"], dest)
    rel = os.path.relpath(os.path.dirname(dest), root)
    db.ex("UPDATE files SET path=?, folder=?, name=?, mtime=? WHERE id=?",
          (dest, "" if rel == "." else rel, os.path.basename(dest), os.stat(dest).st_mtime, f["id"]))
