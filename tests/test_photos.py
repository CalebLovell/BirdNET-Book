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


def inat_taxon(name="Baeolophus bicolor", iconic="Aves", term=None):
    taxon = {"id": 7, "name": name, "iconic_taxon_name": iconic}
    if term:
        taxon["matched_term"] = term
    return {"results": [taxon]}


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
        self.assertEqual([s["slug"] for s in out], ["a", "d"])
        self.assertEqual(set(out[0]), {"slug", "sci_name", "com_name"})

    def test_target_species_drops_painted_db_species(self):
        def row(slug):
            return {"slug": slug, "sci_name": slug, "com_name": slug.upper()}
        out = photos.target_species([row("a")], [row("p"), row("d")], {"p"}, top=5)
        self.assertEqual([s["slug"] for s in out], ["a", "d"])

    def test_candidates_keyed_by_birdnet_name(self):
        sp = {"slug": "regulus-calendula", "sci_name": "Regulus calendula", "com_name": "Ruby-crowned Kinglet"}
        get = stub({"/taxa": inat_taxon("Corthylio calendula", term="Regulus calendula"), "/observations": inat_obs(5)})
        out = photos.fetch_candidates(sp, get)
        self.assertEqual(out["slug"], "regulus-calendula")
        self.assertEqual(out["sci_name"], "Regulus calendula")
        self.assertTrue(out["taxon_ok"])
        self.assertEqual(len(out["candidates"]), 5)
        self.assertEqual(out["inat_name"], "Corthylio calendula")

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

    def test_different_species_hit_rejected(self):
        get = stub({"/taxa": inat_taxon("Baeolophus atricristatus"), "/observations": inat_obs(5)})
        out = photos.fetch_candidates(SP, get)
        self.assertFalse(out["taxon_ok"])
        self.assertEqual(out["candidates"], [])

    def test_exact_match_found_beyond_first_hit(self):
        resp = {"results": [{"id": 1, "name": "Baeolophus", "iconic_taxon_name": "Aves"},
                            {"id": 7, "name": "baeolophus BICOLOR", "iconic_taxon_name": "Aves"}]}
        out = photos.fetch_candidates(SP, stub({"/taxa": resp, "/observations": inat_obs(5)}))
        self.assertTrue(out["taxon_ok"])

    def test_off_host_photo_urls_dropped(self):
        obs = inat_obs(2)
        obs["results"][0]["photos"][0]["url"] = "https://static.inaturalist.org/photos/1/square.jpg"
        wiki = commons("CC0")
        wiki["query"]["pages"]["1"]["imageinfo"][0]["thumburl"] = "https://example.com/x.jpg"
        out = photos.fetch_candidates(SP, stub({"/taxa": inat_taxon(), "/observations": obs, "commons.wikimedia": wiki}))
        self.assertEqual([c["url"].split("/")[2] for c in out["candidates"]],
                         ["inaturalist-open-data.s3.amazonaws.com"])

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


def tiny_jpeg(color=(120, 160, 90), size=(60, 40)):
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


def sheet_state(count, per_species=2, empty=()):
    state = {}
    for i in range(count):
        slug = f"sp-{i:02d}"
        cands = [] if slug in empty else [
            {"n": n, "url": f"https://upload.wikimedia.org/{slug}/{n}.jpg", "page": "", "license": "cc0",
             "credit": "", "source": "wikimedia"} for n in range(1, per_species + 1)]
        state[slug] = {"slug": slug, "sci_name": f"Sp {i}", "com_name": f"Bird {i}",
                       "taxon_ok": True, "inat_name": None, "candidates": cands}
    return state


class SheetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        original = photos.PHOTOS_DIR
        photos.PHOTOS_DIR = Path(self.tmp.name)
        self.addCleanup(setattr, photos, "PHOTOS_DIR", original)

    def test_download_writes_files_and_skips_existing(self):
        state = sheet_state(2)
        calls = []

        def fetch(url):
            calls.append(url)
            return tiny_jpeg()
        photos.download_candidates(state, fetch)
        self.assertEqual(len(calls), 4)
        self.assertTrue((photos.PHOTOS_DIR / "sp-01" / "2.jpg").exists())
        photos.download_candidates(state, fetch)
        self.assertEqual(len(calls), 4)

    def test_download_survives_a_failed_fetch(self):
        state = sheet_state(1)

        def fetch(url):
            if url.endswith("/1.jpg"):
                raise OSError("dead link")
            return tiny_jpeg()
        photos.download_candidates(state, fetch)
        self.assertFalse((photos.PHOTOS_DIR / "sp-00" / "1.jpg").exists())
        self.assertTrue((photos.PHOTOS_DIR / "sp-00" / "2.jpg").exists())

    def test_build_sheets_splits_by_count(self):
        state = sheet_state(45)
        photos.download_candidates(state, lambda url: tiny_jpeg())
        paths = photos.build_sheets(state)
        self.assertEqual([p.name for p in paths], ["sheet-01.jpg", "sheet-02.jpg", "sheet-03.jpg"])
        self.assertTrue(all(p.exists() for p in paths))
        rows = json.loads((photos.PHOTOS_DIR / "sheets" / "sheet-03.json").read_text(encoding="utf-8"))
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[0], {"slug": "sp-40", "com_name": "Bird 40", "sci_name": "Sp 40", "candidates": [1, 2]})

    def test_sheet_skips_species_without_candidates(self):
        state = sheet_state(3, empty={"sp-01"})
        photos.download_candidates(state, lambda url: tiny_jpeg())
        photos.build_sheets(state)
        rows = json.loads((photos.PHOTOS_DIR / "sheets" / "sheet-01.json").read_text(encoding="utf-8"))
        self.assertEqual([r["slug"] for r in rows], ["sp-00", "sp-02"])

    def test_sheet_lists_only_candidates_that_downloaded(self):
        state = sheet_state(1)
        photos.download_candidates(state, lambda url: tiny_jpeg() if url.endswith("/2.jpg") else (_ for _ in ()).throw(OSError()))
        photos.build_sheets(state)
        rows = json.loads((photos.PHOTOS_DIR / "sheets" / "sheet-01.json").read_text(encoding="utf-8"))
        self.assertEqual(rows[0]["candidates"], [2])

    def test_sheets_leave_out_skipped_slugs(self):
        state = sheet_state(3)
        photos.download_candidates(state, lambda url: tiny_jpeg())
        photos.build_sheets(state, skip={"sp-01"})
        rows = json.loads((photos.PHOTOS_DIR / "sheets" / "sheet-01.json").read_text(encoding="utf-8"))
        self.assertEqual([r["slug"] for r in rows], ["sp-00", "sp-02"])

    def test_sheets_remove_stale_sheet_files(self):
        state = sheet_state(45)
        photos.download_candidates(state, lambda url: tiny_jpeg())
        photos.build_sheets(state)
        photos.build_sheets(state, skip={f"sp-{i:02d}" for i in range(45) if i >= 5})
        names = sorted(p.name for p in (photos.PHOTOS_DIR / "sheets").iterdir())
        self.assertEqual(names, ["sheet-01.jpg", "sheet-01.json"])

    def test_review_page_lists_every_pick(self):
        state = sheet_state(2)
        picks = {"sp-00": {"n": 2, "reason": "clear side view"}, "sp-01": {"n": None, "reason": "all blurry"}}
        path = photos.write_review(picks, state)
        html = path.read_text(encoding="utf-8")
        self.assertEqual(path.name, "review.html")
        self.assertIn("Bird 0", html)
        self.assertIn("Bird 1", html)
        self.assertIn("https://upload.wikimedia.org/sp-00/2.jpg", html)
        self.assertNotIn("https://upload.wikimedia.org/sp-00/1.jpg", html)
        self.assertIn("all blurry", html)
        self.assertIn("#fbfdf6", html)


