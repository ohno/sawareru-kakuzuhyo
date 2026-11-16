"""Local web server for development: serves src/, and what is not there (the built data/*.json) from dist/, so
edits to src/ show on a normal reload without building again. Unlike `python -m http.server` it tells the browser
not to cache, so edited JavaScript modules are picked up.

    python scripts/serve.py [port] [--dist DIR]      (default: port 8000, dist/; run python scripts/build.py once first)
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, dist, **kwargs):
        self.dist = dist
        super().__init__(*args, directory=str(SRC), **kwargs)

    def translate_path(self, path):
        p = Path(super().translate_path(path))
        if not p.exists() and p.is_relative_to(SRC):
            built = self.dist / p.relative_to(SRC)
            if built.exists():
                return str(built)
        return str(p)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serve src/ for development, with the built data from dist/.")
    parser.add_argument("port", nargs="?", type=int, default=8000)
    parser.add_argument("--dist", type=Path, default=ROOT / "dist", help="the built site (default: dist/)")
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, dist=args.dist.resolve()))
    print(f"Serving {SRC} (and {args.dist} for what is missing there) at http://localhost:{args.port}/")
    server.serve_forever()
