"""Metadata extraction from G-code and 3MF files (PrusaSlicer, OrcaSlicer, BambuStudio, Cura, Creality Print...)."""
import base64
import io
import json
import re
import struct
import numpy as np
import zlib
import zipfile
import xml.etree.ElementTree as ET

from PIL import Image, ImageFilter

GCODE_EXTS = {"gcode", "gco", "g", "bgcode"}
HEAD_BYTES = 512 * 1024
TAIL_BYTES = 768 * 1024


def parse_duration(s):
    """'1d 2h 3m 4s' / '02:03:04' / '3600' -> seconds."""
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return int(float(s))
    m = re.fullmatch(r"(\d+):(\d+):(\d+)", s)
    if m:
        return int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3])
    total, found = 0, False
    for num, unit in re.findall(r"(\d+(?:\.\d+)?)\s*([dhms])", s):
        found = True
        total += float(num) * {"d": 86400, "h": 3600, "m": 60, "s": 1}[unit]
    return int(total) if found else None


def _num(s):
    if s is None:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", str(s))
    return float(m.group()) if m else None


def _first(s):
    """'PLA;PLA' / '0.4,0.4' -> first entry."""
    if s is None:
        return None
    return re.split(r"[;,]", str(s).strip().strip('"'))[0].strip() or None


# --------------------------------------------------------------------------- thumbnails
def _decode_thumb(fmt, b64):
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return None
    if fmt == "qoi":
        return decode_qoi(raw)
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
        return im
    except Exception:
        return None


def decode_qoi(raw):
    """Tiny QOI decoder (OrcaSlicer / PrusaSlicer can embed QOI thumbnails)."""
    try:
        if raw[:4] != b"qoif":
            return None
        w, h = struct.unpack(">II", raw[4:12])
        if not (0 < w <= 2048 and 0 < h <= 2048):
            return None
        out = bytearray(w * h * 4)
        idx = [(0, 0, 0, 0)] * 64
        r = g = b = 0
        a = 255
        p, o, end, run = 14, 0, len(raw) - 8, 0
        while o < len(out):
            if run:
                run -= 1
            elif p < end:
                b1 = raw[p]; p += 1
                if b1 == 0xFE:
                    r, g, b = raw[p], raw[p + 1], raw[p + 2]; p += 3
                elif b1 == 0xFF:
                    r, g, b, a = raw[p], raw[p + 1], raw[p + 2], raw[p + 3]; p += 4
                elif b1 >> 6 == 0:
                    r, g, b, a = idx[b1]
                elif b1 >> 6 == 1:
                    r = (r + ((b1 >> 4) & 3) - 2) & 255
                    g = (g + ((b1 >> 2) & 3) - 2) & 255
                    b = (b + (b1 & 3) - 2) & 255
                elif b1 >> 6 == 2:
                    b2 = raw[p]; p += 1
                    dg = (b1 & 63) - 32
                    r = (r + dg - 8 + ((b2 >> 4) & 15)) & 255
                    g = (g + dg) & 255
                    b = (b + dg - 8 + (b2 & 15)) & 255
                else:
                    run = b1 & 63
                idx[(r * 3 + g * 5 + b * 7 + a * 11) % 64] = (r, g, b, a)
            out[o:o + 4] = bytes((r, g, b, a))
            o += 4
        return Image.frombytes("RGBA", (w, h), bytes(out))
    except Exception:
        return None


def parse_bgcode(path):
    """Prusa binary G-code: metadata blocks + embedded thumbnails (PNG / JPG / QOI)."""
    meta, thumbs = {"format": "Prusa binary G-code"}, []
    texts = []
    try:
        with open(path, "rb") as f:
            if f.read(4) != b"GCDE":
                return meta, None
            _ver, cks = struct.unpack("<IH", f.read(6))
            ck_len = 4 if cks == 1 else 0
            for _ in range(2000):
                hdr = f.read(8)
                if len(hdr) < 8:
                    break
                btype, comp, usize = struct.unpack("<HHI", hdr)
                csize = struct.unpack("<I", f.read(4))[0] if comp else usize
                if btype == 1:  # G-code: metadata and thumbnails come before it - stop here
                    break
                params = f.read(6 if btype == 5 else 2)
                data = f.read(csize)
                f.read(ck_len)
                if btype == 5 and len(params) == 6:
                    fmt, w, h = struct.unpack("<HHH", params)
                    im = decode_qoi(data) if fmt == 2 else None
                    if fmt in (0, 1):
                        try:
                            im = Image.open(io.BytesIO(data)); im.load()
                        except Exception:
                            im = None
                    if im is not None:
                        thumbs.append((w * h, im))
                elif btype in (0, 2, 3, 4):
                    if comp == 1:
                        try:
                            data = zlib.decompress(data)
                        except zlib.error:
                            continue
                    elif comp:
                        continue  # heatshrink - not worth it for metadata
                    texts.append("\n".join("; " + ln for ln in data.decode("utf-8", "ignore").splitlines()))
    except (OSError, struct.error):
        pass
    if texts:
        meta.update(gcode_meta_from_text("\n".join(texts)))
        meta["format"] = "Prusa binary G-code"
    thumbs.sort(key=lambda x: -x[0])
    return meta, (thumbs[0][1] if thumbs else None)


