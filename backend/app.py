"""
JobProof AI — backend/app.py
A real backend: stdlib-only threaded HTTP server.

  GET  /api/health         → {ok:true, engine:"python-stdlib", version}
  GET  /api/state          → full workspace state (creates it if unknown)
  POST /api/state          → merge a partial state patch into the workspace
  POST /api/analyze        → run the full Feature-1 pipeline server-side
  POST /api/extract        → multipart file upload → extracted text (PDF/DOCX/TXT)
  DELETE /api/state        → wipe the workspace

Everything persists in SQLite (data/jobproof.db) keyed by the
X-Workspace header, so the same profile follows the user across
browsers and devices, and survives server restarts.

Run:  python backend/app.py  (port 8741 by default)
"""

from __future__ import annotations

import io
import json
import os
import re
import sqlite3
import threading
import time
import mimetypes
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

import engine

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "jobproof.db")
PORT = int(os.environ.get("JOBPROOF_PORT", "8741"))

_db_lock = threading.Lock()
_ws_locks = {}
_ws_locks_guard = threading.Lock()
# RLock: merge_state holds the workspace lock and calls get_state,
# which re-acquires it — plain Lock would deadlock there.

# MIME types the stdlib table misses.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("video/mp4", ".mp4")


# ============================================================
# SQLite workspace store
# ============================================================

