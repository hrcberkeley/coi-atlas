"""Local preview without browser caching: python3 atlas/serve.py [port]"""
import sys, functools, http.server
from pathlib import Path

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(NoCache, directory=str(Path(__file__).parent))).serve_forever()
