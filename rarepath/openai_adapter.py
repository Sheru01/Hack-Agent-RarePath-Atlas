"""Optional live, source-constrained OpenAI scoping draft.

The model never writes graph edges or changes the deterministic Action Brief.
Its output is a candidate that a human must review.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .atlas import Atlas


API_URL = "https://api.openai.com/v1/responses"
ROOT = Path(__file__).resolve().parents[1]


class ProviderError(RuntimeError):
    pass


def load_local_env() -> None:
    """Read only the project-local, gitignored key file; never print its values."""
    path = ROOT / ".env.local"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        key = key.strip()
        if separator and key in {"OPENAI_API_KEY", "OPENAI_MODEL", "ENABLE_LOCAL_OPENAI", "PORT"}:
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def configured() -> bool:
    load_local_env()
    return bool(os.environ.get("OPENAI_API_KEY", "").strip()) and os.environ.get("ENABLE_LOCAL_OPENAI") == "1"


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_scoping_candidate(atlas: Atlas) -> dict:
    load_local_env()
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key or os.environ.get("ENABLE_LOCAL_OPENAI") != "1":
        raise ProviderError("Local OpenAI drafting is not enabled. Set the key and ENABLE_LOCAL_OPENAI=1; the source-backed demo works offline.")

    source_ids = ["medline-angelman", "medline-dup15q", "ladder-about", "ladder-researchers"]
    facts = {
        "scope": "Angelman to Dup15q research scoping; not treatment advice",
        "facts": [
            {"source_id": "medline-angelman", "fact": atlas.edges["angelman-ube3a"]["summary"]},
            {"source_id": "medline-dup15q", "fact": atlas.edges["dup15q-locus"]["summary"]},
            {"source_id": "ladder-about", "fact": atlas.edges["angelman-ladder"]["summary"]},
            {"source_id": "ladder-researchers", "fact": "LADDER lists three access levels: a free dashboard preview without DAC permission; de-identified datasets after DAC and IRB approval plus a signed data-use agreement; and recruitment support after DAC review and evidence of IRB approval, with LADDER staff distributing approved materials."},
        ],
    }
    prompt = (
        "Draft one cautious research-scoping question using ONLY these supplied facts. "
        "Do not introduce a new biological edge, claim that therapies transfer, "
        "claim LADDER is newly discovered, or give medical advice. "
        "Return exactly the requested JSON schema. Explicitly name uncertainty.\n"
        + json.dumps(facts, sort_keys=True)
    )
    model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
    schema = {
        "type": "object",
        "properties": {
            "draft_question": {"type": "string"},
            "uncertainty": {"type": "string"},
            "source_ids": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["draft_question", "uncertainty", "source_ids"],
        "additionalProperties": False,
    }
    payload = {
        "model": model,
        "input": prompt,
        "text": {"format": {"type": "json_schema", "name": "rarepath_scoping", "strict": True, "schema": schema}},
        "max_output_tokens": 350,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # API error bodies can contain details we should not display or log.
        raise ProviderError(f"OpenAI call failed with HTTP {exc.code}.") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ProviderError("OpenAI call failed due to network or timeout.") from exc

    if raw.get("status") != "completed" or raw.get("incomplete_details"):
        raise ProviderError("OpenAI response was incomplete; no candidate was accepted.")
    if any(content.get("type") == "refusal" for item in raw.get("output", []) for content in item.get("content", [])):
        raise ProviderError("OpenAI refused the request; no candidate was accepted.")
    texts = [content.get("text", "") for item in raw.get("output", [])
             for content in item.get("content", []) if content.get("type") == "output_text"]
    if not texts and isinstance(raw.get("output_text"), str):
        texts = [raw["output_text"]]
    if not texts:
        raise ProviderError("OpenAI returned no structured text output.")
    try:
        candidate = json.loads("".join(texts))
    except json.JSONDecodeError as exc:
        raise ProviderError("OpenAI returned invalid JSON output.") from exc
    if set(candidate) != {"draft_question", "uncertainty", "source_ids"}:
        raise ProviderError("OpenAI output failed schema validation.")
    if not isinstance(candidate["draft_question"], str) or not candidate["draft_question"].strip():
        raise ProviderError("OpenAI output lacks a question.")
    if not isinstance(candidate["uncertainty"], str) or not candidate["uncertainty"].strip():
        raise ProviderError("OpenAI output lacks uncertainty.")
    cited = candidate["source_ids"]
    if not isinstance(cited, list) or not cited or any(item not in source_ids for item in cited):
        raise ProviderError("OpenAI output cites unsupported source IDs.")

    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "provider": "openai",
        "model": model,
        "response_id": raw.get("id"),
        "prompt_sha256": _sha256(prompt),
        "output_sha256": _sha256(json.dumps(candidate, sort_keys=True)),
        "source_ids": cited,
        "status": "candidate_requires_human_review",
    }
    try:
        run_dir = ROOT / "run"
        run_dir.mkdir(exist_ok=True)
        with (run_dir / "generations.jsonl").open("a", encoding="utf-8") as file:
            file.write(json.dumps(event, sort_keys=True) + "\n")
    except OSError as exc:
        raise ProviderError("OpenAI responded, but the provenance log could not be saved; candidate withheld.") from exc
    return {"candidate": candidate, "provenance": event, "warning": "Unverified model draft; not clinical guidance or an approved graph edge."}
