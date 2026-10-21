import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "tools" / "illustrate" / "photos.py"

spec = importlib.util.spec_from_file_location("photos", SCRIPT)
photos = importlib.util.module_from_spec(spec)
sys.path.insert(0, str(SCRIPT.parent))
spec.loader.exec_module(photos)


class RankTests(unittest.TestCase):
    def test_score_species_ranks_by_mean_probability_over_threshold(self):
        labels = ["A a_Alpha", "B b_Beta", "C c_Gamma"]
        probs = [np.array([0.9, 0.02, 0.5]), np.array([0.7, 0.04, 0.0])]
        ranked = photos.score_species(probs, labels, threshold=0.03)
        self.assertEqual([r[0] for r in ranked], ["A a", "C c", "B b"])
        self.assertAlmostEqual(ranked[0][2], 0.8)
        self.assertAlmostEqual(ranked[2][2], 0.02)  # 0.02 zeroed, 0.04 kept -> mean 0.02

    def test_read_ranking_round_trips(self):
        ranked = [("A a", "Alpha", 0.8), ("B b", "Beta", 0.1)]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ranking.csv"
            photos.write_ranking(path, ranked)
            rows = photos.read_ranking(path)
        self.assertEqual([r["rank"] for r in rows], [1, 2])
        self.assertEqual(rows[0]["slug"], "a-a")
        self.assertEqual(rows[1]["com_name"], "Beta")
        self.assertAlmostEqual(rows[1]["score"], 0.1)


def stub(responses, calls=None):
    """get_json stand-in: the first canned response whose key is in the URL."""
    def get_json(url):
        if calls is not None:
            calls.append(url)
        for key, value in responses.items():
            if key in url:
                return value
        return {}
    return get_json


def inat_taxon(name="Baeolophus bicolor", iconic="Aves"):
    return {"results": [{"id": 7, "name": name, "iconic_taxon_name": iconic}]}


def inat_obs(count):
    return {"results": [
        {"photos": [{"id": i, "url": f"https://inaturalist-open-data.s3.amazonaws.com/photos/{i}/square.jpg",
                     "attribution": f"(c) user{i}, some rights reserved (CC0)", "license_code": "cc0"}]}
        for i in range(1, count + 1)
    ]}


def commons(*licences):
    pages = {}
    for i, lic in enumerate(licences, 1):
        pages[str(i)] = {"title": f"File:Bird{i}.jpg", "imageinfo": [{
            "thumburl": f"https://upload.wikimedia.org/thumb/{i}.jpg",
            "descriptionurl": f"https://commons.wikimedia.org/wiki/File:Bird{i}.jpg",
            "extmetadata": {"LicenseShortName": {"value": lic}, "Artist": {"value": "<a href='x'>Jane</a>"}},
        }]}
    return {"query": {"pages": pages}}


SP = {"slug": "baeolophus-bicolor", "sci_name": "Baeolophus bicolor", "com_name": "Tufted Titmouse"}


class CandidateTests(unittest.TestCase):
    def test_target_species_drops_painted_and_adds_db(self):
        def row(slug):
            return {"slug": slug, "sci_name": slug, "com_name": slug.upper()}
        ranking = [row("a"), row("b"), row("c")]
        out = photos.target_species(ranking, [row("d"), row("a")], {"b"}, top=2)
        self.assertEqual([s["slug"] for s in out], ["a", "c", "d"])
        self.assertEqual(set(out[0]), {"slug", "sci_name", "com_name"})

    def test_candidates_keyed_by_birdnet_name(self):
        sp = {"slug": "regulus-calendula", "sci_name": "Regulus calendula", "com_name": "Ruby-crowned Kinglet"}
        get = stub({"/taxa": inat_taxon("Corthylio calendula"), "/observations": inat_obs(5)})
        out = photos.fetch_candidates(sp, get)
        self.assertEqual(out["slug"], "regulus-calendula")
        self.assertEqual(out["sci_name"], "Regulus calendula")
        self.assertTrue(out["taxon_ok"])
        self.assertEqual(len(out["candidates"]), 5)

    def test_non_bird_taxon_rejected(self):
        get = stub({"/taxa": inat_taxon(iconic="Mammalia"), "/observations": inat_obs(5)})
        out = photos.fetch_candidates(SP, get)
        self.assertFalse(out["taxon_ok"])
        self.assertEqual(out["candidates"], [])

    def test_candidate_urls_use_large_size(self):
        get = stub({"/taxa": inat_taxon(), "/observations": inat_obs(3), "commons.wikimedia": {}})
        c = photos.fetch_candidates(SP, get)["candidates"][0]
        self.assertEqual(c["url"], "https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg")
        self.assertEqual(c["license"], "cc0")
        self.assertEqual(c["source"], "inaturalist")
        self.assertEqual(c["page"], "https://www.inaturalist.org/photos/1")
        self.assertEqual(c["n"], 1)
        self.assertIn("user1", c["credit"])

    def test_wikimedia_rejects_cc_by(self):
        get = stub({"/taxa": inat_taxon(), "/observations": inat_obs(1),
                    "commons.wikimedia": commons("CC BY-SA 4.0", "Public domain", "CC0", "CC BY 2.0")})
        cands = photos.fetch_candidates(SP, get)["candidates"]
        wiki = [c for c in cands if c["source"] == "wikimedia"]
        self.assertEqual(len(wiki), 2)
        self.assertEqual({c["license"] for c in wiki}, {"public domain", "cc0"})
        self.assertEqual([c["n"] for c in cands], [1, 2, 3])
        self.assertEqual(wiki[0]["credit"], "Jane")
        self.assertTrue(wiki[0]["url"].startswith("https://upload.wikimedia.org/"))

    def test_wikimedia_skipped_when_inat_has_enough(self):
        calls = []
        get = stub({"/taxa": inat_taxon(), "/observations": inat_obs(5)}, calls)
        photos.fetch_candidates(SP, get)
        self.assertFalse(any("wikimedia" in u for u in calls))

    def test_no_candidates_recorded(self):
        get = stub({"/taxa": inat_taxon(), "/observations": {"results": []}, "commons.wikimedia": {}})
        out = photos.fetch_candidates(SP, get)
        self.assertTrue(out["taxon_ok"])
        self.assertEqual(out["candidates"], [])

    def test_candidates_resume_skips_fetched(self):
        a = {"slug": "a", "sci_name": "A a", "com_name": "A"}
        b = {"slug": "b", "sci_name": "B b", "com_name": "B"}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "candidates.json"
            path.write_text(json.dumps({"a": {"slug": "a", "candidates": [{"n": 1}]}}), encoding="utf-8")
            calls = []
            get = stub({"/taxa": inat_taxon(), "/observations": inat_obs(1), "commons.wikimedia": {}}, calls)
            state = photos.gather_candidates([a, b], path, get)
            self.assertFalse(any("A+a" in u or "A%20a" in u for u in calls))
            self.assertTrue(calls)
            saved = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(set(saved), {"a", "b"})
        self.assertEqual(saved["a"]["candidates"], [{"n": 1}])
        self.assertEqual(set(state), {"a", "b"})


if __name__ == "__main__":
    unittest.main()
