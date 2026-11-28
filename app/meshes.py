"""Mesh loading (STL / OBJ / 3MF), stats and software thumbnail rendering."""
import io
import os
import re
import struct
import zipfile
from array import array
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw

NS_CORE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
NS_PROD = "http://schemas.microsoft.com/3dmanufacturing/production/2015/06"
NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

MESH_EXTS = {"stl", "obj", "3mf"}


class MeshError(Exception):
    pass


# --------------------------------------------------------------------------- STL
def load_stl(path):
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        head = f.read(84)
        if len(head) < 84:
            raise MeshError("file too small")
        n = struct.unpack("<I", head[80:84])[0]
        if 84 + n * 50 == size:
            dt = np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
            data = np.fromfile(f, dtype=dt, count=n)
            return np.ascontiguousarray(data["v"], dtype=np.float32)
    # ASCII STL
    with open(path, "rb") as f:
        txt = f.read().decode("latin-1")
    nums = re.findall(r"vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)", txt)
    if not nums:
        raise MeshError("no vertices found")
    arr = np.array(nums, dtype=np.float32)
    arr = arr[: (len(arr) // 3) * 3]
    return arr.reshape(-1, 3, 3)


# --------------------------------------------------------------------------- OBJ
def load_obj(path):
    verts, faces = [], []
    with open(path, "r", errors="ignore") as f:
        for line in f:
            if line.startswith("v "):
                p = line.split()
                verts.append((float(p[1]), float(p[2]), float(p[3])))
            elif line.startswith("f "):
                idx = []
                for tok in line.split()[1:]:
                    i = int(tok.split("/")[0])
                    idx.append(i - 1 if i > 0 else len(verts) + i)
                for k in range(1, len(idx) - 1):
                    faces.append((idx[0], idx[k], idx[k + 1]))
    if not verts or not faces:
        raise MeshError("empty OBJ")
    v = np.array(verts, dtype=np.float32)
    fa = np.array(faces, dtype=np.int64)
    fa = fa[(fa >= 0).all(1) & (fa < len(v)).all(1)]
    tris = v[fa]
    # OBJ is usually Y-up; convert to Z-up so it sits on the bed like slicers do
    return tris[:, :, [0, 2, 1]] * np.array([1, -1, 1], dtype=np.float32)


# --------------------------------------------------------------------------- 3MF
def _parse_transform(s):
    if not s:
        return None
    vals = [float(x) for x in s.split()]
    if len(vals) != 12:
        return None
    m = np.eye(4, dtype=np.float64)
    m[:3, :3] = np.array(vals[:9]).reshape(3, 3)
    m[3, :3] = vals[9:12]
    return m  # row-vector convention: p' = [p 1] @ m


def _apply(tris, m):
    if m is None:
        return tris
    flat = tris.reshape(-1, 3).astype(np.float64)
    out = flat @ m[:3, :3] + m[3, :3]
    return out.astype(np.float32).reshape(-1, 3, 3)


NS_MAT = "http://schemas.microsoft.com/3dmanufacturing/material/2015/02"
NS_SLIC3R = "http://schemas.slic3r.org/3mf/2017/06"
DEFAULT_FILAMENTS = ["#f29d38", "#5aa7ff", "#3ec6a8", "#ff6b6b", "#f5c84c", "#a98bff", "#e7eaf0", "#808a9d"]


def _paint_state(code, cache):
    """Bambu/Orca `paint_color` and PrusaSlicer `mmu_segmentation` hold a hex-encoded subdivision tree (read from
    the end, one nibble per node: low 2 bits = split sides, high 2 bits = state, 3 -> next nibble + 3).
    We colour the whole triangle with the state most of its leaves have - plenty for a preview."""
    v = cache.get(code)
    if v is not None:
        return v
    counts = {}
    try:
        nib = [int(ch, 16) for ch in reversed(code)]
    except ValueError:
        nib = []
    j = 0
    while j < len(nib):
        c = nib[j]
        j += 1
        if c & 3:
            continue  # split node; its children follow
        st = c >> 2
        if st == 3 and j < len(nib):
            st = nib[j] + 3
            j += 1
        counts[st] = counts.get(st, 0) + 1
    v = max(counts, key=counts.get) if counts else 0
    cache[code] = v
    return v


def _clean_filament_name(n):
    n = (n or "").strip().strip('"')
    n = re.sub(r"\s*@.*$", "", n)  # "Bambu PLA Matte @BBL X1C" -> "Bambu PLA Matte"
    return n[:60]


def _filament_colours(z, names):
    """(colours, names) of the filaments a slicer project uses (Bambu/Orca JSON or PrusaSlicer ini)."""
    import json as _json
    for n in ("Metadata/project_settings.config", "Metadata/Slic3r_PE.config", "Metadata/PrusaSlicer.config"):
        if n not in names:
            continue
        raw = z.read(n).decode("utf-8", "replace")
        cols, fnames, ftypes = None, None, None
        if raw.lstrip().startswith("{"):
            try:
                d = _json.loads(raw)
                cols = d.get("filament_colour") or d.get("extruder_colour")
                fnames = d.get("filament_settings_id")
                ftypes = d.get("filament_type")
            except ValueError:
                pass
        else:
            def ini(key):
                m = re.search(rf"^;?\s*{key}\s*=\s*(.+)$", raw, re.M)
                return m.group(1).strip().split(";") if m else None
            cols = ini("filament_colou?r")
            fnames = ini("filament_settings_id")
            ftypes = ini("filament_type")
        if isinstance(cols, str):
            cols = cols.split(";")
        cols = [c.strip()[:7] for c in (cols or []) if re.match(r"^#[0-9a-fA-F]{6}", c.strip())]
        if cols:
            fnames = [_clean_filament_name(x) for x in (fnames or [])] if isinstance(fnames, list) else []
            ftypes = [str(x).strip().strip('"') for x in (ftypes or [])] if isinstance(ftypes, list) else []
            labels = [(fnames[i] if i < len(fnames) and fnames[i] else (ftypes[i] if i < len(ftypes) else ""))
                      for i in range(len(cols))]
            return cols, labels
    return [], []


def _object_extruders(z, names):
    """Bambu/Orca/Prusa per-object and per-part extruder: {obj_id: n, (obj_id, part_id): n}."""
    out = {}
    for n in ("Metadata/model_settings.config", "Metadata/Slic3r_PE_model.config"):
        if n not in names:
            continue
        try:
            root = ET.fromstring(z.read(n))
        except ET.ParseError:
            continue
        for obj in root.iter("object"):
            oid = obj.get("id")
            for md in obj.findall("metadata"):
                if (md.get("key") or md.get("type")) == "extruder" and (md.get("value") or "").isdigit():
                    out[oid] = int(md.get("value"))
            for part in obj.findall("part") + obj.findall("volume"):
                pid = part.get("id") or part.get("firstid")
                for md in part.findall("metadata"):
                    if md.get("key") == "extruder" and (md.get("value") or "").isdigit():
                        out[(oid, pid)] = int(md.get("value"))
    return out


def load_3mf(path, with_colors=False):
    """Triangles of all build items. with_colors=True also returns (per-triangle palette index, palette) - from
    painted triangles, per-part filament assignment or 3MF material colours - or (None, None) for one colour."""
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        root_model = "3D/3dmodel.model"
        if "_rels/.rels" in names:
            try:
                rels = ET.fromstring(z.read("_rels/.rels"))
                for r in rels.iter(f"{{{NS_REL}}}Relationship"):
                    if r.get("Type", "").endswith("/3dmodel"):
                        root_model = r.get("Target", root_model).lstrip("/")
            except ET.ParseError:
                pass
        if root_model not in names:
            cands = [n for n in names if n.lower().endswith(".model")]
            if not cands:
                raise MeshError("no 3D model in 3MF")
            root_model = cands[0]

        parsed = {}  # file -> root element
        objects = {}  # (file, id) -> ("mesh", tris, paint, matcol) | ("comp", [(file, id, m)])
        groups = {}  # (file, resource id) -> [colour, ...]   (basematerials / colorgroup)
        paint_cache = {}
        a_paint = "paint_color"
        a_mmu = f"{{{NS_SLIC3R}}}mmu_segmentation"

        def parse_file(fname):
            """Stream one .model file (iterparse): big 3MFs hold hundreds of MB of XML - building the whole tree
            took gigabytes and got the server OOM-killed. Returns {"build": [(objectid, path, transform)]}."""
            if fname in parsed:
                return parsed[fname]
            if fname not in names:
                parsed[fname] = None
                return None
            info = {"build": []}
            parsed[fname] = info
            T_OBJ, T_MESH = f"{{{NS_CORE}}}object", f"{{{NS_CORE}}}mesh"
            T_VS, T_TS = f"{{{NS_CORE}}}vertices", f"{{{NS_CORE}}}triangles"
            T_V, T_T = f"{{{NS_CORE}}}vertex", f"{{{NS_CORE}}}triangle"
            T_COMP, T_ITEM = f"{{{NS_CORE}}}component", f"{{{NS_CORE}}}item"
            T_BM, T_CG = f"{{{NS_CORE}}}basematerials", f"{{{NS_MAT}}}colorgroup"
            A_PATH = f"{{{NS_PROD}}}path"
            cur = None  # object being read
            box = None  # <vertices>/<triangles> element whose children we drop as we go
            stack = []
            try:
                with z.open(fname) as fh:
                    for ev, e in ET.iterparse(fh, events=("start", "end")):
                        tag = e.tag
                        if ev == "start":
                            stack.append(e)
                            if tag == T_OBJ:
                                cur = {"id": e.get("id"), "pid": e.get("pid"), "pindex": e.get("pindex"),
                                       "mesh": False, "v": array("f"), "t": array("i"), "paint": None,
                                       "cols": None, "comps": []}
                            elif tag == T_MESH and cur is not None:
                                cur["mesh"] = True
                            elif tag in (T_VS, T_TS):
                                box = e
                            continue
                        stack.pop()
                        parent = stack[-1] if stack else None
                        if tag == T_V and cur is not None:
                            cur["v"].extend((float(e.get("x")), float(e.get("y")), float(e.get("z"))))
                        elif tag == T_T and cur is not None:
                            n = len(cur["t"]) // 3
                            cur["t"].extend((int(e.get("v1")), int(e.get("v2")), int(e.get("v3"))))
                            if with_colors:
                                c = e.get(a_paint) or e.get(a_mmu)
                                if c:
                                    if cur["paint"] is None:
                                        cur["paint"] = array("h", bytes(2 * n))
                                    cur["paint"].append(_paint_state(c, paint_cache))
                                elif cur["paint"] is not None:
                                    cur["paint"].append(0)
                                tp, k = e.get("pid"), e.get("p1")
                                if tp or k or cur["pid"]:
                                    g = groups.get((fname, tp or cur["pid"]))
                                    k = k or cur["pindex"]
                                    col = g[int(k)] if g and k is not None and k.isdigit() and int(k) < len(g) else None
                                    if col is not None and cur["cols"] is None:
                                        cur["cols"] = [None] * n
                                    if cur["cols"] is not None:
                                        cur["cols"].append(col)
                                elif cur["cols"] is not None:
                                    cur["cols"].append(None)
                        elif tag == T_COMP and cur is not None:
                            pth = e.get(A_PATH)
                            cur["comps"].append(((pth.lstrip("/") if pth else fname), e.get("objectid"),
                                                 _parse_transform(e.get("transform"))))
                        elif tag == T_ITEM:
                            info["build"].append((e.get("objectid"), e.get(A_PATH), e.get("transform")))
                        elif tag == T_BM and with_colors:
                            groups[(fname, e.get("id"))] = [((b.get("displaycolor") or "#888888")[:7],
                                                             (b.get("name") or "")[:60]) for b in e]
                        elif tag == T_CG and with_colors:
                            groups[(fname, e.get("id"))] = [((c.get("color") or "#888888")[:7], "") for c in e]
                        elif tag == T_OBJ and cur is not None:
                            _store_object(fname, cur)
                            cur = None
                        elif tag in (T_VS, T_TS):
                            box = None
                        if box is not None and parent is box:
                            box.clear()  # drop the handled vertex/triangle - keeps memory flat
                        elif parent is None or parent.tag not in (T_BM, T_CG):  # materials: read at their end
                            e.clear()
            except ET.ParseError as ex:
                raise MeshError(f"broken 3MF XML ({ex})")
            return info

        def _store_object(fname, cur):
            if cur["mesh"]:
                v = np.frombuffer(cur["v"], dtype=np.float32).reshape(-1, 3)
                t = np.frombuffer(cur["t"], dtype=np.int32).reshape(-1, 3)
                if not len(v) or not len(t):
                    return
                paint = np.frombuffer(cur["paint"], dtype=np.int16) if cur["paint"] is not None else None
                matcol = cur["cols"] if cur["cols"] is not None and any(cur["cols"]) else None
                ok = ((t >= 0) & (t < len(v))).all(1)
                if not ok.all():
                    t = t[ok]
                    if paint is not None:
                        paint = paint[ok]
                    if matcol is not None:
                        matcol = [c for c, k in zip(matcol, ok) if k]
                objects[(fname, cur["id"])] = ("mesh", v[t], paint, matcol)
            else:
                objects[(fname, cur["id"])] = ("comp", cur["comps"])

        ext_map = _object_extruders(z, names) if with_colors else {}

        def resolve(fname, oid, depth=0, top=None, ext=1):
            """-> [(tris, paint, matcol, extruder)]"""
            if depth > 10:
                return []
            parse_file(fname)
            o = objects.get((fname, oid))
            if o is None:
                return []
            if top is None:
                top = oid
                ext = ext_map.get(oid, ext)
            if o[0] == "mesh":
                return [(o[1], o[2], o[3], ext)]
            out = []
            for cf, cid, m in o[1]:
                e2 = ext_map.get((top, cid), ext) if depth == 0 else ext
                for t, pt, mc, ex in resolve(cf, cid, depth + 1, top, e2):
                    out.append((_apply(t, m), pt, mc, ex))
            return out

        root = parse_file(root_model)
        if root is None:
            raise MeshError("cannot read 3MF root model")
        parts = []
        for oid, p, tr in root["build"]:
            f = p.lstrip("/") if p else root_model
            for t, pt, mc, ex in resolve(f, oid):
                parts.append((_apply(t, _parse_transform(tr)), pt, mc, ex))
        if not parts:  # fall back to every mesh we found
            for k, o in objects.items():
                if o[0] == "mesh":
                    parts.append((o[1], o[2], o[3], ext_map.get(k[1], 1)))
        if not parts:
            raise MeshError("3MF contains no mesh")
        tris = np.concatenate([p[0] for p in parts]).astype(np.float32)
        if not with_colors:
            return tris
        has_info = any(p[1] is not None or p[2] is not None for p in parts) or len({p[3] for p in parts}) > 1
        if not has_info:
            return tris, None, None
        fil, labels = _filament_colours(z, names)

        def fcol(n):
            n = max(1, int(n))
            if n <= len(fil):
                lab = labels[n - 1] if n - 1 < len(labels) else ""
                return fil[n - 1].lower(), (f"{n} · {lab}" if lab else f"Filament {n}")
            return DEFAULT_FILAMENTS[(n - 1) % len(DEFAULT_FILAMENTS)], f"Filament {n}"
        palette, pidx = [], {}

        def pal(c):
            col, name = c[0].lower(), c[1]
            if col not in pidx:
                if len(palette) >= 255:
                    return 0
                pidx[col] = len(palette)
                palette.append((col, name))
            elif name and not palette[pidx[col]][1]:
                palette[pidx[col]] = (col, name)
            return pidx[col]
        idx_parts = []
        for t, pt, mc, ex in parts:
            n = len(t)
            base = pal(fcol(ex))
            if pt is None and mc is None:
                idx_parts.append(np.full(n, base, dtype=np.uint8))
                continue
            arr = np.full(n, base, dtype=np.uint8)
            if mc is not None:
                for i, c in enumerate(mc):
                    if c:
                        arr[i] = pal(c)
            if pt is not None:
                for st in np.unique(pt):
                    if st > 0:
                        arr[pt == st] = pal(fcol(st))
            idx_parts.append(arr)
        idx = np.concatenate(idx_parts)
        used = np.unique(idx)  # drop colours nothing ended up with (e.g. a default filament fully painted over)
        if len(used) < 2:
            return tris, None, None
        remap = np.zeros(256, dtype=np.uint8)
        remap[used] = np.arange(len(used), dtype=np.uint8)
        return tris, remap[idx], [palette[k] for k in used]


def load_mesh_colored(path, ext):
    """(tris, per-triangle palette index or None, palette or None)"""
    if ext.lower() != "3mf":
        return load_mesh(path, ext), None, None
    tris, idx, palette = load_3mf(path, with_colors=True)
    ok = np.isfinite(tris).all(axis=(1, 2))
    tris = tris[ok]
    if idx is not None:
        idx = idx[ok]
    if len(tris) == 0:
        raise MeshError("empty mesh")
    return tris, idx, palette


def palette_rgb(idx, palette):
    """(N, 3) uint8 colour per triangle from palette indices."""
    lut = np.array([[int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)] for c, _n in palette], dtype=np.uint8)
    return lut[idx]


def colored_mesh_to_bytes(tris, idx, palette, max_tris=3_000_000):
    """'LDMC' header (ntris, npal), palette as RGBA bytes, float32 positions, uint8 colour index per triangle."""
    if len(tris) > max_tris:
        keep = np.linspace(0, len(tris) - 1, max_tris).astype(np.int64)
        tris = tris[keep]
        idx = idx[keep] if idx is not None else None
    palette = palette or []
    import json as _json
    pal = bytearray()
    for c, _n in palette:
        c = c.lstrip("#")
        pal += bytes([int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255])
    names = _json.dumps([n for _c, n in palette]).encode()
    names += b" " * (-len(names) % 4)  # keep the float data 4-byte aligned
    head = b"LDMC" + struct.pack("<III", len(tris), len(palette), len(names))
    body = mesh_to_bytes(tris, max_tris=len(tris) + 1)
    colors = (idx if idx is not None else np.zeros(len(tris), np.uint8)).astype(np.uint8).tobytes()
    return head + bytes(pal) + names + body + colors


def load_mesh(path, ext):
    ext = ext.lower()
    if ext == "stl":
        tris = load_stl(path)
    elif ext == "obj":
        tris = load_obj(path)
    elif ext == "3mf":
        tris = load_3mf(path)
    else:
        raise MeshError(f"unsupported mesh type {ext}")
    tris = tris[np.isfinite(tris).all(axis=(1, 2))]
    if len(tris) == 0:
        raise MeshError("empty mesh")
    return tris


# --------------------------------------------------------------------------- stats
def mesh_stats(tris):
    pts = tris.reshape(-1, 3)
    mn, mx = pts.min(0), pts.max(0)
    a, b, c = tris[:, 0].astype(np.float64), tris[:, 1].astype(np.float64), tris[:, 2].astype(np.float64)
    vol = abs(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0) / 1000.0  # cm3
    area = (np.linalg.norm(np.cross(b - a, c - a), axis=1).sum() / 2.0) / 100.0  # cm2
    d = mx - mn
    return {
        "dim_x": round(float(d[0]), 2), "dim_y": round(float(d[1]), 2), "dim_z": round(float(d[2]), 2),
        "triangles": int(len(tris)), "volume_cm3": round(float(vol), 3), "area_cm2": round(float(area), 2),
    }


def mesh_to_bytes(tris, max_tris=3_000_000):
    """Centered on XY, sitting on Z=0, float32 flat buffer for the web viewer."""
    if len(tris) > max_tris:
        idx = np.linspace(0, len(tris) - 1, max_tris).astype(np.int64)
        tris = tris[idx]
    pts = tris.reshape(-1, 3)
    mn, mx = pts.min(0), pts.max(0)
    off = np.array([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]], dtype=np.float32)
    return (tris - off).astype("<f4").tobytes()


