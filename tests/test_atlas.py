import unittest

from rarepath.atlas import Atlas, AtlasError


class AtlasTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.atlas = Atlas()

    def test_seed_counts_and_every_edge_has_evidence(self):
        self.assertEqual(len(self.atlas.nodes), 8)
        self.assertEqual(len(self.atlas.edges), 8)
        self.assertEqual(len(self.atlas.sources), 6)
        for edge_id in self.atlas.edges:
            evidence = self.atlas.evidence(edge_id)
            self.assertTrue(evidence["source"]["url"].startswith("https://"))
            self.assertTrue(evidence["limitation"])
            self.assertTrue(evidence["basis"])

    def test_search_resolves_names_and_synonyms(self):
        self.assertEqual(self.atlas.search("Angelman")[0]["id"], "angelman")
        self.assertEqual(self.atlas.search("15q11-q13 duplication")[0]["id"], "dup15q")
        self.assertEqual(self.atlas.search("UBE3A")[0]["id"], "ube3a")
        self.assertEqual(self.atlas.search("not-in-seed"), [])

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
        self.assertIsNone(self.atlas.brief("ube3a")["asset"])

    def test_unknown_node_or_edge_fails_closed(self):
        with self.assertRaises(AtlasError):
            self.atlas.graph("imaginary")
        with self.assertRaises(AtlasError):
            self.atlas.evidence("imaginary")


if __name__ == "__main__":
    unittest.main()