def adopt_state():
    def cand(slug, n):
        return {"n": n, "url": f"https://upload.wikimedia.org/{slug}/{n}.jpg", "page": f"https://example.org/{slug}/{n}",
                "license": "cc0" if n == 1 else "public domain", "credit": f"someone {n}", "source": "inaturalist"}
    return {
        slug: {"slug": slug, "sci_name": f"Genus {slug}", "com_name": f"Bird {slug}", "taxon_ok": True,
               "inat_name": f"Genus {slug}", "candidates": [cand(slug, 1), cand(slug, 2)]}
        for slug in ("aa", "bb")
    }


class AdoptTests(unittest.TestCase):
    def test_adopt_takes_chosen_candidate(self):
        out = photos.adopt({"aa": {"n": 2, "reason": "clear"}}, adopt_state(), {})
        self.assertEqual(out["aa"], {
            "sci_name": "Genus aa", "com_name": "Bird aa",
            "url": "https://upload.wikimedia.org/aa/2.jpg", "page": "https://example.org/aa/2",
            "license": "public domain", "credit": "someone 2", "source": "inaturalist",
        })

    def test_adopt_null_pick_leaves_species_out(self):
        out = photos.adopt({"aa": {"n": None, "reason": "blurry"}}, adopt_state(), {})
        self.assertEqual(out, {})

    def test_adopt_keeps_existing_entries(self):
        existing = {"zz": {"url": "https://upload.wikimedia.org/zz.jpg"}}
        out = photos.adopt({"aa": {"n": 1, "reason": "ok"}}, adopt_state(), existing)
        self.assertIn("zz", out)
        self.assertIn("aa", out)
        self.assertNotIn("aa", existing)

    def test_adopt_refuses_url_off_allowed_hosts(self):
        for url in ("https://evil.example.com/x.jpg", "http://upload.wikimedia.org/x.jpg"):
            state = adopt_state()
            state["aa"]["candidates"][0]["url"] = url
            with self.assertRaisesRegex(ValueError, "aa"):
                photos.adopt({"aa": {"n": 1, "reason": "ok"}}, state, {})

    def test_adopt_refuses_non_free_licence(self):
        state = adopt_state()
        state["aa"]["candidates"][0]["license"] = "cc-by"
        with self.assertRaisesRegex(ValueError, "aa"):
            photos.adopt({"aa": {"n": 1, "reason": "ok"}}, state, {})

    def test_adopt_names_slug_and_n_when_pick_is_not_a_candidate(self):
        with self.assertRaisesRegex(ValueError, "aa.*9"):
            photos.adopt({"aa": {"n": 9, "reason": "ok"}}, adopt_state(), {})

    def test_render_ts_is_sorted_and_parseable(self):
        text = photos.render_ts({"b": {"url": "https://x/b.jpg"}, "a": {"url": 'https://x/a"q.jpg'}})
        self.assertIn("export const REFERENCE_PHOTOS: Record<string, string> = {", text)
        self.assertIn("tools/illustrate/photos.py adopt", text)
        self.assertLess(text.index('"a"'), text.index('"b"'))
        self.assertIn('"a": ' + json.dumps('https://x/a"q.jpg') + ",", text)
        self.assertTrue(text.endswith("};\n"))

    def test_render_ts_empty(self):
        self.assertIn("= {};", photos.render_ts({}))


class CheckLinksTests(unittest.TestCase):
    def test_check_links_reports_non_images(self):
        data = {
            "ok": {"url": "https://x/ok.jpg"},
            "html": {"url": "https://x/page.html"},
            "gone": {"url": "https://x/gone.jpg"},
        }
        replies = {"https://x/ok.jpg": (200, "image/jpeg"), "https://x/page.html": (200, "text/html"),
                   "https://x/gone.jpg": (404, "")}
        self.assertEqual(photos.check_links(data, lambda url: replies[url]), ["gone", "html"])

    def test_check_links_reports_errors(self):
        def head(url):
            raise OSError("down")
        self.assertEqual(photos.check_links({"a": {"url": "https://x/a.jpg"}}, head), ["a"])


if __name__ == "__main__":
    unittest.main()
