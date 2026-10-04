"""One-process local demo server with a static UI and deterministic API."""

from __future__ import annotations

import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from .atlas import Atlas, AtlasError
from .openai_adapter import ProviderError, configured, generate_scoping_candidate, load_local_env


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


class Handler(BaseHTTPRequestHandler):
    atlas = Atlas()

    def log_message(self, format: str, *args: object) -> None:
        # Do not put user search strings or API responses into server logs.
        print(f"{self.address_string()} {self.command} {urlsplit(self.path).path}")

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query, keep_blank_values=True)
        path = parsed.path
        try:
            if path == "/api/status":
                return self.send_json({"openai_configured": configured(), "seed_version": self.atlas.data["version"], "mode": "deterministic_seed"})
            if path == "/api/search":
                terms = query.get("q", [])
                if len(terms) != 1 or not terms[0].strip():
                    raise AtlasError("malformed search query")
                results = self.atlas.search(terms[0])
                return self.send_json({"results": results} if results else self.atlas.no_supported_route())
            if path == "/api/graph":
                nodes = query.get("node", [])
                if len(nodes) != 1 or not nodes[0].strip():
                    raise AtlasError("malformed node id")
                return self.send_json(self.atlas.graph(nodes[0]) if nodes[0] in self.atlas.nodes else self.atlas.no_supported_route())
            if path == "/api/brief":
                nodes = query.get("node", [])
                if len(nodes) != 1 or not nodes[0].strip():
                    raise AtlasError("malformed node id")
                return self.send_json(self.atlas.brief(nodes[0]) if nodes[0] in self.atlas.nodes else self.atlas.no_supported_route())
            if path.startswith("/api/evidence/"):
                return self.send_json(self.atlas.evidence(path.removeprefix("/api/evidence/")))
            if path.startswith("/api/ablate/"):
                return self.send_json(self.atlas.ablate(path.removeprefix("/api/ablate/")))
            if path.startswith("/api/"):
                return self.send_json({"error": "unknown endpoint"}, 404)
            return self.serve_static(path)
        except AtlasError as exc:
            return self.send_json({"error": str(exc)}, 404)

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/api/generate-scoping":
            return self.send_json({"error": "unknown endpoint"}, 404)
        if not configured():
            return self.send_json({"error": "local OpenAI drafting is disabled"}, 403)
        if self.headers.get("Content-Type", "").split(";", 1)[0] != "application/json":
            return self.send_json({"error": "JSON request required"}, 415)
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_json({"error": "invalid request length"}, 400)
        if size < 0 or size > 4096:
            return self.send_json({"error": "request too large"}, 413)
        try:
            body = json.loads(self.rfile.read(size) or b"{}")
        except json.JSONDecodeError:
            return self.send_json({"error": "invalid JSON"}, 400)
        if body != {"focus": "angelman"}:
            return self.send_json({"error": "only the audited Angelman demo slice is supported"}, 400)
        try:
            result = generate_scoping_candidate(self.atlas)
        except ProviderError as exc:
            return self.send_json({"error": str(exc)}, 503)
        return self.send_json(result)

    def serve_static(self, path: str) -> None:
        relative = "index.html" if path == "/" else path.lstrip("/")
        target = (WEB / relative).resolve()
        if not target.is_relative_to(WEB.resolve()) or not target.is_file():
            return self.send_json({"error": "not found"}, 404)
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    load_local_env()
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"RarePath Atlas running at http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping RarePath Atlas", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
