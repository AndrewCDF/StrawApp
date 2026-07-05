#!/usr/bin/env python3
"""Static app server plus local JSON storage for the Raspberry Pi."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlparse


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
STATE_FILE = DATA_DIR / "straw-records.json"


class StrawAppHandler(SimpleHTTPRequestHandler):
    server_version = "StrawApp/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/api/state":
            self.send_json(read_state())
            return
        if route == "/api/health":
            self.send_json({"ok": True})
            return
        super().do_GET()

    def do_PUT(self):
        route = urlparse(self.path).path
        if route != "/api/state":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = self.rfile.read(length)
            data = json.loads(payload.decode("utf-8"))
            write_state(normalise_state(data))
        except (ValueError, json.JSONDecodeError) as error:
            self.send_error(HTTPStatus.BAD_REQUEST, str(error))
            return

        self.send_json({"ok": True})

    def send_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def read_state():
    if not STATE_FILE.exists():
        return empty_state()

    with STATE_FILE.open("r", encoding="utf-8") as handle:
        return normalise_state(json.load(handle))


def write_state(state):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", encoding="utf-8", dir=DATA_DIR, delete=False) as handle:
        json.dump(state, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary_name = handle.name
    os.replace(temporary_name, STATE_FILE)


def normalise_state(data):
    if not isinstance(data, dict):
        return empty_state()
    return {
        "fields": data.get("fields") if isinstance(data.get("fields"), list) else [],
        "stocktakes": data.get("stocktakes") if isinstance(data.get("stocktakes"), list) else [],
        "loads": data.get("loads") if isinstance(data.get("loads"), list) else [],
    }


def empty_state():
    return {"fields": [], "stocktakes": [], "loads": []}


def main():
    mimetypes.add_type("application/manifest+json", ".webmanifest")

    parser = argparse.ArgumentParser(description="Run the Straw Bale Records app.")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind. Use 0.0.0.0 on the Pi.")
    parser.add_argument("--port", default=8095, type=int, help="Port to serve.")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), StrawAppHandler)
    print(f"Straw Bale Records running at http://{args.host}:{args.port}/")
    print(f"Data file: {STATE_FILE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Straw Bale Records")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
