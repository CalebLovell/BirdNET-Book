import importlib.util
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from contextlib import closing
from datetime import date, datetime, timedelta
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SEED_SCRIPT = REPO_ROOT / "scripts" / "seed_test_data.py"

CREATE_DETECTIONS = """
CREATE TABLE detections (
  Date DATE,
  Time TIME,
  Sci_Name VARCHAR(100) NOT NULL,
  Com_Name VARCHAR(100) NOT NULL,
  Confidence FLOAT,
  Lat FLOAT,
  Lon FLOAT,
  Cutoff FLOAT,
  Week INT,
  Sens FLOAT,
  Overlap FLOAT,
  File_Name VARCHAR(100) NOT NULL
)
"""

OLD_DETECTION = (
    "2000-01-01",
    "00:00:00",
    "Oldus birdus",
    "Old Bird",
    0.5,
    0.0,
    0.0,
    0.7,
    1,
    1.25,
    0.0,
    "old.mp3",
)


def load_seeder():
    """Imports the seeder as a module so the generator can be tested without a database."""
    spec = importlib.util.spec_from_file_location("seed_test_data", SEED_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


seeder = load_seeder()


class ReplayTests(unittest.TestCase):
    """The replayed history is the only sample data the UI has.

    These lock in what makes it useful: it ends today, never in the future,
    and keeps the real station's times of day and species mix."""

    NOW = datetime(2030, 3, 10, 9, 30, 0)

    def setUp(self):
        self.rows = seeder.generate_rows(now=self.NOW)
        self.fixture = seeder.load_fixture()

    def test_history_ends_today_and_never_in_the_future(self):
        """Catches a shift that leaves "today" empty or puts detections after now."""
        stamps = [datetime.fromisoformat(f"{row[0]}T{row[1]}") for row in self.rows]
        self.assertEqual(max(stamps).date(), self.NOW.date())
        self.assertLessEqual(max(stamps), self.NOW)

    def test_shift_is_whole_days_so_times_of_day_stay_real(self):
        """Catches a shift that drags the dawn chorus to some other hour."""
        recorded_times = Counter(row["Time"] for row in self.fixture)
        replayed_times = Counter(row[1] for row in self.rows)
        for time, count in replayed_times.items():
            self.assertLessEqual(count, recorded_times[time])

    def test_only_todays_unheard_detections_are_dropped(self):
        """Catches the future-filter swallowing earlier days too."""
        last_day = self.fixture[-1]["Date"]
        later_today = sum(
            1 for row in self.fixture if row["Date"] == last_day and row["Time"] > "09:30:00"
        )
        self.assertEqual(len(self.rows), len(self.fixture) - later_today)

    def test_week_and_file_name_follow_the_shifted_date(self):
        """Catches rows that still carry the recording's original dates."""
        for row in self.rows[:50] + self.rows[-50:]:
            day = date.fromisoformat(row[0])
            self.assertEqual(row[8], day.isocalendar()[1])
            self.assertIn(f"-{row[0]}-birdnet-{row[1]}.mp3", row[11])

    def test_days_keeps_only_the_most_recent_days(self):
        rows = seeder.generate_rows(days=7, now=self.NOW)
        days = {row[0] for row in rows}
        self.assertLessEqual(len(days), 7)
        self.assertGreaterEqual(min(days), str(self.NOW.date() - timedelta(days=6)))

    def test_fixture_does_not_reveal_the_station_location(self):
        """The repo is public: the station's location stays blanked to 0, 0."""
        for row in self.fixture:
            self.assertEqual((float(row["Lat"]), float(row["Lon"])), (0.0, 0.0))


class SeedTestDataTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "birds.db"

    def run_seeder(self, *extra_args):
        return subprocess.run(
            [
                sys.executable,
                str(SEED_SCRIPT),
                "--db",
                str(self.db_path),
                "--days",
                "2",
                "--no-audio",
                *extra_args,
            ],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def create_existing_database(self, include_reviews=True):
        with closing(sqlite3.connect(self.db_path)) as con:
            con.execute(CREATE_DETECTIONS)
            con.execute(
                "INSERT INTO detections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                OLD_DETECTION,
            )
            if include_reviews:
                con.execute("CREATE TABLE reviews (marker TEXT NOT NULL)")
                con.execute("INSERT INTO reviews VALUES ('old review')")
            con.execute("CREATE TABLE sentinel (marker TEXT NOT NULL)")
            con.execute("INSERT INTO sentinel VALUES ('keep me')")
            con.commit()

    def test_reset_replaces_detections_and_clears_reviews_only(self):
        """Catches a reset that leaves application review state behind or drops unrelated data."""
        self.create_existing_database()

        self.run_seeder()

        with closing(sqlite3.connect(self.db_path)) as con:
            old_rows = con.execute(
                "SELECT COUNT(*) FROM detections WHERE File_Name = 'old.mp3'"
            ).fetchone()[0]
            detection_count = con.execute("SELECT COUNT(*) FROM detections").fetchone()[0]
            review_count = con.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
            sentinel = con.execute("SELECT marker FROM sentinel").fetchone()[0]
        self.assertEqual(old_rows, 0)
        self.assertGreater(detection_count, 0)
        self.assertEqual(review_count, 0)
        self.assertEqual(sentinel, "keep me")

    def test_reset_succeeds_before_reviews_table_exists(self):
        """Catches an unconditional DELETE that breaks fresh databases."""
        self.create_existing_database(include_reviews=False)

        self.run_seeder()

        with closing(sqlite3.connect(self.db_path)) as con:
            detection_count = con.execute("SELECT COUNT(*) FROM detections").fetchone()[0]
        self.assertGreater(detection_count, 0)

    def test_append_preserves_existing_detections_and_reviews(self):
        """Catches reset behavior leaking into the explicitly non-destructive append path."""
        self.create_existing_database()

        self.run_seeder("--append")

        with closing(sqlite3.connect(self.db_path)) as con:
            old_rows = con.execute(
                "SELECT COUNT(*) FROM detections WHERE File_Name = 'old.mp3'"
            ).fetchone()[0]
            detection_count = con.execute("SELECT COUNT(*) FROM detections").fetchone()[0]
            review_count = con.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
        self.assertEqual(old_rows, 1)
        self.assertGreater(detection_count, 1)
        self.assertEqual(review_count, 1)


if __name__ == "__main__":
    unittest.main()
