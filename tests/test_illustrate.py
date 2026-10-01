import importlib.util
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "tools" / "illustrate" / "illustrate.py"

spec = importlib.util.spec_from_file_location("illustrate", SCRIPT)
illustrate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(illustrate)


def species(**overrides):
    sp = {
        "slug": "tringa-flavipes",
        "sci_name": "Tringa flavipes",
        "com_name": "Lesser Yellowlegs",
        "count": 1,
        "kind": "bird",
        "note": "",
    }
    sp.update(overrides)
    return sp


def seen(**overrides):
    looked = {
        "common_name": "Lesser Yellowlegs",
        "scientific_name": "Tringa flavipes",
        "kind": "bird",
        "heads": 1,
        "wings": 2,
        "legs_visible": 2,
        "tails": 1,
        "anything_besides_the_animal": False,
        "text_or_watermark": False,
        "cut_off_by_the_edge": False,
        "problems": "",
    }
    looked.update(overrides)
    return looked


class PromptTest(unittest.TestCase):
    def setUp(self):
        self.sections = illustrate.parse_sections(illustrate.PROMPT_PATH.read_text(encoding="utf-8"))

    def test_every_kind_and_pose_has_a_section(self):
        """Catches a renamed heading in prompt.md breaking every request for a kind."""
        for kind in ("bird", "mammal"):
            for pose in illustrate.POSES:
                prompt = illustrate.build_prompt(species(kind=kind), pose, self.sections)
                self.assertIn("Lesser Yellowlegs (Tringa flavipes)", prompt)
                self.assertNotIn("{", prompt)

    def test_mammals_get_mammal_anatomy_not_wings(self):
        """Catches a coyote being told it has exactly two wings."""
        prompt = illustrate.build_prompt(species(kind="mammal"), "flight", self.sections)
        self.assertIn("four legs", prompt)
        self.assertNotIn("two wings", prompt)

    def test_the_species_note_is_added(self):
        """Catches notes.json being loaded but never sent."""
        prompt = illustrate.build_prompt(species(note="Bright yellow legs."), "perched", self.sections)
        self.assertTrue(prompt.endswith("Field marks for Lesser Yellowlegs: Bright yellow legs."))

    def test_perched_birds_get_a_twig_and_ground_birds_stand(self):
        """Catches a heron being painted gripping a twig, or songbirds losing theirs."""
        twig = illustrate.build_prompt(species(), "perched", self.sections)
        ground = illustrate.build_prompt(species(perch="ground"), "perched", self.sections)
        self.assertIn("bare twig", twig)
        self.assertNotIn("bare twig", ground)
        self.assertIn("standing at rest on the ground", ground)

    def test_the_introduction_is_not_sent(self):
        """Catches prompt.md's instructions to the editor leaking into the prompt."""
        prompt = illustrate.build_prompt(species(), "perched", self.sections)
        self.assertNotIn("This file is the style", prompt)


class JudgeTest(unittest.TestCase):
    def test_a_clean_attempt_passes(self):
        self.assertEqual(illustrate.judge(species(), "flight", seen()), [])

    def test_the_wrong_species_fails(self):
        """Catches the near look-alike drift the verify step exists for."""
        reasons = illustrate.judge(
            species(), "perched", seen(common_name="Greater Yellowlegs", scientific_name="Tringa melanoleuca")
        )
        self.assertEqual(reasons, ["looks like Greater Yellowlegs (Tringa melanoleuca)"])

    def test_names_match_despite_punctuation(self):
        """Catches "Cooper's Hawk" failing against "Coopers hawk"."""
        sp = species(com_name="Cooper's Hawk", sci_name="Accipiter cooperii")
        self.assertEqual(illustrate.judge(sp, "perched", seen(common_name="Coopers hawk", scientific_name="")), [])

    def test_a_third_wing_fails_in_flight(self):
        self.assertIn("3 wings", illustrate.judge(species(), "flight", seen(wings=3)))

    def test_a_perched_bird_may_show_one_wing(self):
        """Catches a side-on perched bird failing because its far wing is hidden."""
        self.assertEqual(illustrate.judge(species(), "perched", seen(wings=1)), [])

    def test_mammals_need_no_wings(self):
        sp = species(kind="mammal", com_name="Coyote", sci_name="Canis latrans")
        looked = seen(common_name="Coyote", scientific_name="Canis latrans", wings=0, legs_visible=4)
        self.assertEqual(illustrate.judge(sp, "flight", looked), [])

    def test_a_painted_perch_fails(self):
        reasons = illustrate.judge(species(), "perched", seen(anything_besides_the_animal=True))
        self.assertEqual(reasons, ["something else is painted"])


class WorkDirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.saved = illustrate.WORK_DIR, illustrate.PICKS_PATH
        illustrate.WORK_DIR = Path(self.tmp.name)
        illustrate.PICKS_PATH = illustrate.WORK_DIR / "picks.json"
        self.addCleanup(self.restore)

    def restore(self):
        illustrate.WORK_DIR, illustrate.PICKS_PATH = self.saved

    def attempt(self, name, passed=None):
        path = illustrate.WORK_DIR / "tringa-flavipes" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"png")
        if passed is not None:
            illustrate.verdict_path(path).write_text(json.dumps({"passed": passed, "reasons": []}))
        return path

    def test_a_pose_with_no_attempts_needs_painting(self):
        self.assertTrue(illustrate.needs_painting("tringa-flavipes", "perched"))

    def test_an_unverified_attempt_is_not_repainted(self):
        """Catches a second `generate` before `verify` paying for duplicates."""
        self.attempt("perched-01.png")
        self.assertFalse(illustrate.needs_painting("tringa-flavipes", "perched"))

    def test_only_all_failed_poses_are_repainted(self):
        self.attempt("perched-01.png", passed=False)
        self.assertTrue(illustrate.needs_painting("tringa-flavipes", "perched"))
        self.attempt("perched-02.png", passed=True)
        self.assertFalse(illustrate.needs_painting("tringa-flavipes", "perched"))

    def test_attempts_are_numbered_on_not_overwritten(self):
        self.attempt("perched-01.png", passed=False)
        self.assertEqual(illustrate.next_attempt_path("tringa-flavipes", "perched").name, "perched-02.png")

    def test_the_newest_pass_is_picked_unless_one_was_chosen(self):
        first = self.attempt("flight-01.png", passed=True)
        self.attempt("flight-02.png", passed=False)
        third = self.attempt("flight-03.png", passed=True)
        self.assertEqual(illustrate.current_pick("tringa-flavipes", "flight", {}), third)
        picks = {"tringa-flavipes": {"flight": "flight-01.png"}}
        self.assertEqual(illustrate.current_pick("tringa-flavipes", "flight", picks), first)

    def test_flight_is_painted_from_the_perched_attempt(self):
        """Catches the pair losing its same-individual reference before verify runs."""
        perched = self.attempt("perched-01.png")
        images = illustrate.attachments(species(), "flight", {})
        self.assertEqual(images[-1][1], perched)


class StylePlatesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        saved = illustrate.STYLE_DIR
        illustrate.STYLE_DIR = Path(self.tmp.name)
        self.addCleanup(setattr, illustrate, "STYLE_DIR", saved)
        for name in ("1-hawk.jpg", "2-bluebird.jpg", "3-cardinal.jpg", "4-extra.jpg", "notes.md"):
            (illustrate.STYLE_DIR / name).write_bytes(b"")

    def test_birds_get_the_first_three_plates(self):
        """Catches a fourth plate or a stray text file being sent."""
        names = [p.name for p in illustrate.style_plates("bird")]
        self.assertEqual(names, ["1-hawk.jpg", "2-bluebird.jpg", "3-cardinal.jpg"])

    def test_mammals_get_their_own_plates(self):
        """Catches the coyote being painted from hawk and bluebird plates."""
        (illustrate.STYLE_DIR / "mammal").mkdir()
        (illustrate.STYLE_DIR / "mammal" / "1-coyote.jpg").write_bytes(b"")
        self.assertEqual([p.name for p in illustrate.style_plates("mammal")], ["1-coyote.jpg"])

    def test_mammals_fall_back_to_the_bird_plates(self):
        self.assertEqual(len(illustrate.style_plates("mammal")), 3)


