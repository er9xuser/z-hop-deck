import json
import os
import sqlite3
import threading

DATA_DIR = os.environ.get("DATA_DIR", "/data")
DB_PATH = os.path.join(DATA_DIR, "zhopdeck.db")


def _migrate_old_name():
    """Up to 1.22 the app was called Layerdeck and the database data/layerdeck.db - rename it once."""
    old = os.path.join(DATA_DIR, "layerdeck.db")
    if os.path.exists(old) and not os.path.exists(DB_PATH):
        for suffix in ("", "-wal", "-shm"):
            if os.path.exists(old + suffix):
                os.rename(old + suffix, DB_PATH + suffix)
        print("renamed layerdeck.db -> zhopdeck.db", flush=True)


try:
    _migrate_old_name()
except OSError as _e:
    print(f"could not rename layerdeck.db: {_e}", flush=True)

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    root TEXT NOT NULL,
    folder TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    ext TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER, mtime REAL, sha256 TEXT,
    added_at TEXT DEFAULT (datetime('now')),
    missing INTEGER DEFAULT 0,
    analyzed INTEGER DEFAULT 0,
    thumb INTEGER DEFAULT 0,
    error TEXT,
    dim_x REAL, dim_y REAL, dim_z REAL, triangles INTEGER, volume_cm3 REAL, area_cm2 REAL,
    meta TEXT DEFAULT '{}',
    title TEXT, rating INTEGER DEFAULT 0, favorite INTEGER DEFAULT 0,
    status TEXT DEFAULT 'none', notes TEXT DEFAULT '', designer TEXT DEFAULT '',
    license TEXT DEFAULT '', source_url TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_files_sha ON files(sha256);
CREATE INDEX IF NOT EXISTS ix_files_folder ON files(root, folder);
CREATE INDEX IF NOT EXISTS ix_files_status ON files(status);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL COLLATE NOCASE, color TEXT DEFAULT '#7c8aa5'
);
CREATE TABLE IF NOT EXISTS file_tags (
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
);
CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', color TEXT DEFAULT '#f29d38',
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collection_files (
    collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    added_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (collection_id, file_id)
);
CREATE TABLE IF NOT EXISTS printers (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, model TEXT DEFAULT '',
    bed_x REAL DEFAULT 220, bed_y REAL DEFAULT 220, bed_z REAL DEFAULT 250,
    watts REAL DEFAULT 150, notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS spools (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, brand TEXT DEFAULT '', material TEXT DEFAULT 'PLA',
    color TEXT DEFAULT '#cccccc', diameter REAL DEFAULT 1.75, weight_total REAL DEFAULT 1000,
    weight_used REAL DEFAULT 0, price REAL DEFAULT 20, density REAL DEFAULT 1.24,
    notes TEXT DEFAULT '', archived INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS prints (
    id INTEGER PRIMARY KEY,
    file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
    file_name TEXT,
    printer_id INTEGER REFERENCES printers(id) ON DELETE SET NULL,
    spool_id INTEGER REFERENCES spools(id) ON DELETE SET NULL,
    started_at TEXT DEFAULT (datetime('now')),
    duration_s INTEGER DEFAULT 0, grams REAL DEFAULT 0, copies INTEGER DEFAULT 1,
    result TEXT DEFAULT 'success', cost REAL DEFAULT 0, notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY,
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    copies INTEGER DEFAULT 1, position INTEGER DEFAULT 0,
    spool_id INTEGER REFERENCES spools(id) ON DELETE SET NULL,
    printer_id INTEGER REFERENCES printers(id) ON DELETE SET NULL,
    notes TEXT DEFAULT '', added_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY, root TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL,
    notes TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), UNIQUE(root, path)
);
"""

DEFAULT_SETTINGS = {
    "render_color": "#f29d38",
    "currency": "€",
    "kwh_price": "0.20",
    "default_watts": "150",
    "default_density": "1.24",
    "default_spool_price": "20",
    "mesh_fill_factor": "0.45",
    "hourly_rate": "0",
    "scan_interval": os.environ.get("SCAN_INTERVAL", "30"),
    "slicers": "orcaslicer,cura",
    "viewer_bed": "350",
    "spoolman_url": os.environ.get("SPOOLMAN_URL", ""),
    "spoolman_deduct": "0",
    "spoolman_web_url": os.environ.get("SPOOLMAN_WEB_URL", ""),
    "auto_print_log": "1",
    "octo_api_key": "",
    "orca_printer": "",
    "orca_start": "never",
    "orca_folder": "Orca",
    "logout_url": os.environ.get("LOGOUT_URL", ""),
}


def conn():
    c = getattr(_local, "conn", None)
    if c is None:
        c = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA synchronous=NORMAL")
        _local.conn = c
    return c


def init():
    os.makedirs(DATA_DIR, exist_ok=True)
    for sub in ("thumbs", "trash"):
        os.makedirs(os.path.join(DATA_DIR, sub), exist_ok=True)
    c = conn()
    c.executescript(SCHEMA)
    for k, v in DEFAULT_SETTINGS.items():
        c.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v))
    # migrations for databases created by older versions
    if "spoolman_id" not in {r["name"] for r in c.execute("PRAGMA table_info(spools)").fetchall()}:
        c.execute("ALTER TABLE spools ADD COLUMN spoolman_id INTEGER")
    if "ext_id" not in {r["name"] for r in c.execute("PRAGMA table_info(prints)").fetchall()}:
        c.execute("ALTER TABLE prints ADD COLUMN ext_id TEXT")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_prints_ext ON prints(ext_id)")
    if not (c.execute("SELECT value FROM settings WHERE key='octo_api_key'").fetchone() or [""])[0]:
        import secrets as _s
        c.execute("INSERT OR REPLACE INTO settings(key, value) VALUES ('octo_api_key', ?)", (_s.token_hex(16).upper(),))
    have = {r["name"] for r in c.execute("PRAGMA table_info(printers)").fetchall()}
    for col, ddl in (("conn_type", "TEXT DEFAULT ''"), ("conn_url", "TEXT DEFAULT ''"), ("conn_key", "TEXT DEFAULT ''"),
                     ("web_url", "TEXT DEFAULT ''")):
        if col not in have:
            c.execute(f"ALTER TABLE printers ADD COLUMN {col} {ddl}")


def q(sql, args=()):
    return [dict(r) for r in conn().execute(sql, args).fetchall()]


def q1(sql, args=()):
    r = conn().execute(sql, args).fetchone()
    return dict(r) if r else None


def ex(sql, args=()):
    cur = conn().execute(sql, args)
    return cur.lastrowid


def settings():
    return {r["key"]: r["value"] for r in q("SELECT key, value FROM settings")}


def setting(key, default=None):
    r = q1("SELECT value FROM settings WHERE key=?", (key,))
    return r["value"] if r else default


def set_setting(key, value):
    ex("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
       (key, str(value)))


class tx:
    """with db.tx(): ... -> BEGIN IMMEDIATE / COMMIT / ROLLBACK"""

    def __enter__(self):
        conn().execute("BEGIN IMMEDIATE")

    def __exit__(self, et, ev, tb):
        conn().execute("ROLLBACK" if et else "COMMIT")
        return False


def loads(s):
    try:
        return json.loads(s or "{}")
    except Exception:
        return {}
