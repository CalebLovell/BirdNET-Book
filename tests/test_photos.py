import importlib.util
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


if __name__ == "__main__":
    unittest.main()