def arrange(parts, gap=8.0):
    """Lay several meshes out side by side on the bed (shelf packing). Returns one (N,3,3) array."""
    items = []
    for t in parts:
        pts = t.reshape(-1, 3)
        mn, mx = pts.min(0), pts.max(0)
        off = np.array([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]], dtype=np.float32)
        items.append((t - off, float(mx[0] - mn[0]), float(mx[1] - mn[1])))
    if not items:
        raise MeshError("no parts")
    area = sum(w * d for _, w, d in items)
    row_w = max(max(w for _, w, _ in items), (area ** 0.5) * 1.35)
    items.sort(key=lambda x: -x[2])
    out, x, y, row_d = [], 0.0, 0.0, 0.0
    for t, w, d in items:
        if x > 0 and x + w > row_w:
            x, y, row_d = 0.0, y + row_d + gap, 0.0
        out.append(t + np.array([x + w / 2, y + d / 2, 0], dtype=np.float32))
        x += w + gap
        row_d = max(row_d, d)
    allt = np.concatenate(out)
    pts = allt.reshape(-1, 3)
    mn, mx = pts.min(0), pts.max(0)
    return allt - np.array([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, 0], dtype=np.float32)


# --------------------------------------------------------------------------- render
def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def _subdivide(P, cols, max_edge, cap):
    """Split triangles at the midpoint of their longest edge until all screen-space edges <= max_edge."""
    for _ in range(40):
        d0 = np.hypot(*(P[:, 1, :2] - P[:, 0, :2]).T)
        d1 = np.hypot(*(P[:, 2, :2] - P[:, 1, :2]).T)
        d2 = np.hypot(*(P[:, 0, :2] - P[:, 2, :2]).T)
        L = np.stack([d0, d1, d2], 1)
        big = L.max(1) > max_edge
        nb = int(big.sum())
        if not nb or len(P) + nb > cap:
            break
        B, k = P[big], L[big].argmax(1)
        i = np.arange(nb)
        va, vb, vc = B[i, k], B[i, (k + 1) % 3], B[i, (k + 2) % 3]
        m = (va + vb) / 2
        P = np.concatenate([P[~big], np.stack([va, m, vc], 1), np.stack([m, vb, vc], 1)])
        cb = cols[big]
        cols = np.concatenate([cols[~big], cb, cb])
    return P, cols


