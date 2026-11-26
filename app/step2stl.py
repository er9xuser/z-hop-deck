"""Convert a STEP/STP file to a binary STL (run as a separate process: python step2stl.py in.step out.stl [tol]).

Uses trimesh + cascadio (OpenCASCADE). Runs in its own process so a crash or a huge model can never take the
web app down; the caller enforces a timeout.
"""
import sys


def _load(trimesh, src, tol):
    attempts = (
        dict(file_type="step", force="mesh", tol_linear=tol, tol_angular=0.5, tol_relative=False),
        dict(file_type="step", force="mesh"),
        dict(file_type="step"),
    )
    last = None
    for kw in attempts:  # trimesh versions differ in the keyword arguments they accept
        try:
            return trimesh.load(src, **kw)
        except TypeError as e:
            last = e
    raise last


def main():
    src, dst = sys.argv[1], sys.argv[2]
    tol = float(sys.argv[3]) if len(sys.argv) > 3 else 0.05
    import trimesh  # noqa: E402  (imported here so the web app never needs it)
    obj = _load(trimesh, src, tol)
    if not isinstance(obj, trimesh.Trimesh):  # a Scene: merge all parts in world coordinates
        if hasattr(obj, "to_geometry"):
            obj = obj.to_geometry()
        elif hasattr(obj, "dump"):
            obj = obj.dump(concatenate=True)
        if isinstance(obj, (list, tuple)):
            obj = trimesh.util.concatenate(obj)
    if obj is None or len(getattr(obj, "faces", [])) == 0:
        print("ERROR: no solid geometry in this STEP file", file=sys.stderr)
        sys.exit(2)
    # cascadio goes through glTF, which is always in metres; 3D printing (and Z-Hop Deck) uses millimetres
    units = (getattr(obj, "units", None) or "").lower()
    if units in ("m", "meter", "meters", "metre", "metres"):
        obj.apply_scale(1000.0)
    elif not units and float(max(obj.extents)) < 2.0:  # no unit info and smaller than 2 "mm": it is metres
        obj.apply_scale(1000.0)
    obj.export(dst, file_type="stl")


if __name__ == "__main__":
    main()