class CanvasTest(unittest.TestCase):
    def setUp(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow not installed")
        self.Image = Image

    def blob(self, width, height):
        """An opaque width x height animal in a larger transparent margin."""
        image = self.Image.new("RGBA", (width + 100, height + 100), (0, 0, 0, 0))
        image.paste((200, 100, 50, 255), (50, 50, 50 + width, 50 + height))
        return image

    def test_every_illustration_is_the_same_square(self):
        """Catches the uneven sizes that made the web UI's cards misalign."""
        for width, height in ((300, 120), (90, 400), (500, 500)):
            for pose in illustrate.POSES:
                placed = illustrate.place_on_canvas(self.blob(width, height), pose)
                self.assertEqual(placed.size, (illustrate.CANVAS, illustrate.CANVAS))

    def test_perched_animals_share_a_baseline(self):
        """Catches feet and twigs sitting at different heights from card to card."""
        bottoms = {
            illustrate.place_on_canvas(self.blob(w, h), "perched").getbbox()[3]
            for w, h in ((300, 120), (90, 400), (500, 500))
        }
        self.assertEqual(len(bottoms), 1)

    def test_compact_animals_are_not_drawn_huge(self):
        """Catches a chunky bird filling its card while a slender one looks tiny."""
        compact = illustrate.place_on_canvas(self.blob(500, 500), "flight")
        left, top, right, bottom = compact.getbbox()
        filled = (right - left) * (bottom - top) / illustrate.CANVAS ** 2
        self.assertLess(filled, 0.8)
        self.assertGreater(filled, illustrate.TARGET_COVERAGE * 0.9)


class InstallTest(unittest.TestCase):
    def test_rewrites_the_web_uis_slug_list(self):
        """Catches the regex silently missing the real illustration-set.ts."""
        source = illustrate.SLUGS_TS.read_text(encoding="utf-8")
        rewritten = illustrate.rewrite_slugs(source, ["zenaida-macroura", "canis-latrans"])
        self.assertIn(
            'const NEW_SLUGS = new Set(["canis-latrans", "zenaida-macroura"]);', rewritten
        )
        self.assertEqual(rewritten.count("NEW_SLUGS"), source.count("NEW_SLUGS"))

    def test_a_long_slug_list_goes_one_per_line(self):
        """Catches an install leaving a line Biome's formatter would reject."""
        source = 'const NEW_SLUGS = new Set(["a-b"]);\n'
        slugs = [f"genus-species{n}" for n in range(6)]
        rewritten = illustrate.rewrite_slugs(source, slugs)
        self.assertTrue(rewritten.startswith('const NEW_SLUGS = new Set([\n\t"genus-species0",\n'))
        self.assertTrue(rewritten.endswith('\t"genus-species5",\n]);\n'))

    def test_only_species_with_both_poses_are_listed(self):
        """Catches a hero slot pointing at a flight pose that doesn't exist."""
        with tempfile.TemporaryDirectory() as tmp:
            for name in ("a-b.png", "a-b-2.png", "c-d.png", "e-f-2.png"):
                (Path(tmp) / name).write_bytes(b"")
            self.assertEqual(illustrate.complete_slugs(Path(tmp)), ["a-b"])


class SpeciesTest(unittest.TestCase):
    def test_reads_species_and_kinds_from_the_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "birds.db"
            with closing(sqlite3.connect(db)) as con:
                con.execute("CREATE TABLE detections (Sci_Name TEXT, Com_Name TEXT)")
                con.executemany(
                    "INSERT INTO detections VALUES (?, ?)",
                    [("Canis latrans", "Coyote")] + [("Zenaida macroura", "Mourning Dove")] * 2,
                )
                con.commit()
            found = illustrate.load_species(db)
        self.assertEqual([s["slug"] for s in found], ["zenaida-macroura", "canis-latrans"])
        self.assertEqual([s["kind"] for s in found], ["bird", "mammal"])
        self.assertEqual([s["colour"] for s in found], [None, None])

    def test_painting_needs_a_reference_photo(self):
        """Catches a species being painted from memory, which drifts off the real bird."""
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "birds.db"
            with closing(sqlite3.connect(db)) as con:
                con.execute("CREATE TABLE detections (Sci_Name TEXT, Com_Name TEXT)")
                con.execute("INSERT INTO detections VALUES ('Genus nophoto', 'No Photo Bird')")
                con.commit()
            with self.assertRaises(SystemExit) as stopped:
                illustrate.main(["--db", str(db), "generate", "genus-nophoto", "--dry-run"])
        self.assertIn("No reference photo for: genus-nophoto", str(stopped.exception))

    def test_a_species_can_keep_its_own_colour(self):
        """Catches the Blue Jay losing the 0.75 toning it was approved at."""
        notes = illustrate.load_notes()
        self.assertEqual(notes["cyanocitta-cristata"]["colour"], 0.75)
        self.assertNotIn("colour", notes["cardinalis-cardinalis"])


if __name__ == "__main__":
    unittest.main()
