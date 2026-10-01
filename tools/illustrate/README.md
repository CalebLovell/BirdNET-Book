# Species illustrations

`illustrate.py` paints the web UI's species illustrations: a perched pose
(`<slug>.png`) and a flight pose (`<slug>-2.png`) for every species in
`scripts/birds.db`, mammals included (at rest / in motion). They're in the
style of Ohara Koson's kacho-e woodblock prints, painted by Gemini from our
own prompt and public-domain style plates.

New illustrations ship in `web-ui/public/illustrations-new/`, next to the
bundled set. The sidebar's **Illustrations: Old / New** switch shows them, for
the species listed in `NEW_SLUGS` (`web-ui/src/lib/illustration-set.ts`).
`install` keeps that list up to date.

## Setup

```bash
pip install -r tools/illustrate/requirements.txt
setx GEMINI_API_KEY "..."    # once; open a new terminal afterwards
```

Gemini's free tier allows no image generation, so the key's project needs
billing on. Each painting costs a few cents. The first `cutout` downloads the
background-removal model, about 1 GB.

## One bird at a time

From `tools/illustrate`, with `<slug>` from `python illustrate.py species`
(for example `cardinalis-cardinalis`):

1. `python illustrate.py generate <slug> --pose perched` paints one perched
   attempt into `work/<slug>/perched-NN.png`. Look at it. To paint another,
   add `--again`.
2. `python illustrate.py pick <slug> perched NN` picks the one you like.
3. `python illustrate.py generate <slug> --pose flight` paints the flight
   pose from the picked perched one, so the pair matches. Then pick it with
   `pick <slug> flight NN`.
4. `python illustrate.py cutout <slug>` removes the paper. It also trims
   the twig to a stub under the feet, and centres the bird on an 800x800
   canvas. Colour stays as painted unless the species has a `"colour"` in
   `notes.json`. Try one with `cutout <slug> --colour 0.75 --force`. Results go to
   `work/cut/<slug>.png` and `<slug>-2.png`.
5. Check the cutouts. Stray bits can be erased by hand in the `work/cut`
   files. Later `cutout` runs leave an edited file alone unless given
   `--force`.
6. `python illustrate.py install <slug>` copies the pair into the web UI and
   adds the species to `NEW_SLUGS`. Then flip the sidebar switch to New to
   see it on the site.

`verify` (a blind check by a second Gemini model) and `review` (an HTML
contact sheet of every attempt) help when running many species at once.
They're optional when going one bird at a time.

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
- **`references/<slug>.jpg`** is optional: a photo of one species for
  anatomy. Only use photos you're free to use.

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