def render_thumbnail(tris, size=512, color="#f29d38", ss=2, max_tris=600_000, tri_rgb=None):
    """Painter's-algorithm software renderer: isometric-ish view, two lights, AA by supersampling.
    tri_rgb: optional (N, 3) base colour per triangle (multi-colour models)."""
    if len(tris) > max_tris:
        # keep largest triangles; tiny ones are sub-pixel anyway
        e1 = tris[:, 1] - tris[:, 0]
        e2 = tris[:, 2] - tris[:, 0]
        areas = np.linalg.norm(np.cross(e1, e2), axis=1)
        keep = np.argpartition(-areas, max_tris)[:max_tris]
        tris = tris[keep]
        if tri_rgb is not None:
            tri_rgb = tri_rgb[keep]
    t = tris.astype(np.float64)
    pts = t.reshape(-1, 3)
    center = (pts.min(0) + pts.max(0)) / 2
    t = t - center

    yaw, pitch = np.radians(-40), np.radians(-58)
    rz = np.array([[np.cos(yaw), -np.sin(yaw), 0], [np.sin(yaw), np.cos(yaw), 0], [0, 0, 1]])
    rx = np.array([[1, 0, 0], [0, np.cos(pitch), -np.sin(pitch)], [0, np.sin(pitch), np.cos(pitch)]])
    rot = rx @ rz
    v = t @ rot.T  # x right, y up(screen), z towards viewer

    n = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0])
    ln = np.linalg.norm(n, axis=1)
    ok = ln > 1e-12
    v, n, ln = v[ok], n[ok], ln[ok]
    if tri_rgb is not None:
        tri_rgb = np.asarray(tri_rgb, dtype=np.float64)[ok]
    n = n / ln[:, None]
    # two-sided lighting (many printables have flipped normals)
    flip = n[:, 2] < 0
    n[flip] *= -1

    l1 = np.array([-0.4, 0.6, 0.7]); l1 /= np.linalg.norm(l1)
    l2 = np.array([0.6, -0.3, 0.5]); l2 /= np.linalg.norm(l2)
    diff = 0.62 * np.clip(n @ l1, 0, 1) + 0.25 * np.clip(n @ l2, 0, 1)
    rim = 0.12 * (1 - np.abs(n[:, 2])) ** 2
    shade = np.clip(0.28 + diff + rim, 0, 1.15)

    base = tri_rgb if tri_rgb is not None else _hex(color)[None, :]
    # very dark filaments would come out pure black: lift them a little so the shape stays readable
    base = np.maximum(base, 38)
    cols = np.clip(base * shade[:, None] + 30 * np.clip(shade - 0.95, 0, 1)[:, None] * 4, 0, 255)
    cols = cols.astype(np.uint8)

    S = size * ss
    xy = v[:, :, :2]
    mn = xy.reshape(-1, 2).min(0)
    mx = xy.reshape(-1, 2).max(0)
    span = max(mx[0] - mn[0], mx[1] - mn[1], 1e-6)
    scale = (S * 0.86) / span
    mid = (mn + mx) / 2
    P = np.empty((len(v), 3, 3), dtype=np.float32)  # screen coordinates - float32 is plenty, half the memory
    P[:, :, 0] = (xy[:, :, 0] - mid[0]) * scale + S / 2
    P[:, :, 1] = S / 2 - (xy[:, :, 1] - mid[1]) * scale
    P[:, :, 2] = v[:, :, 2]
    # Painter's algorithm only works when triangles are small on screen: long slivers (OpenSCAD/CAD exports)
    # would be sorted wrongly and back faces would show through. Split them until every edge is short.
    P, cols = _subdivide(P, cols, max_edge=S / 90.0, cap=1_200_000)

    order = np.argsort(P[:, :, 2].mean(1), kind="stable")  # far -> near
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    pts = P[order][:, :, :2].astype(np.float32)
    del P
    cl = cols[order]
    poly = dr.polygon
    # Python lists of a million triangles take gigabytes - convert in chunks
    for s0 in range(0, len(pts), 40_000):
        for tri, c in zip(pts[s0:s0 + 40_000].tolist(), cl[s0:s0 + 40_000].tolist()):
            fill = (c[0], c[1], c[2], 255)
            poly([(tri[0][0], tri[0][1]), (tri[1][0], tri[1][1]), (tri[2][0], tri[2][1])], fill=fill, outline=fill)
    if ss > 1:
        img = img.resize((size, size), Image.LANCZOS)
    return img


