import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import purge_recordings  # noqa: E402


def touch(root, relative):
    path = os.path.join(root, relative)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").close()


class DeletionOrderTests(unittest.TestCase):
    def test_keeps_each_species_best_and_drops_least_confident_first(self):
        found = [
            ("d/Robin/a", "Robin", 90, "2026-07-01"),
            ("d/Robin/b", "Robin", 70, "2026-07-02"),
            ("d/Robin/c", "Robin", 80, "2026-07-03"),
            ("d/Wren/x", "Wren", 60, "2026-07-01"),
            ("d/Wren/y", "Wren", 75, "2026-07-01"),
        ]
        order = purge_recordings.deletion_order(found, keep=1, protected=set())
        # Robin keeps a (90), Wren keeps y (75); the rest go weakest first.
        self.assertEqual(order, ["d/Wren/x", "d/Robin/b", "d/Robin/c"])

    def test_a_species_with_few_recordings_loses_none(self):
        found = [("d/Owl/a", "Owl", 20, "2026-07-01")]
        self.assertEqual(purge_recordings.deletion_order(found, keep=10, protected=set()), [])

    def test_protected_recordings_are_never_offered(self):
        found = [
            ("d/Robin/a", "Robin", 90, "2026-07-01"),
            ("d/Robin/b", "Robin", 40, "2026-07-02"),
        ]
        order = purge_recordings.deletion_order(found, keep=1, protected={"d/Robin/b"})
        self.assertEqual(order, [])

    def test_older_goes_first_among_equal_confidence(self):
        found = [
            ("n/Jay/new", "Jay", 50, "2026-08-01"),
            ("o/Jay/old", "Jay", 50, "2026-07-01"),
            ("b/Jay/best", "Jay", 99, "2026-07-01"),
        ]
        order = purge_recordings.deletion_order(found, keep=1, protected=set())
        self.assertEqual(order, ["o/Jay/old", "n/Jay/new"])


class PurgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.by_date = os.path.join(self.tmp.name, "By_Date")
        for conf in (91, 72, 55):
            touch(self.by_date, f"2026-07-01/Robin/Robin-{conf}-2026-07-01-birdnet-0700{conf}.mp3")
        touch(self.by_date, "2026-07-01/Robin/Robin-55-2026-07-01-birdnet-070055.mp3.png")
        touch(self.by_date, "2026-07-02/Wren/Wren-40-2026-07-02-birdnet-080000.mp3")

    def tearDown(self):
        self.tmp.cleanup()

    def run_purge(self, usage):
        settings = {"EXTRACTED": self.tmp.name, "PURGE_THRESHOLD": "95", "PURGE_KEEP_PER_SPECIES": "1"}
        with mock.patch.object(purge_recordings, "get_settings", return_value=settings), \
                mock.patch.object(purge_recordings, "used_percent", side_effect=usage), \
                mock.patch.object(purge_recordings, "EXCLUDE_FILE", os.path.join(self.tmp.name, "none.txt")), \
                mock.patch("builtins.print"):
            purge_recordings.main()

    def remaining(self):
        return sorted(
            os.path.relpath(os.path.join(root, name), self.by_date)
            for root, _, files in os.walk(self.by_date) for name in files
        )

    def test_below_the_threshold_nothing_is_touched(self):
        before = self.remaining()
        self.run_purge(lambda _: 50)
        self.assertEqual(self.remaining(), before)

    def test_over_the_threshold_only_the_best_per_species_remain(self):
        readings = iter([96, 96, 80])
        self.run_purge(lambda _: next(readings))
        self.assertEqual(self.remaining(), [
            os.path.join("2026-07-01", "Robin", "Robin-91-2026-07-01-birdnet-070091.mp3"),
            os.path.join("2026-07-02", "Wren", "Wren-40-2026-07-02-birdnet-080000.mp3"),
        ])


if __name__ == "__main__":
    unittest.main()