def f3d_preview(path, _depth=0, _data=None):
    """Fusion 360 .f3d / .f3z are ZIPs; Fusion stores a picture at FusionAssetName[Active]/Previews/small.png.
    .f3z holds one or more .f3d inside. Returns a PIL image or None."""
    try:
        z = zipfile.ZipFile(io.BytesIO(_data) if _data is not None else path)
    except (zipfile.BadZipFile, OSError):
        return None
    with z:
        infos = [i for i in z.infolist() if i.file_size > 0 and not i.is_dir()]
        pics = [i for i in infos if i.filename.lower().endswith((".png", ".jpg", ".jpeg"))
                and "preview" in i.filename.lower() and i.file_size < 20 * 1024 * 1024]
        # [Active] design first, then the biggest picture
        pics.sort(key=lambda i: ("[active]" not in i.filename.lower(), -i.file_size))
        for i in pics:
            try:
                im = Image.open(io.BytesIO(z.read(i)))
                im.load()
                return im
            except Exception:
                continue
        if _depth == 0:
            for i in sorted((i for i in infos if i.filename.lower().endswith(".f3d")), key=lambda i: -i.file_size):
                if i.file_size < 300 * 1024 * 1024:
                    im = f3d_preview(None, 1, z.read(i))
                    if im is not None:
                        return im
    return None


def _blend_stream(path):
    """Open a .blend for reading: plain, gzip (old Blender) or zstd (Blender 3.0+)."""
    f = open(path, "rb")
    magic = f.read(4)
    f.seek(0)
    if magic[:2] == b"\x1f\x8b":
        import gzip
        return gzip.GzipFile(fileobj=f)
    if magic == b"\x28\xb5\x2f\xfd":
        try:
            import zstandard
        except ImportError:
            f.close()
            return None
        return zstandard.ZstdDecompressor().stream_reader(f, closefd=True)
    return f