def image_to_png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


# --------------------------------------------------------------------------- G-code toolpath preview
def _gcode_segments(path, max_bytes=400 * 1024 * 1024):
    """Extruding moves of a G-code file as an (N, 6) float32 array x0 y0 z0 x1 y1 z1 (streamed, any size)."""
    from array import array
    seg = array("f")
    x = y = z = e = 0.0
    abs_xyz, abs_e = True, True
    read = 0
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            read += len(line)
            if read > max_bytes:
                break
            c0 = line[:1]
            if c0 != "G" and c0 != "M":
                continue
            code = line.split(";", 1)[0].split()
            if not code:
                continue
            cmd = code[0]
            if cmd in ("G1", "G0", "G2", "G3", "G01", "G00"):
                nx, ny, nz, de = x, y, z, None
                for w in code[1:]:
                    k = w[:1]
                    try:
                        val = float(w[1:])
                    except ValueError:
                        continue
                    if k == "X":
                        nx = val if abs_xyz else x + val
                    elif k == "Y":
                        ny = val if abs_xyz else y + val
                    elif k == "Z":
                        nz = val if abs_xyz else z + val
                    elif k == "E":
                        if abs_e:
                            de, e = val - e, val
                        else:
                            de = val
                if de is not None and de > 0 and (nx != x or ny != y):
                    seg.extend((x, y, z, nx, ny, nz))
                x, y, z = nx, ny, nz
            elif cmd == "G90":
                abs_xyz = abs_e = True
            elif cmd == "G91":
                abs_xyz = abs_e = False
            elif cmd == "M82":
                abs_e = True
            elif cmd == "M83":
                abs_e = False
            elif cmd == "G92":
                for w in code[1:]:
                    if w[:1] == "E":
                        try:
                            e = float(w[1:])
                        except ValueError:
                            pass
    s = np.frombuffer(seg, dtype=np.float32).reshape(-1, 6)
    return s.copy()


