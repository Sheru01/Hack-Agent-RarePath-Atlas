import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

from rarepath.server import Handler, WEB


class IdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        self.ids.update(value for key, value in attrs if key == "id")


class SurfaceTests(unittest.TestCase):
    def test_every_js_selector_exists_in_html(self):
        parser = IdParser()
        parser.feed((WEB / "index.html").read_text(encoding="utf-8"))
        script = (WEB / "app.js").read_text(encoding="utf-8")
        used_ids = set(re.findall(r'\$\("#([a-z][a-z0-9-]*)"\)', script))
        self.assertFalse(used_ids - parser.ids, used_ids - parser.ids)

    def test_server_dispatches_core_read_endpoints_without_network(self):
        for path, expected_key in (
            ("/api/status", "seed_version"),
            ("/api/search?q=Angelman", "results"),
            ("/api/graph?node=angelman", "edges"),
            ("/api/brief?node=angelman", "access"),
            ("/api/evidence/angelman-ube3a", "source"),
            ("/api/ablate/angelman-ube3a", "biological_route_after"),
        ):
            with self.subTest(path=path):
                handler = object.__new__(Handler)
                handler.path = path
                seen = []
                handler.send_json = lambda payload, status=200: seen.append((status, payload))
                handler.do_GET()
                self.assertEqual(seen[0][0], 200)
                self.assertIn(expected_key, seen[0][1])

    def test_unknown_seed_queries_return_an_explicit_coverage_boundary(self):
        for path in (
            "/api/graph?node=not-in-seed",
            "/api/brief?node=not-in-seed",
            "/api/search?q=not-in-seed",
        ):
            with self.subTest(path=path):
                handler = object.__new__(Handler)
                handler.path = path
                seen = []
                handler.send_json = lambda payload, status=200: seen.append((status, payload))
                handler.do_GET()
                self.assertEqual(seen[0][0], 200)
                self.assertEqual(seen[0][1], handler.atlas.no_supported_route())

    def test_malformed_queries_and_unknown_endpoints_remain_404(self):
        for path in (
            "/api/search",
            "/api/search?q=",
            "/api/search?q=Angelman&q=Dup15q",
            "/api/graph",
            "/api/graph?node=",
            "/api/brief",
            "/api/brief?node=",
            "/api/not-an-endpoint",
        ):
            with self.subTest(path=path):
                handler = object.__new__(Handler)
                handler.path = path
                seen = []
                handler.send_json = lambda payload, status=200: seen.append((status, payload))
                handler.do_GET()
                self.assertEqual(seen[0][0], 404)


if __name__ == "__main__":
    unittest.main()