def _components(mask):
    """Connected areas of a small boolean mask -> list of (size, y0, x0, y1, x1)."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    out = []
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        seen[y, x] = True
        stack, n, y0, x0, y1, x1 = [(y, x)], 0, y, x, y, x
        while stack:
            cy, cx = stack.pop()
            n += 1
            y0, x0, y1, x1 = min(y0, cy), min(x0, cx), max(y1, cy), max(x1, cx)
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        out.append((n, y0, x0, y1, x1))
    return sorted(out, reverse=True)


def tidy_screenshot_preview(im, out=512):
    """Blender's preview is often a screenshot of the whole window: tiny model, lots of UI. Find the 3D viewport
    (the big area of one background colour), then the model inside it, and crop/zoom to it."""
    try:
        im = im.convert("RGBA")
        a = np.asarray(im)
        alpha = a[:, :, 3] > 8
        rows, cols = np.nonzero(alpha.any(1))[0], np.nonzero(alpha.any(0))[0]
        if not len(rows) or not len(cols):
            return im
        inner = alpha[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
        if inner.mean() < 0.95:  # already a cut-out (render with transparent background): just centre it
            sub = im.crop((int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1))
            side = int(max(sub.size) * 1.15) + 2
            sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            sq.alpha_composite(sub, ((side - sub.width) // 2, (side - sub.height) // 2))
            return sq.resize((out, out), Image.LANCZOS) if side < out else sq
        a = a[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1, :3].astype(np.int16)
        h, w = a.shape[:2]
        if h < 24 or w < 24:
            return im
        mid = a[h // 4: 3 * h // 4, w // 4: 3 * w // 4].reshape(-1, 3).astype(np.int64) // 6
        keys, cnt = np.unique(mid[:, 0] * 10000 + mid[:, 1] * 100 + mid[:, 2], return_counts=True)
        k = int(keys[cnt.argmax()])
        bg = np.array([k // 10000, (k // 100) % 100, k % 100]) * 6 + 3
        diff = np.abs(a - bg).max(2)
        isbg = diff <= 16
        # the viewport = the biggest connected area of that colour (the model inside it doesn't matter)
        closed = isbg.copy()  # bridge thin lines (axis lines cut the viewport in pieces)
        for _ in range(2):
            c2 = closed.copy()
            c2[1:, :] |= closed[:-1, :]; c2[:-1, :] |= closed[1:, :]; c2[:, 1:] |= closed[:, :-1]; c2[:, :-1] |= closed[:, 1:]
            closed = c2
        vp = _components(closed)
        if not vp:
            return im
        _n, vy0, vx0, vy1, vx1 = vp[0]
        if (vy1 - vy0) < h * 0.3 or (vx1 - vx0) < w * 0.3 or _n < h * w * 0.12:
            return im
        y0, y1, x0, x1 = vy0 + 2, vy1 - 2, vx0 + 2, vx1 - 2
        view = a[y0:y1 + 1, x0:x1 + 1]
        obj = diff[y0:y1 + 1, x0:x1 + 1] > 34
        # drop thin things (axis lines, grid, 3D cursor ring): erode then keep areas that survive
        er = obj.copy()
        er[1:, :] &= obj[:-1, :]; er[:-1, :] &= obj[1:, :]; er[:, 1:] &= obj[:, :-1]; er[:, :-1] &= obj[:, 1:]
        comps = _components(er)
        vh, vw = view.shape[:2]
        # the navigation gizmo lives in the top-right corner of the viewport
        comps = [cp for cp in comps if not (cp[3] < vh * 0.35 and cp[2] > vw * 0.72 and cp[0] < vh * vw * 0.03)]
        if not comps or comps[0][0] < 6:
            box = (0, 0, vh - 1, vw - 1)
        else:
            big = comps[0]
            by0, bx0, by1, bx1 = big[1:]
            for cp in comps[1:]:  # parts of the same model close to the biggest one
                if cp[0] >= max(3, big[0] * 0.04):
                    py, px = (by1 - by0) * 0.6 + 4, (bx1 - bx0) * 0.6 + 4
                    if cp[1] <= by1 + py and cp[3] >= by0 - py and cp[2] <= bx1 + px and cp[4] >= bx0 - px:
                        by0, bx0, by1, bx1 = min(by0, cp[1]), min(bx0, cp[2]), max(by1, cp[3]), max(bx1, cp[4])
            box = (by0, bx0, by1, bx1)
        by0, bx0, by1, bx1 = box
        side = max(by1 - by0, bx1 - bx0) * 1.5 + 6  # model fills about 2/3 of the picture
        side = min(side, vh, vw) if side > min(vh, vw) else side
        cy, cx = (by0 + by1) / 2, (bx0 + bx1) / 2
        t, l = int(round(cy - side / 2)), int(round(cx - side / 2))
        t, l = max(0, min(t, vh - int(side))), max(0, min(l, vw - int(side)))
        # cut the model out of the grey viewport (soft edge) so it sits on the card like the other previews
        if box != (0, 0, vh - 1, vw - 1):
            m = diff[y0:y1 + 1, x0:x1 + 1] > 22
            e = m.copy()
            e[1:, :] &= m[:-1, :]; e[:-1, :] &= m[1:, :]; e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
            d = e.copy()  # opening = erode + dilate: thin grid / axis lines disappear, the model stays
            d[1:, :] |= e[:-1, :]; d[:-1, :] |= e[1:, :]; d[:, 1:] |= e[:, :-1]; d[:, :-1] |= e[:, 1:]
            alpha_m = Image.fromarray((d * 255).astype(np.uint8))
        else:
            alpha_m = Image.new("L", (vw, vh), 255)
        rgba = Image.fromarray(view.astype(np.uint8)).convert("RGBA")
        rgba.putalpha(alpha_m)
        crop = rgba.crop((l, t, l + int(side), t + int(side)))
        if crop.width < 8:
            return im
        # small source: double with NEAREST first so edges stay crisp, then smooth up to size
        while crop.width * 2 <= out // 2:
            crop = crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST)
        big = crop.resize((out, out), Image.LANCZOS)
        a2 = big.getchannel("A").filter(ImageFilter.GaussianBlur(out / 200))
        big.putalpha(a2)
        return big
    except Exception:
        return im


def blend_thumbnail(path, max_scan=64 * 1024 * 1024):
    """The preview Blender saves in the 'TEST' block of a .blend (on by default). Returns a PIL image or None."""
    fh = _blend_stream(path)
    if fh is None:
        return None
    def readn(n):  # compressed streams may return short reads
        buf = bytearray()
        while len(buf) < n:
            c = fh.read(n - len(buf))
            if not c:
                break
            buf += c
        return bytes(buf)
    try:
        with fh:
            head = readn(12)
            if not head.startswith(b"BLENDER"):
                return None
            if head[7:9].isdigit():  # Blender 5.x: "BLENDER17-01v0500" - 17 byte header, 64-bit block headers
                hlen = int(head[7:9])
                head += readn(hlen - 12)
                bh_fmt, bh_len, end = "<4sIQqq", 32, "<"
                lay = (0, 3, 4)          # code, size, count positions
            else:                    # "BLENDER" + '_'|'-' (pointer size) + 'v'|'V' (endianness) + "279"
                end = "<" if head[8:9] == b"v" else ">"
                ptr = 8 if head[7:8] == b"-" else 4
                bh_fmt = end + "4si" + ("Q" if ptr == 8 else "I") + "ii"
                bh_len = struct.calcsize(bh_fmt)
                lay = (0, 1, 4)
            scanned = 0
            while scanned < max_scan:
                bh = readn(bh_len)
                if len(bh) < bh_len:
                    return None
                v = struct.unpack(bh_fmt, bh)
                code, size = v[lay[0]], v[lay[1]]
                if code == b"TEST":
                    data = readn(size)
                    w, h = struct.unpack(end + "ii", data[:8])
                    if not (0 < w <= 1024 and 0 < h <= 1024) or len(data) < 8 + w * h * 4:
                        return None
                    im = Image.frombytes("RGBA", (w, h), bytes(data[8:8 + w * h * 4]))
                    return tidy_screenshot_preview(im.transpose(Image.FLIP_TOP_BOTTOM))  # stored bottom row first
                if code in (b"ENDB", b"DNA1") or size < 0:
                    return None
                left = size
                while left > 0:  # skip (streams can't seek)
                    chunk = fh.read(min(left, 1 << 20))
                    if not chunk:
                        return None
                    left -= len(chunk)
                scanned += bh_len + size
    except (OSError, struct.error, EOFError, ValueError):
        return None
    except Exception:
        return None
    return None


def extract_gcode_thumbnails(text):
    """Return list of (w*h, PIL.Image) from '; thumbnail begin WxH len' blocks."""
    out = []
    pat = re.compile(r";\s*thumbnail(?:_(PNG|JPG|QOI))?\s+begin\s+(\d+)x(\d+)[^\n]*\n(.*?);\s*thumbnail(?:_\w+)?\s+end",
                     re.S | re.I)
    for m in pat.finditer(text):
        fmt = (m.group(1) or "PNG").lower()
        b64 = "".join(line.lstrip("; ").strip() for line in m.group(4).splitlines())
        im = _decode_thumb(fmt, b64)
        if im is not None:
            out.append((int(m.group(2)) * int(m.group(3)), im))
    out.sort(key=lambda x: -x[0])
    return out


# --------------------------------------------------------------------------- gcode
def _kv_comments(text):
    """'; key = value' and ';KEY:value' comment pairs."""
    kv = {}
    for m in re.finditer(r"^;\s*([A-Za-z_][A-Za-z0-9_ \[\]().%/-]*?)\s*[=:]\s*(.*?)\s*$", text, re.M):
        k = m.group(1).strip().lower()
        if k not in kv:
            kv[k] = m.group(2)
    return kv


def gcode_meta_from_text(text):
    kv = _kv_comments(text)
    meta = {}

    # slicer
    m = re.search(r"generated by\s+([A-Za-z][\w .-]*?)\s+v?(\d[\w.\-+]*)", text, re.I)
    if m:
        meta["slicer"] = f"{m.group(1).strip()} {m.group(2)}"
    elif re.search(r"Generated with Cura_SteamEngine\s+([\w.]+)", text):
        meta["slicer"] = "Cura " + re.search(r"Generated with Cura_SteamEngine\s+([\w.]+)", text).group(1)
    elif re.search(r"^;\s*BambuStudio", text, re.M):
        meta["slicer"] = "BambuStudio"
    elif "flavor" in kv:
        meta["slicer"] = "Cura"

    # time
    t = None
    for key in ("estimated printing time (normal mode)", "total estimated time", "estimated printing time",
                "print_time", "time", "estimated_time"):
        if key in kv:
            t = parse_duration(kv[key])
            if t:
                break
    if not t:
        mm = re.search(r"total estimated time:\s*([0-9dhms ]+)", text, re.I)
        if mm:
            t = parse_duration(mm.group(1))
    if t:
        meta["print_time_s"] = t

    # filament
    for key in ("filament used [g]", "total filament weight [g]", "total filament used [g]", "filament_weight"):
        if key in kv:
            vals = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", kv[key])]
            if vals:
                meta["filament_g"] = round(sum(vals), 2)
                break
    for key in ("filament used [mm]", "total filament length [mm]"):
        if key in kv:
            vals = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", kv[key])]
            if vals:
                meta["filament_m"] = round(sum(vals) / 1000, 2)
                break
    if "filament_m" not in meta and "filament used" in kv:  # Cura: '1.23m'
        v = _num(kv["filament used"])
        if v is not None:
            meta["filament_m"] = round(v, 2)
    if "filament_g" not in meta and meta.get("filament_m"):
        dia = _num(_first(kv.get("filament_diameter"))) or 1.75
        dens = _num(_first(kv.get("filament_density"))) or 1.24
        vol_cm3 = 3.14159265 * (dia / 20) ** 2 * meta["filament_m"] * 100
        meta["filament_g"] = round(vol_cm3 * dens, 2)
        meta["filament_g_estimated"] = True

    def pick(*keys, conv=None):
        for k in keys:
            if k in kv and kv[k] not in ("", None):
                v = _first(kv[k])
                return conv(v) if conv else v
        return None

    meta["layer_height"] = pick("layer_height", "layer height", conv=_num)
    meta["first_layer_height"] = pick("first_layer_height", "initial_layer_print_height", conv=_num)
    meta["nozzle"] = pick("nozzle_diameter", "machine_nozzle_size", "nozzle diameter", conv=_num)
    inf = pick("fill_density", "sparse_infill_density", "infill_sparse_density", "infill density")
    if inf is not None:
        meta["infill"] = inf if "%" in str(inf) else f"{inf}%"
    meta["material"] = pick("filament_type", "material", "filament type")
    meta["filament_color"] = pick("filament_colour", "filament_color", "extruder_colour")
    meta["printer"] = pick("printer_model", "printer_settings_id", "machine_name", "target_machine")
    meta["print_profile"] = pick("print_settings_id", "process_settings_id", "print_profile")
    meta["filament_profile"] = pick("filament_settings_id")
    meta["nozzle_temp"] = pick("temperature", "nozzle_temperature", "material_print_temperature", conv=_num)
    meta["bed_temp"] = pick("bed_temperature", "hot_plate_temp", "material_bed_temperature", conv=_num)
    meta["supports"] = pick("support_material", "enable_support", "support_enable")
    meta["perimeters"] = pick("perimeters", "wall_loops", "wall_line_count", conv=_num)
    if "total layer number" in kv:
        meta["layers"] = _num(kv["total layer number"])
    m = re.search(r"^;LAYER_COUNT:(\d+)", text, re.M)
    if m:
        meta["layers"] = int(m.group(1))
    if "max_z_height" in kv:
        meta["height_mm"] = _num(kv["max_z_height"])
    return {k: v for k, v in meta.items() if v not in (None, "")}


def parse_gcode(path, ext="gcode"):
    """Returns (meta, best_thumbnail_or_None)."""
    if ext == "bgcode":
        return parse_bgcode(path)
    with open(path, "rb") as f:
        f.seek(0, 2)
        size = f.tell()
        f.seek(0)
        head = f.read(HEAD_BYTES)
        tail = b""
        if size > HEAD_BYTES:
            f.seek(max(HEAD_BYTES, size - TAIL_BYTES))
            tail = f.read()
    text = head.decode("utf-8", "ignore") + "\n" + tail.decode("utf-8", "ignore")
    meta = gcode_meta_from_text(text)
    thumbs = extract_gcode_thumbnails(head.decode("utf-8", "ignore"))
    return meta, (thumbs[0][1] if thumbs else None)


# --------------------------------------------------------------------------- 3mf
def parse_3mf(path):
    """Returns (meta, embedded_thumbnail_or_None, is_sliced)."""
    meta, thumb, sliced = {}, None, False
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return {"error": "invalid 3MF"}, None, False
    with z:
        names = z.namelist()
        low = {n.lower(): n for n in names}

        # --- thumbnail: prefer plate images, then generic
        cands = [n for n in names if n.lower().endswith((".png", ".jpg", ".jpeg"))
                 and ("thumbnail" in n.lower() or "plate" in n.lower())
                 and "_small" not in n.lower() and "no_light" not in n.lower() and "top_" not in n.lower()
                 and "pick_" not in n.lower()]
        cands.sort(key=lambda n: (0 if "plate_1." in n.lower() else 1 if "plate" in n.lower() else 2,
                                  -z.getinfo(n).file_size))
        for n in cands:
            try:
                im = Image.open(io.BytesIO(z.read(n)))
                im.load()
                thumb = im
                break
            except Exception:
                continue

        # --- embedded gcode (sliced Bambu/Orca .gcode.3mf)
        gfiles = [n for n in names if n.lower().endswith(".gcode")]
        if gfiles:
            sliced = True
            meta["plates"] = len(gfiles)
            with z.open(gfiles[0]) as gf:
                head = gf.read(HEAD_BYTES).decode("utf-8", "ignore")
            meta.update(gcode_meta_from_text(head))

        # --- Bambu/Orca slice_info.config
        if "metadata/slice_info.config" in low:
            try:
                r = ET.fromstring(z.read(low["metadata/slice_info.config"]))
                pred = wt = 0.0
                mats = []
                for plate in r.iter("plate"):
                    for md in plate.findall("metadata"):
                        k, v = md.get("key"), md.get("value")
                        if k == "prediction":
                            pred += float(v or 0)
                        elif k == "weight":
                            wt += float(v or 0)
                    for fil in plate.iter("filament"):
                        if fil.get("type"):
                            mats.append(fil.get("type"))
                if pred:
                    meta["print_time_s"] = int(pred)
                if wt:
                    meta["filament_g"] = round(wt, 2)
                if mats:
                    meta["material"] = ", ".join(dict.fromkeys(mats))
            except Exception:
                pass

        # --- Bambu/Orca project_settings.config (JSON)
        if "metadata/project_settings.config" in low:
            try:
                ps = json.loads(z.read(low["metadata/project_settings.config"]))

                def g(k):
                    v = ps.get(k)
                    return v[0] if isinstance(v, list) and v else v
                meta.setdefault("layer_height", _num(g("layer_height")))
                meta.setdefault("nozzle", _num(g("nozzle_diameter")))
                inf = g("sparse_infill_density")
                if inf:
                    meta.setdefault("infill", inf if "%" in str(inf) else f"{inf}%")
                meta.setdefault("material", g("filament_type"))
                meta.setdefault("printer", g("printer_model") or g("printer_settings_id"))
                meta.setdefault("print_profile", g("print_settings_id"))
                meta.setdefault("slicer", "BambuStudio / OrcaSlicer")
                meta.setdefault("perimeters", _num(g("wall_loops")))
            except Exception:
                pass

        # --- PrusaSlicer config
        for key in ("metadata/slic3r_pe.config", "metadata/prusaslicer.config"):
            if key in low:
                try:
                    txt = z.read(low[key]).decode("utf-8", "ignore")
                    gm = gcode_meta_from_text(txt)
                    for k, v in gm.items():
                        meta.setdefault(k, v)
                    meta.setdefault("slicer", "PrusaSlicer")
                except Exception:
                    pass

        # --- core model metadata (Title, Designer, License...)
        root_name = low.get("3d/3dmodel.model")
        if root_name:
            try:
                with z.open(root_name) as mf:
                    head = mf.read(65536).decode("utf-8", "ignore")
                for k, v in re.findall(r'<metadata name="([^"]+)"[^>]*>([^<]*)</metadata>', head):
                    kl = k.lower()
                    if kl in ("title", "designer", "license", "description", "copyright", "application",
                              "designeruserid", "origin", "designcoverlink"):
                        val = v.strip()
                        if val:
                            meta["3mf_" + kl] = val[:500]
                app = meta.pop("3mf_application", None)
                if app and "slicer" not in meta:
                    meta["slicer"] = app
            except Exception:
                pass
    return {k: v for k, v in meta.items() if v not in (None, "")}, thumb, sliced


def zip_listing(path, limit=2000):
    try:
        with zipfile.ZipFile(path) as z:
            items = [{"name": i.filename, "size": i.file_size} for i in z.infolist() if not i.is_dir()]
            return items[:limit], len(items)
    except zipfile.BadZipFile:
        return [], 0
