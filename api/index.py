"""Vercel entry point. Reuses the local server's request handler unchanged.

The serverless runtime instantiates ``handler`` per request. All routes,
including static files under ``web/``, are rewritten here by vercel.json.
No OpenAI key is configured in the hosted deployment, so the live-draft
endpoint answers 403 and the page shows the drafter as unavailable.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rarepath.server import Handler  # noqa: E402


class handler(Handler):  # noqa: N801  (name required by the Vercel Python runtime)
    pass