def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db():
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                payload TEXT,
                created_at TEXT NOT NULL
            )
        """)


def _ws_lock(ws_id):
    with _ws_locks_guard:
        if ws_id not in _ws_locks:
            _ws_locks[ws_id] = threading.RLock()
        return _ws_locks[ws_id]


DEFAULT_STATE = {
    "resume": None,
    "job": None,
    "analysis": None,
    "edits": [],
    "settings": {"brutallyHonest": False},
    "profile": None,
    "f2": {"skills": [], "evidence": [], "gaps": [], "missions": [], "interviews": [], "history": [], "reports": []},
    "f3": {"jobs": [], "saved": [], "applications": [], "versions": [], "changes": []},
    "f4": {"targets": [], "activeId": None},
    "activity": [],
    "version": 1,
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def get_state(ws_id):
    with _ws_lock(ws_id):
        with _conn() as conn:
            row = conn.execute("SELECT state FROM workspaces WHERE id = ?", (ws_id,)).fetchone()
        if row:
            return json.loads(row[0])
        with _conn() as conn:
            conn.execute(
                "INSERT INTO workspaces (id, state, updated_at, created_at) VALUES (?, ?, ?, ?)",
                (ws_id, json.dumps(DEFAULT_STATE), _now(), _now()),
            )
            conn.execute(
                "INSERT INTO events (workspace_id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
                (ws_id, "workspace.created", None, _now()),
            )
        return json.loads(json.dumps(DEFAULT_STATE))


def merge_state(ws_id, patch):
    """Merge a shallow patch; top-level keys that hold dicts of feature
    collections (f2/f3/f4) merge by identity of their items where possible,
    but the client sends whole collections so a shallow replace is correct."""
    with _ws_lock(ws_id):
        state = get_state(ws_id)
        for key, value in (patch or {}).items():
            if key in ("workspace", "timestamp"):
                continue
            state[key] = value
        state["version"] = state.get("version", 1) + 1
        with _conn() as conn:
            conn.execute(
                "UPDATE workspaces SET state = ?, updated_at = ? WHERE id = ?",
                (json.dumps(state), _now(), ws_id),
            )
            conn.execute(
                "INSERT INTO events (workspace_id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
                (ws_id, "state.merge", json.dumps(sorted((patch or {}).keys())), _now()),
            )
        return state


def delete_state(ws_id):
    with _ws_lock(ws_id):
        with _conn() as conn:
            conn.execute("DELETE FROM workspaces WHERE id = ?", (ws_id,))
            conn.execute(
                "INSERT INTO events (workspace_id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
                (ws_id, "workspace.deleted", None, _now()),
            )
    return {"ok": True}


def log_event(ws_id, kind, payload=None):
    try:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO events (workspace_id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
                (ws_id, kind, json.dumps(payload) if payload is not None else None, _now()),
            )
    except sqlite3.Error:
        pass


# ============================================================
# File extraction (PDF via pdf.py-less path: pure-python fallbacks)
# ============================================================

def extract_txt(data: bytes) -> str:
    for enc in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def extract_pdf(data: bytes) -> str:
    """Extract text from a PDF without third-party libraries.

    Strategy: walk the raw content streams and pull text from Tj/TJ
    operators. Handles Flate-compressed streams (the overwhelming
    majority of PDFs) via zlib. This is intentionally conservative:
    if a PDF defeats it, the client falls back to pdf.js in-browser and
    uploads the extracted text — so nothing breaks either way.
    """
    import zlib

    out = []

    def unescape(s: str) -> str:
        s = re.sub(r"\\([nrtbf()\\])", lambda m: {"n": "\n", "r": "", "t": "\t", "b": "", "f": "", "(": "(", ")": ")", "\\": "\\"}[m.group(1)], s)
        s = re.sub(r"\\([0-7]{1,3})", lambda m: chr(int(m.group(1), 8)), s)
        return s

    try:
        # Stream objects: stream ... endstream
        for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
            raw = m.group(1)
            try:
                text_m = re.search(rb"BT(.*?)ET", raw, re.S)
                chunk = raw
            except Exception:
                continue
            # Try Flate first
            for candidate in (chunk, chunk.strip(b"\r\n")):
                try:
                    chunk = zlib.decompress(candidate)
                    break
                except Exception:
                    continue
            # Pull strings from Tj / TJ operators
            for tm in re.finditer(rb"\((?:[^()\\]|\\.)*\)|\[(?:[^\[\]\\]|\\.)*\]\s*TJ|Tj|T\*|Td|TD|ET", chunk, re.S):
                tok = tm.group(0)
                if tok.startswith(b"("):
                    s = tok[1:-1]
                    out.append(unescape(s.decode("latin-1", errors="replace")))
                elif tok.endswith(b"TJ"):
                    for sm in re.finditer(rb"\((?:[^()\\]|\\.)*\)", tok):
                        s = sm.group(0)[1:-1]
                        out.append(unescape(s.decode("latin-1", errors="replace")))
                    out.append(" ")
                elif tok in (b"T*", b"TD", b"ET"):
                    out.append("\n")
    except Exception:
        pass

    text = "".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    if len(text.strip()) < 20:
        return ""
    return text


def extract_docx(data: bytes) -> str:
    """DOCX is a zip with word/document.xml — stdlib zipfile handles it."""
    import zipfile
    import xml.etree.ElementTree as ET

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml_bytes = z.read("word/document.xml")
        root = ET.fromstring(xml_bytes)
        paragraphs = []
        for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
            texts = [t.text or "" for t in p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")]
            line = "".join(texts).strip()
            if line:
                paragraphs.append(line)
        return "\n".join(paragraphs)
    except Exception:
        return ""


def extract_file(filename: str, data: bytes):
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return extract_pdf(data), "pdf"
    if lower.endswith(".docx"):
        return extract_docx(data), "docx"
    return extract_txt(data), "txt"


# ============================================================
# HTTP handler
# ============================================================

class Handler(BaseHTTPRequestHandler):
    server_version = "JobProofAI/2.0"
    protocol_version = "HTTP/1.1"

    # ---------- helpers ----------

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Workspace")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _ws(self):
        ws = self.headers.get("X-Workspace", "").strip()
        if not re.match(r"^[A-Za-z0-9_-]{4,64}$", ws):
            return None
        return ws

    def _read_body_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 20 * 1024 * 1024:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    def log_message(self, fmt, *args):
        pass  # keep the console quiet; events go to SQLite instead

    # ---------- routing ----------

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Workspace")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            ws = self._ws()
            if not ws:
                return self._json(400, {"error": "Missing or invalid X-Workspace header."})
            self._json(200, delete_state(ws))
            return
        self._json(404, {"error": "Not found"})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/health":
            return self._json(200, {"ok": True, "engine": "python-stdlib", "version": "2.0", "time": _now()})
        if path == "/api/state":
            ws = self._ws()
            if not ws:
                return self._json(400, {"error": "Missing or invalid X-Workspace header."})
            return self._json(200, {"ok": True, "workspace": ws, "state": get_state(ws)})

        return self._static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/state":
            ws = self._ws()
            if not ws:
                return self._json(400, {"error": "Missing or invalid X-Workspace header."})
            patch = self._read_body_json()
            if patch is None:
                return self._json(400, {"error": "Invalid JSON body."})
            return self._json(200, {"ok": True, "workspace": ws, "state": merge_state(ws, patch)})

        if path == "/api/analyze":
            ws = self._ws()
            if not ws:
                return self._json(400, {"error": "Missing or invalid X-Workspace header."})
            body = self._read_body_json()
            if not body or not isinstance(body.get("resumeText"), str) or not isinstance(body.get("job"), dict):
                return self._json(400, {"error": "Body must be {resumeText, resumeMeta?, job}."})
            try:
                result = engine.run_analysis(body["resumeText"], body.get("resumeMeta") or {}, body["job"])
            except Exception as e:  # never leak a traceback to the client
                log_event(ws, "analyze.error", {"message": str(e)[:300]})
                return self._json(500, {"error": "Analysis failed on the server. The team has the details."})
            if "error" in result:
                return self._json(422, {"error": result["error"]})
            log_event(ws, "analyze.ok", {"match": result["match"]["overall"]})
            return self._json(200, {"ok": True, "analysis": result})

        if path == "/api/extract":
            ws = self._ws()
            if not ws:
                return self._json(400, {"error": "Missing or invalid X-Workspace header."})
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            if length <= 0 or length > 20 * 1024 * 1024:
                return self._json(413, {"error": "File too large (limit 20MB)."})
            ctype = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in ctype:
                return self._json(400, {"error": "Expected multipart/form-data."})
            boundary = re.search(r'boundary="?([^";]+)"?', ctype)
            if not boundary:
                return self._json(400, {"error": "Malformed multipart body."})
            body = self.rfile.read(length)
            filename, data = _parse_multipart_file(body, boundary.group(1).encode())
            if data is None:
                return self._json(400, {"error": "No file part found in the upload."})
            text, kind = extract_file(filename or "upload.txt", data)
            if kind == "pdf" and len(text.strip()) < 20:
                return self._json(422, {
                    "error": "The server could not read text from this PDF (it may be a scan). "
                             "Try a text-based PDF or a .txt/.docx file.",
                })
            log_event(ws, "extract.ok", {"kind": kind, "chars": len(text)})
            return self._json(200, {"ok": True, "text": text, "kind": kind, "fileName": filename})

        self._json(404, {"error": "Not found"})

    # ---------- static ----------

    def _static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        # SPA-ish fallback: unknown extensions-less routes go to the app shell
        if not os.path.splitext(path)[1] and not path.startswith("/api"):
            path = "/index.html"
        fs_path = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if not fs_path.startswith(ROOT):
            return self._json(403, {"error": "Forbidden"})
        if not os.path.isfile(fs_path):
            return self._json(404, {"error": "Not found"})
        ctype = mimetypes.guess_type(fs_path)[0] or "application/octet-stream"
        try:
            with open(fs_path, "rb") as f:
                data = f.read()
        except OSError:
            return self._json(500, {"error": "Could not read file"})
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache" if fs_path.endswith((".html", ".js", ".css")) else "max-age=3600")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass


def _parse_multipart_file(body: bytes, boundary: bytes):
    """Extract the first file part from a multipart/form-data body."""
    delim = b"--" + boundary
    for part in body.split(delim):
        if b"Content-Disposition" not in part:
            continue
        header_end = part.find(b"\r\n\r\n")
        if header_end == -1:
            continue
        headers = part[:header_end].decode("latin-1", errors="replace")
        content = part[header_end + 4:]
        if content.endswith(b"\r\n"):
            content = content[:-2]
        name_m = re.search(r'filename="([^"]*)"', headers)
        if name_m is None:
            continue  # not a file part
        return name_m.group(1), content
    return None, None


# ============================================================
# Main
# ============================================================

def main():
    _init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"JobProof AI backend listening on http://0.0.0.0:{PORT}  (db: {DB_PATH})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
