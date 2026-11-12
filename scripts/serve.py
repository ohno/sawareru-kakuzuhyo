"""Local web server for development: serves src/, and what is not there (the built data/*.json) from dist/, so
edits to src/ show on a normal reload without building again. Unlike `python -m http.server` it tells the browser
not to cache, so edited JavaScript modules are picked up.

    python scripts/serve.py [port]        (default port 8000; run python scripts/build.py once first)
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC, DIST = ROOT / "src", ROOT / "dist"


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = Path(super().translate_path(path))
        if not p.exists() and p.is_relative_to(SRC):
            alt = DIST / p.relative_to(SRC)
            if alt.exists():
                return str(alt)
        return str(p)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(SRC)))
    print(f"Serving {SRC} (and {DIST} for what is missing there) at http://localhost:{port}/")
    server.serve_forever()