def render_gcode_thumbnail(path, size=512, color="#f29d38", ss=2, max_segs=900_000):
    """Preview of a sliced file without an embedded picture: the extrusion moves drawn like the model."""
    s = _gcode_segments(path)
    if len(s) < 10:
        raise MeshError("no extrusion moves in G-code")
    if len(s) > max_segs:  # keep every n-th move - still reads as the part
        s = s[:: int(np.ceil(len(s) / max_segs))]
    p0, p1 = s[:, :3].astype(np.float64), s[:, 3:].astype(np.float64)
    allp = np.concatenate([p0, p1])
    # ignore purge lines / priming far away from the part: crop to the 1..99 % range of the points
    lo, hi = np.percentile(allp, 0.5, axis=0), np.percentile(allp, 99.5, axis=0)
    pad = (hi - lo) * 0.08 + 1
    keep = ((p0 >= lo - pad) & (p0 <= hi + pad) & (p1 >= lo - pad) & (p1 <= hi + pad)).all(1)
    p0, p1 = p0[keep], p1[keep]
    if len(p0) < 10:
        raise MeshError("no extrusion moves in G-code")
    center = (np.minimum(p0.min(0), p1.min(0)) + np.maximum(p0.max(0), p1.max(0))) / 2
    yaw, pitch = np.radians(-40), np.radians(-58)
    rz = np.array([[np.cos(yaw), -np.sin(yaw), 0], [np.sin(yaw), np.cos(yaw), 0], [0, 0, 1]])
    rx = np.array([[1, 0, 0], [0, np.cos(pitch), -np.sin(pitch)], [0, np.sin(pitch), np.cos(pitch)]])
    rot = rx @ rz
    a, b = (p0 - center) @ rot.T, (p1 - center) @ rot.T
    S = size * ss
    xy = np.concatenate([a[:, :2], b[:, :2]])
    mn, mx = xy.min(0), xy.max(0)
    span = max(mx[0] - mn[0], mx[1] - mn[1], 1e-6)
    scale = (S * 0.86) / span
    mid = (mn + mx) / 2

    def scr(v):
        return np.stack([(v[:, 0] - mid[0]) * scale + S / 2, S / 2 - (v[:, 1] - mid[1]) * scale], 1)
    A, B = scr(a), scr(b)
    # shading: the side of a perimeter facing the light is brighter; higher layers a touch lighter
    d = p1[:, :2] - p0[:, :2]
    ln = np.linalg.norm(d, axis=1) + 1e-9
    nrm = np.stack([d[:, 1], -d[:, 0]], 1) / ln[:, None]
    light = np.array([-0.55, 0.83])
    zz = (p0[:, 2] - p0[:, 2].min()) / max(np.ptp(p0[:, 2]), 1e-6)
    shade = 0.55 + 0.35 * np.abs(nrm @ light) + 0.2 * zz
    base = np.maximum(_hex(color), 38)
    cols = np.clip(base[None, :] * shade[:, None], 0, 255).astype(np.uint8)
    width = max(1, int(round(0.45 * scale)))
    order = np.argsort((a[:, 2] + b[:, 2]) / 2, kind="stable")  # far -> near
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    line = dr.line
    for s0 in range(0, len(order), 50_000):
        o = order[s0:s0 + 50_000]
        for (x0, y0), (x1, y1), c in zip(A[o].tolist(), B[o].tolist(), cols[o].tolist()):
            line((x0, y0, x1, y1), fill=(c[0], c[1], c[2], 255), width=width)
    if ss > 1:
        img = img.resize((size, size), Image.LANCZOS)
    return img
