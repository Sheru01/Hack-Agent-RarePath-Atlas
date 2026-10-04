"""Deterministic, inspectable graph backed by a versioned source file."""

from __future__ import annotations

import json
from collections import deque
from difflib import SequenceMatcher
from pathlib import Path


SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "seed.json"


class AtlasError(ValueError):
    pass


class Atlas:
    def __init__(self, path: Path = SEED_PATH):
        self.data = json.loads(Path(path).read_text(encoding="utf-8"))
        self.nodes = {item["id"]: item for item in self.data["nodes"]}
        self.edges = {item["id"]: item for item in self.data["edges"]}
        self.sources = {item["id"]: item for item in self.data["sources"]}
        self.validate()

    def validate(self) -> None:
        for kind, records, index in (
            ("node", self.data["nodes"], self.nodes),
            ("edge", self.data["edges"], self.edges),
            ("source", self.data["sources"], self.sources),
        ):
            if len(records) != len(index):
                raise AtlasError(f"duplicate {kind} id")
        for edge in self.edges.values():
            if edge["source"] not in self.nodes or edge["target"] not in self.nodes:
                raise AtlasError(f"dangling edge: {edge['id']}")
            if any(self.nodes[node_id].get("counterexample") for node_id in (edge["source"], edge["target"])) and edge.get("role") != "counterexample":
                raise AtlasError(f"counterexample edge missing role: {edge['id']}")
            if edge["source_id"] not in self.sources:
                raise AtlasError(f"missing source for edge: {edge['id']}")
            if any(source_id not in self.sources for source_id in edge.get("supporting_source_ids", [])):
                raise AtlasError(f"missing supporting source for edge: {edge['id']}")
            if not edge.get("summary") or not edge.get("limitation") or not edge.get("source_locator"):
                raise AtlasError(f"incomplete evidence for edge: {edge['id']}")
        for source in self.sources.values():
            if not source["url"].startswith("https://"):
                raise AtlasError(f"non-HTTPS source: {source['id']}")

    def search(self, query: str) -> list[dict]:
        needle = query.casefold().strip()
        if not needle:
            return []
        hits = []
        for node in self.nodes.values():
            terms = [node["label"], *node.get("aliases", [])]
            if any(needle in term.casefold() for term in terms):
                hits.append({**{key: node[key] for key in ("id", "type", "label", "description")},
                             **({"counterexample": True} if node.get("counterexample") else {})})
        if not hits and len(needle) >= 4:
            for node in self.nodes.values():
                terms = [node["label"], *node.get("aliases", [])]
                scores = [SequenceMatcher(None, needle, term.casefold()).ratio()
                          for term in terms if abs(len(term) - len(needle)) <= 2]
                if scores and max(scores) >= 0.82:
                    hits.append({**{key: node[key] for key in ("id", "type", "label", "description")},
                                 **({"counterexample": True} if node.get("counterexample") else {}),
                                 "match_kind": "spelling_suggestion"})
        return sorted(hits, key=lambda item: (
            item["label"].casefold() != needle,
            not item["label"].casefold().startswith(needle),
            item["type"] != "disease",
            len(item["label"]),
        ))[:5]

    def graph(self, focus: str) -> dict:
        if focus not in self.nodes:
            raise AtlasError("unknown node")
        # The intentionally bounded seed is shown in full to expose the independent
        # biology and research-infrastructure routes rather than imply a huge atlas.
        return {"focus": self.nodes[focus], "nodes": self.data["nodes"], "edges": self.data["edges"]}

    def evidence(self, edge_id: str) -> dict:
        if edge_id not in self.edges:
            raise AtlasError("unknown edge")
        edge = self.edges[edge_id]
        return {
            **edge,
            "source": self.sources[edge["source_id"]],
            "supporting_sources": [self.sources[source_id] for source_id in edge.get("supporting_source_ids", [])],
        }

    def path(self, start: str, end: str, omit_edges: set[str] | None = None) -> list[str]:
        if start not in self.nodes or end not in self.nodes:
            raise AtlasError("unknown node")
        omitted = omit_edges or set()
        queue = deque([(start, [])])
        visited = {start}
        while queue:
            current, path = queue.popleft()
            if current == end:
                return path
            for edge in self.edges.values():
                # A counterexample is inspectable evidence, never an action-route bridge.
                if edge["id"] in omitted or edge.get("role") == "counterexample":
                    continue
                neighbor = None
                if edge["source"] == current:
                    neighbor = edge["target"]
                elif edge["target"] == current:
                    neighbor = edge["source"]
                if neighbor and neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, [*path, edge["id"]]))
        return []

    def brief(self, focus: str) -> dict:
        if focus not in self.nodes:
            raise AtlasError("unknown node")
        tenx = {
            "goal": "Reach an expert-reviewed go/no-go decision on a scoped shared natural-history comparison between two patient communities.",
            "without": [
                "Locate an adjacent community through manual literature searches and introductions.",
                "Qualify overlap by reading papers, asset descriptions, and access rules.",
                "Draft and revise a question for expert review.",
            ],
            "with": [
                "Use typed search to find a sourced candidate relationship.",
                "Inspect source-backed paths, limitations, and asset access.",
                "Prepare an editable, cited Action Brief for expert review.",
            ],
            "not_accelerated": [
                "Expert review and response.",
                "Data-use and IRB approvals.",
                "Cohort harmonization.",
                "Clinical study execution.",
            ],
            "assumption": "For supported routes only, faster discovery and framing is a hypothesis until comparable manual and prototype tasks are measured; it does not claim faster end-to-end research progress.",
        }
        if focus not in ("angelman", "dup15q"):
            return {
                "title": f"{self.nodes[focus]['label']}: coverage boundary",
                "summary": "This node is indexed, but the prototype has no supported patient-to-asset action route from it.",
                "known": [],
                "unknown": ["No expert-reviewed action route is available in this bounded seed."],
                "question": "What additional sourced evidence would justify a route?",
                "asset": None,
                "access": [],
                "sources": [],
                "tenx": tenx,
                "disclaimer": "Research scoping only. Not medical advice or a treatment recommendation.",
            }
        return {
            "title": "Angelman ↔ Dup15q: research-scoping brief",
            "summary": "A comparison of source-backed chromosome-15 coordinates and an existing research collaboration create a concrete research question. Neither establishes treatment equivalence.",
            "known": [
                "Angelman syndrome can involve deficient maternal UBE3A function or expression through several molecular mechanisms.",
                "Dup15q involves a maternal copy-number gain across a region containing multiple genes; it is not merely a UBE3A synonym.",
                "LADDER already connects the Angelman and Dup15q research communities.",
            ],
            "unknown": [
                "Which phenotype measures are sufficiently harmonized across the two cohorts?",
                "Which molecular subgroups can be compared responsibly?",
                "Whether any specific therapy transfers between conditions; this prototype makes no such claim.",
                "Prader-Willi syndrome is a chromosome-15 counterexample, not a prioritized LADDER route; the sourced comparison does not establish shared mechanism, endpoints, therapy, or registry reuse.",
            ],
            "question": "Can the LADDER investigators compare a shared, precisely defined phenotype measure across molecularly stratified Angelman and Dup15q cohorts, and identify where the comparison is invalid?",
            "asset": {
                "name": "LADDER (existing collaboration)",
                "url": self.sources["ladder-about"]["url"],
                "description": "An existing governed research data collaboration; RarePath did not discover or create it.",
            },
            "access": [
                {"level": 1, "name": "Preview dashboard", "requirements": "No Data Access Committee (DAC) approval."},
                {"level": 2, "name": "De-identified datasets", "requirements": "DAC approval, IRB approval, and signed data-use agreement."},
                {"level": 3, "name": "Recruitment support", "requirements": "DAC review and evidence of IRB approval. LADDER staff distribute approved study materials to eligible participants."},
            ],
            "sources": [self.sources[key] for key in ("medline-angelman", "medline-dup15q", "medline-pws", "ladder-about", "ladder-researchers")],
            "tenx": tenx,
            "disclaimer": "Research scoping only. Not medical advice, a treatment recommendation, or permission to access patient data.",
        }

    def no_supported_route(self) -> dict:
        return {
            "status": "no_supported_route",
            "checked_sources": list(self.sources),
            "seed_version": self.data["version"],
            "message": "No supported route in the current evidence snapshot",
            "not_negative_evidence": True,
            "next_step": "Try a synonym or review additional primary sources with a qualified researcher before adding a route.",
        }

    def ablate(self, edge_id: str) -> dict:
        if edge_id not in self.edges:
            raise AtlasError("unknown edge")
        biological = self.path("angelman", "dup15q", {"angelman-ladder", "dup15q-ladder"})
        after_biological = self.path("angelman", "dup15q", {"angelman-ladder", "dup15q-ladder", edge_id})
        collaboration = self.path("angelman", "dup15q", {"angelman-ube3a", "ube3a-locus", "dup15q-locus"})
        after_collaboration = self.path("angelman", "dup15q", {"angelman-ube3a", "ube3a-locus", "dup15q-locus", edge_id})
        return {
            "removed_edge": edge_id,
            "biological_route_before": biological,
            "biological_route_after": after_biological,
            "collaboration_route_before": collaboration,
            "collaboration_route_after": after_collaboration,
        }
