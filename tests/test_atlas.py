import unittest

from rarepath.atlas import Atlas, AtlasError


class AtlasTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.atlas = Atlas()

    def test_seed_counts_and_every_edge_has_evidence(self):
        self.assertEqual(len(self.atlas.nodes), 9)
        self.assertEqual(len(self.atlas.edges), 9)
        self.assertEqual(len(self.atlas.sources), 7)
        for edge_id in self.atlas.edges:
            evidence = self.atlas.evidence(edge_id)
            self.assertTrue(evidence["source"]["url"].startswith("https://"))
            self.assertTrue(evidence["limitation"])
            self.assertTrue(evidence["basis"])

    def test_search_resolves_names_and_synonyms(self):
        self.assertEqual(self.atlas.search("Angelman")[0]["id"], "angelman")
        self.assertEqual(self.atlas.search("15q11-q13 duplication")[0]["id"], "dup15q")
        self.assertEqual(self.atlas.search("UBE3A")[0]["id"], "ube3a")
        self.assertEqual(self.atlas.search("Linking Angelman and Dup15q Data for Expanded Research")[0]["id"], "ladder")
        self.assertEqual(self.atlas.search("Linking Angelman and Dup15q Databases for Expanded Research")[0]["id"], "ladder")
        self.assertTrue(self.atlas.search("Prader-Willi")[0]["counterexample"])
        self.assertEqual(self.atlas.search("not-in-seed"), [])

    def test_prader_willi_is_a_sourced_counterexample_without_an_asset_route(self):
        self.assertTrue(self.atlas.nodes["pws"]["counterexample"])
        edge = self.atlas.edges["angelman-pws"]
        self.assertEqual(edge["role"], "counterexample")
        self.assertEqual(edge["basis"], "inference from two sourced coordinates")
        self.assertEqual(edge["source_id"], "medline-pws")
        self.assertIn("Causes", edge["source_locator"])
        self.assertIn("chromosome-region illustration", edge["source_locator"])
        self.assertEqual(edge["supporting_source_ids"], ["medline-angelman"])
        for boundary in ("mechanism", "therapy", "endpoints", "registry reuse"):
            self.assertIn(boundary, edge["limitation"])
        self.assertEqual(self.atlas.path("pws", "ladder"), [])
        self.assertEqual(self.atlas.path("angelman", "pws"), [])
        pws_brief = self.atlas.brief("pws")
        self.assertEqual(pws_brief["known"], [])
        self.assertIsNone(pws_brief["asset"])

    def test_coordinate_comparison_discloses_both_sources_and_inference(self):
        evidence = self.atlas.evidence("ube3a-locus")
        self.assertEqual(evidence["source"]["id"], "ncbi-ube3a")
        self.assertEqual([source["id"] for source in evidence["supporting_sources"]], ["medline-dup15q"])
        self.assertIn("inference", evidence["basis"])
        self.assertIn("not a claim quoted", evidence["summary"])

    def test_near_miss_is_labeled_as_suggestion_not_autoselected(self):
        results = self.atlas.search("ABGELMAN")
        self.assertEqual(results[0]["id"], "angelman")
        self.assertEqual(results[0]["match_kind"], "spelling_suggestion")

    def test_biological_and_collaboration_routes_are_independent(self):
        biology = self.atlas.path("angelman", "dup15q", {"angelman-ladder", "dup15q-ladder"})
        self.assertEqual(biology, ["angelman-ube3a", "ube3a-locus", "dup15q-locus"])
        collaboration = self.atlas.path("angelman", "dup15q", {"angelman-ube3a", "ube3a-locus", "dup15q-locus"})
        self.assertEqual(collaboration, ["angelman-ladder", "dup15q-ladder"])

    def test_ablation_does_not_erase_independent_collaboration(self):
        result = self.atlas.ablate("angelman-ube3a")
        self.assertTrue(result["biological_route_before"])
        self.assertEqual(result["biological_route_after"], [])
        self.assertEqual(result["collaboration_route_before"], result["collaboration_route_after"])

    def test_brief_marks_governance_and_uncertainty(self):
        brief = self.atlas.brief("angelman")
        self.assertIn("source-backed chromosome-15 coordinates", brief["summary"])
        self.assertIn("Neither establishes treatment equivalence", brief["summary"])
        self.assertEqual([item["level"] for item in brief["access"]], [1, 2, 3])
        self.assertIn("LADDER staff", brief["access"][2]["requirements"])
        self.assertIn("existing", brief["asset"]["description"])
        self.assertIn("medical advice", brief["disclaimer"])
        self.assertTrue(brief["unknown"])
        self.assertTrue(any("Prader-Willi" in item for item in brief["unknown"]))
        self.assertFalse(any("Prader-Willi" in item for item in brief["known"]))
        self.assertIn("medline-pws", [source["id"] for source in brief["sources"]])
        self.assertEqual(set(brief["tenx"]), {"goal", "without", "with", "not_accelerated", "assumption"})
        self.assertTrue(brief["tenx"]["without"])
        self.assertTrue(brief["tenx"]["with"])
        self.assertIn("IRB", " ".join(brief["tenx"]["not_accelerated"]))
        self.assertIn("hypothesis", brief["tenx"]["assumption"])
        self.assertIsNone(self.atlas.brief("ube3a")["asset"])
        self.assertIn("tenx", self.atlas.brief("pws"))

    def test_no_supported_route_explains_coverage_without_negative_evidence(self):
        payload = self.atlas.no_supported_route()
        self.assertEqual(payload["status"], "no_supported_route")
        self.assertEqual(payload["checked_sources"], list(self.atlas.sources))
        self.assertEqual(payload["seed_version"], self.atlas.data["version"])
        self.assertTrue(payload["not_negative_evidence"])
        self.assertTrue(payload["next_step"])

    def test_unknown_node_or_edge_fails_closed(self):
        with self.assertRaises(AtlasError):
            self.atlas.graph("imaginary")
        with self.assertRaises(AtlasError):
            self.atlas.evidence("imaginary")


if __name__ == "__main__":
    unittest.main()
