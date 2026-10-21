# Species illustrations

`illustrate.py` paints the web UI's species illustrations: a perched pose
(`<slug>.png`) and a flight pose (`<slug>-2.png`) for every species in
`scripts/birds.db`, mammals included (at rest / in motion). They're in the
style of Ohara Koson's kacho-e woodblock prints, painted by Gemini from our
own prompt and public-domain style plates.

Illustrations ship in `web-ui/public/illustrations-new/`, for the species
listed in `web-ui/src/lib/illustrations-new.ts`: `NEW_SLUGS` (a perched pose)
and `NEW_FLIGHT_SLUGS` (a flight pose too). `install` keeps both up to date.
A species without one shows the plain bird glyph.

**Flight poses are on hold to halve the cost:** `generate` paints the perched
pose only unless given `--pose flight`. A species without one shows its
perched pose in the large hero slots.

## Setup

```bash
pip install -r tools/illustrate/requirements.txt
setx GEMINI_API_KEY "..."    # once; open a new terminal afterwards
```

Gemini's free tier allows no image generation, so the key's project needs
billing on. A painting costs about $0.07: `gemini-3.1-flash-image` at 1K,
which is plenty for the 800px canvas. A finished bird usually takes 3–4
paintings. Flash Lite and 2.5 Flash were tried on a House Finch: cheaper,
but flatter and less accurate. The first `cutout` downloads the
background-removal model, about 1 GB.

## One bird at a time

Batches work the same way: give several slugs to each command, and review
them side by side before installing.

From `tools/illustrate`, with `<slug>` from `python illustrate.py species`
(for example `cardinalis-cardinalis`):

0. A species in `photos.json` already has its reference: `generate`
   downloads it once into `work/references/<slug>.jpg`. For any other,
   add `references/<slug>.jpg` yourself: public domain or CC0 only, a clear
   side view showing every field mark, cropped to the bird, logged in
   `references/SOURCES.md`. A file in `references/` wins over the list.
   `generate` refuses a species with neither: from memory alone the model
   drifts toward a generic bird.
1. `python illustrate.py generate <slug>` paints one perched
   attempt into `work/<slug>/perched-NN.png`. Look at it. To paint another,
   add `--again`.
2. `python illustrate.py pick <slug> perched NN` picks the one you like.
3. (Optional, on hold for now.) `python illustrate.py generate <slug> --pose
   flight` paints the flight pose from the picked perched one, so the pair
   matches. Then pick it with `pick <slug> flight NN`.
4. `python illustrate.py cutout <slug>` removes the paper. It also trims
   the twig to a stub under the feet, and centres the bird on an 800x800
   canvas. Colour stays as painted unless the species has a `"colour"` in
   `notes.json`. Try one with `cutout <slug> --colour 0.75 --force`. Results go to
   `work/cut/<slug>.png` and `<slug>-2.png`.
5. Check the cutouts. Stray bits can be erased by hand in the `work/cut`
   files. Later `cutout` runs leave an edited file alone unless given
   `--force`.
6. `python illustrate.py install <slug>` copies the cutouts into the web UI
   and lists the species in `illustrations-new.ts`, so the site shows it.

`verify` (a blind check by a second Gemini model) and `review` (an HTML
contact sheet of every attempt) help when running many species at once.
They're optional when going one bird at a time.

## Reference photos

`photos.py` builds `photos.json`: one public-domain or CC0 photo per
species, used two ways. The painting tool sends it to Gemini as the
anatomy reference, and the web UI shows it, square-cropped, wherever a
species has no painting yet. The photos are linked, not stored: the file
holds URLs (iNaturalist and Wikimedia Commons only) with the credit and
licence, and no images are committed. Candidates download into
`work/photos/`, which git ignores. Run from `tools/illustrate`:

1. `python photos.py rank` ranks the birds seen in the US and Canada.
2. `python photos.py candidates` takes the top 300 of that ranking
   (`--top`), plus everything in `scripts/birds.db` (`--db`), minus painted
   species, and fetches up to five CC0/PD photos per species. It resumes where it stopped, and records species with none.
   Eastern birds rank low, so the first run used `--top 500`.
3. `python photos.py sheets` makes contact sheets (8 species per sheet,
   `--per-sheet N` to change) in `work/photos/sheets/`, leaving out species already adopted or painted.
4. Pick. Sonnet subagents look at each sheet and choose one photo per
   species, or `"n": null` with a reason (`close:` for a close call). The
   rules: correct species; an adult in its most recognizable plumage
   (breeding male unless the species is usually known otherwise); the bird
   large, sharp and clearly the subject; a side or three-quarter view
   showing field marks; no splash, silhouette, in-hand, dead, captive or
   heavily cropped shots.
5. `python photos.py review` writes `work/photos/review.html`. The owner
   looks it over and approves it.
6. `python photos.py adopt` merges the picks into `photos.json` and
   regenerates `web-ui/src/lib/reference-photos.ts`. Commit both.
7. `python photos.py check` confirms every URL still serves an image. Links
   rot, so it's worth an occasional re-run.

To grow the list, run `candidates --top 800` (or another N), or
`candidates --db other.db` for another database, then `sheets` and on. Only
new species need picking. A painting always wins: a painted species never
shows its photo.

## What the pieces do

- **`prompt.md`** is the style, in plain sections: `base`, then the kind
  (`bird` / `mammal`), then the pose. Edit it to change the look.
- **`style/`** holds the style plates sent with every request. Only their
  technique is used. There are three Koson prints (CC0, Rijksmuseum); see
  `style/SOURCES.md`. `style/mammal/` would hold separate plates for
  mammals; without it, mammals get the bird plates.
- **`notes.json`** holds per-species extras:
  - `"note"`: field marks for species the model confuses. It's appended to
    the prompt.
  - `"kind": "mammal"`: for non-birds.
  - `"perch": "ground"`: for birds shown standing (waterbirds, turkey)
    rather than on a twig.
  - `"colour"`: saturation at cutout, for a species that comes back too
    vivid. 1 is as painted.
- **`references/<slug>.jpg`** or an entry in **`photos.json`** is required:
  a public-domain or CC0 photo of the species, sent with every painting of
  it for anatomy and markings. Sources for the files are logged in
  `references/SOURCES.md`.

## What we learned getting the style right

- **Text alone gave generic, cartoonish birds.** The Koson style plates are
  what made the look.
- **Colour wording is too coarse to tune.** One painting varies more than a
  small change in the prompt. So saturation is adjusted at cutout time, and
  per species: one value didn't suit every bird (the Blue Jay wanted 0.75,
  which made the Cardinal dark).
- **Feet need something to grip.** Without a twig they float or splay. The
  model also paints long, forked branches however it's asked, so cutout
  keeps only the twig within `STUB_REACH` of the feet.
- **The AI cutout treats the twig as background.** So cutout adds back what
  is printed and touching the feet, and drops loose specks.
- **Everything ships on the same square canvas** (`CANVAS`), scaled toward
  the same filled area, so cards line up.

Every attempt and its verdict stays in `work/`, which git ignores. Models
default to `gemini-3.1-flash-image` (painting) and `gemini-3.8-flash`
(checking). Override them with `--model`, or with `ILLUSTRATE_PAINT_MODEL`
/ `ILLUSTRATE_VERIFY_MODEL`.
