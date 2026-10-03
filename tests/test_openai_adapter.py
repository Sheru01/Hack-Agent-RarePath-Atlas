import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from rarepath.atlas import Atlas
from rarepath import openai_adapter


class FakeResponse:
    def __init__(self, candidate, status="completed", content_type="output_text"):
        self.payload = {"id": "test-response", "status": status, "output": [{"content": [{"type": content_type, "text": json.dumps(candidate)}]}]}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class OpenAITests(unittest.TestCase):
    def setUp(self):
        self.atlas = Atlas()

    def test_missing_key_fails_cleanly(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "ENABLE_LOCAL_OPENAI": "1"}), patch.object(openai_adapter, "load_local_env"):
            with self.assertRaisesRegex(openai_adapter.ProviderError, "not enabled"):
                openai_adapter.generate_scoping_candidate(self.atlas)

    def test_key_alone_does_not_enable_paid_calls(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-secret", "ENABLE_LOCAL_OPENAI": "0"}), patch.object(openai_adapter, "load_local_env"):
            self.assertFalse(openai_adapter.configured())
            with self.assertRaises(openai_adapter.ProviderError):
                openai_adapter.generate_scoping_candidate(self.atlas)

    def test_candidate_is_labeled_and_logged_without_key(self):
        candidate = {
            "draft_question": "Which phenotype measures can the cohorts compare?",
            "uncertainty": "Molecular subgroup compatibility needs expert review.",
            "source_ids": ["ladder-about", "medline-angelman"],
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-secret", "OPENAI_MODEL": "gpt-4.1-mini", "ENABLE_LOCAL_OPENAI": "1"}), \
                 patch.object(openai_adapter, "ROOT", Path(directory)), \
                 patch("urllib.request.urlopen", return_value=FakeResponse(candidate)) as request:
                result = openai_adapter.generate_scoping_candidate(self.atlas)
            self.assertEqual(result["candidate"], candidate)
            self.assertIn("Unverified", result["warning"])
            logged = (Path(directory) / "run" / "generations.jsonl").read_text()
            self.assertNotIn("test-secret", logged)
            self.assertIn("candidate_requires_human_review", logged)
            sent = json.loads(request.call_args.args[0].data)
            self.assertEqual(sent["text"]["format"]["type"], "json_schema")
            self.assertIn("free dashboard preview without DAC permission", sent["input"])

    def test_unsupported_citation_is_rejected(self):
        candidate = {"draft_question": "Question?", "uncertainty": "Unknown.", "source_ids": ["invented-source"]}
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-secret", "ENABLE_LOCAL_OPENAI": "1"}), \
                 patch.object(openai_adapter, "ROOT", Path(directory)), \
                 patch("urllib.request.urlopen", return_value=FakeResponse(candidate)):
                with self.assertRaisesRegex(openai_adapter.ProviderError, "unsupported source"):
                    openai_adapter.generate_scoping_candidate(self.atlas)
            self.assertFalse((Path(directory) / "run").exists())

    def test_incomplete_or_refused_output_is_rejected(self):
        candidate = {"draft_question": "Question?", "uncertainty": "Unknown.", "source_ids": ["ladder-about"]}
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-secret", "ENABLE_LOCAL_OPENAI": "1"}), \
                 patch.object(openai_adapter, "ROOT", Path(directory)):
                for response in (FakeResponse(candidate, status="incomplete"), FakeResponse(candidate, content_type="refusal")):
                    with patch("urllib.request.urlopen", return_value=response):
                        with self.assertRaises(openai_adapter.ProviderError):
                            openai_adapter.generate_scoping_candidate(self.atlas)
            self.assertFalse((Path(directory) / "run").exists())


if __name__ == "__main__":
    unittest.main()
