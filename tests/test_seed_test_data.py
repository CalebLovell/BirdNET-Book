import importlib.util
import math
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from collections import Counter, defaultdict
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
        self.rows = seeder.generate_rows(days=None, now=self.NOW)
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


class ExtrapolationTests(unittest.TestCase):
    """The months before the recording are invented, so these lock in that
    they read as the same yard's year rather than noise bolted onto it."""

    NOW = ReplayTests.NOW

    @classmethod
    def setUpClass(cls):
        cls.rows = seeder.generate_rows(now=cls.NOW)
        cls.real_rows = seeder.generate_rows(days=None, now=cls.NOW)
        cls.first_real_date = cls.real_rows[0][0]
        cls.synthetic = [row for row in cls.rows if row[0] < cls.first_real_date]
        cls.shift = cls.NOW.date() - date.fromisoformat(seeder.load_fixture()[-1]["Date"])

    def recording_month(self, row):
        """The month in the recording's own calendar, before the shift to today."""
        return (date.fromisoformat(row[0]) - self.shift).month

    def per_day(self, rows):
        days = Counter(row[0] for row in rows)
        return sum(days.values()) / max(1, len(days))

    def test_default_history_is_a_full_year_ending_today(self):
        """Catches the year view going back to a twelve-week stub."""
        self.assertEqual(seeder.DEFAULT_DAYS, 365)
        self.assertEqual(self.rows[-1][0], str(self.NOW.date()))
        self.assertEqual(self.rows[0][0], str(self.NOW.date() - timedelta(days=364)))

    def test_real_detections_are_replayed_untouched(self):
        """Catches the extrapolation leaking into, or reshaping, the real record."""
        recent = [row for row in self.rows if row[0] >= self.first_real_date]
        self.assertEqual(recent, self.real_rows)

    def test_reseeding_produces_the_same_year(self):
        """Catches unseeded randomness making every reset a different dataset."""
        self.assertEqual(seeder.generate_rows(now=self.NOW)[:500], self.rows[:500])

    def test_winter_visitors_and_summer_breeders_keep_to_their_seasons(self):
        """Catches presence curves that make every species a year-round resident."""
        by_month = defaultdict(Counter)
        for row in self.synthetic:
            by_month[self.recording_month(row)][row[3]] += 1

        self.assertGreater(by_month[1]["Dark-eyed Junco"], 50)
        self.assertEqual(by_month[6]["Dark-eyed Junco"], 0)
        self.assertGreater(by_month[6]["House Wren"], 20)
        self.assertEqual(by_month[1]["House Wren"], 0)

    def test_may_dawn_chorus_dwarfs_midwinter(self):
        """Catches a flat year with no seasonal swing in volume."""
        may = [row for row in self.synthetic if self.recording_month(row) == 5]
        december = [row for row in self.synthetic if self.recording_month(row) == 12]
        self.assertGreater(self.per_day(may), 4 * self.per_day(december))

    def test_dawn_follows_the_sunrise_through_the_year(self):
        """Catches real July times pasted onto January mornings."""

        def early_hour(month):
            hours = sorted(
                int(row[1][:2]) for row in self.synthetic
                if self.recording_month(row) == month and 4 <= int(row[1][:2]) <= 12
            )
            return hours[len(hours) // 20]

        self.assertGreater(early_hour(1), early_hour(6))

    def test_both_seams_meet_the_real_level(self):
        """Catches a cliff in the charts where invented data meets real."""
        real_start = date.fromisoformat(self.first_real_date)

        def between(start, end):
            return [row for row in self.rows if str(start) <= row[0] < str(end)]

        first_real = self.per_day(between(real_start, real_start + timedelta(days=14)))
        last_synthetic = self.per_day(between(real_start - timedelta(days=14), real_start))
        self.assertLess(abs(math.log(last_synthetic / first_real)), math.log(2))

        year_start = date.fromisoformat(self.rows[0][0])
        first_synthetic = self.per_day(between(year_start, year_start + timedelta(days=14)))
        last_real = self.per_day(between(self.NOW.date() - timedelta(days=13), self.NOW.date()))
        self.assertLess(abs(math.log(first_synthetic / last_real)), math.log(2))


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
