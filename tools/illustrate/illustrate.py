#!/usr/bin/env python3
"""Generates the web UI's species illustrations.

One picture per species per pose -- perched (<slug>.png, used everywhere)
and flight (<slug>-2.png, the large hero slots) -- for every species in a
birds.db. The loop:

    generate   paint each pose with Gemini, on plain paper
    verify     show each attempt to Gemini blind and check what it sees
    generate   again: only the poses whose every attempt failed are redone
    review     write a contact sheet of every attempt, to pick by eye
    pick       (optional) override the automatic pick
    cutout     remove the paper and crop to the animal
    install    copy into web-ui/public/illustrations-new and list the species

The style lives in prompt.md and the style/ folder; per-species field marks
in notes.json. Every attempt is kept under work/<slug>/, so nothing is ever
painted over.

Needs GEMINI_API_KEY for generate and verify. Usage:
    python illustrate.py species
    python illustrate.py generate cardinalis-cardinalis --dry-run
    python illustrate.py generate                  # every species
    python illustrate.py verify
    python illustrate.py review
    python illustrate.py pick cardinalis-cardinalis flight 2
    python illustrate.py cutout
    python illustrate.py install
"""

import argparse
import base64
import html
import json
import os
import re
import shutil
import sqlite3
import sys
import time
from contextlib import closing
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]

DEFAULT_DB = REPO_ROOT / 'scripts' / 'birds.db'
PROMPT_PATH = HERE / 'prompt.md'
NOTES_PATH = HERE / 'notes.json'
STYLE_DIR = HERE / 'style'
REFERENCES_DIR = HERE / 'references'
WORK_DIR = HERE / 'work'
CUT_DIR = WORK_DIR / 'cut'
PICKS_PATH = WORK_DIR / 'picks.json'
# The new set ships beside the bundled one; the sidebar's Old/New switch
# (web-ui/src/lib/illustration-set.ts) shows it for the species in NEW_SLUGS.
PUBLIC_DIR = REPO_ROOT / 'web-ui' / 'public' / 'illustrations-new'
SLUGS_TS = REPO_ROOT / 'web-ui' / 'src' / 'lib' / 'illustrations-new.ts'
SLUGS_NAME = 'NEW_SLUGS'
FLIGHT_SLUGS_NAME = 'NEW_FLIGHT_SLUGS'

PAINT_MODEL = os.environ.get('ILLUSTRATE_PAINT_MODEL', 'gemini-3.1-flash-image')
VERIFY_MODEL = os.environ.get('ILLUSTRATE_VERIFY_MODEL', 'gemini-3.8-flash')

POSES = ('perched', 'flight')
# The web UI's filename for each pose: see web-ui/src/lib/illustrations.ts.
POSE_SUFFIX = {'perched': '', 'flight': '-2'}
IMAGE_TYPES = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'}
MAX_STYLE_PLATES = 3
# Saturation applied at cutout, 1 = as painted. A species that comes back too
# vivid gets its own "colour" in notes.json (the Blue Jay looked best at 0.75;
# the same toning left the Northern Cardinal dark and brick-red).
COLOUR = 1.0


# --------------------------------------------------------------------------
# Species
# --------------------------------------------------------------------------

def slugify(sci_name: str) -> str:
    """Matches slugify() in web-ui/src/lib/illustrations.ts."""
    return re.sub(r'\s+', '-', sci_name.strip().lower())


def load_notes() -> dict:
    with open(NOTES_PATH, encoding='utf-8') as f:
        return json.load(f)


def load_species(db_path: Path) -> list[dict]:
    """Every species the station has heard, commonest first."""
    notes = load_notes()
    with closing(sqlite3.connect(db_path)) as con:
        rows = con.execute(
            'SELECT Sci_Name, Com_Name, COUNT(*) FROM detections '
            'GROUP BY Sci_Name ORDER BY COUNT(*) DESC'
        ).fetchall()
    species = []
    for sci, com, count in rows:
        slug = slugify(sci)
        entry = notes.get(slug, {})
        species.append({
            'slug': slug,
            'sci_name': sci,
            'com_name': com,
            'count': count,
            'kind': entry.get('kind', 'bird'),
            # 'ground' for birds shown standing rather than on a twig.
            'perch': entry.get('perch', 'twig'),
            'note': entry.get('note', ''),
            'colour': entry.get('colour'),
        })
    return species


def select(species: list[dict], slugs: list[str]) -> list[dict]:
    if not slugs:
        return species
    by_slug = {s['slug']: s for s in species}
    unknown = [slug for slug in slugs if slug not in by_slug]
    if unknown:
        sys.exit(f'Not in the database: {", ".join(unknown)} (see `illustrate.py species`)')
    return [by_slug[slug] for slug in slugs]


# --------------------------------------------------------------------------
# Prompt
# --------------------------------------------------------------------------

def parse_sections(text: str) -> dict[str, str]:
    """The '## name' sections of prompt.md, by name."""
    sections = {}
    name = None
    lines: list[str] = []
    for line in text.splitlines():
        if line.startswith('## '):
            if name:
                sections[name] = '\n'.join(lines).strip()
            name, lines = line[3:].strip().lower(), []
        elif name:
            lines.append(line)
    if name:
        sections[name] = '\n'.join(lines).strip()
    return sections


def build_prompt(sp: dict, pose: str, sections: dict[str, str]) -> str:
    pose_section = f"{sp['kind']} {pose}"
    if pose == 'perched' and sp.get('perch') == 'ground' and f'{pose_section} ground' in sections:
        pose_section += ' ground'
    parts = [sections['base'], sections[sp['kind']], sections[pose_section]]
    if sp['note']:
        parts.append(f"Field marks for {sp['com_name']}: {sp['note']}")
    return '\n\n'.join(parts).format(com_name=sp['com_name'], sci_name=sp['sci_name'])


def _images_in(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_TYPES)


def style_plates(kind: str = 'bird') -> list[Path]:
    """style/ for birds; style/<kind>/ for anything else, if it has plates."""
    plates = (kind != 'bird' and _images_in(STYLE_DIR / kind)) or _images_in(STYLE_DIR)
    return plates[:MAX_STYLE_PLATES]


def anatomy_reference(slug: str) -> Path | None:
    for ext in IMAGE_TYPES:
        path = REFERENCES_DIR / f'{slug}{ext}'
        if path.exists():
            return path
    return None


def attachments(sp: dict, pose: str, picks: dict) -> list[tuple[str, Path]]:
    """The images sent with a request, each with the line that explains it."""
    images = [
        (f'Style plate {n}: follow its painting technique only. Ignore its subject, '
         'plants, scenery and lettering.', path)
        for n, path in enumerate(style_plates(sp['kind']), 1)
    ]
    reference = anatomy_reference(sp['slug'])
    if reference:
        images.append((
            f"Reference photograph of a {sp['com_name']}: match its anatomy, markings and "
            'colors. Ignore its background, lighting and setting.', reference,
        ))
    # The flight pose is painted from the perched one, so the pair reads as
    # the same animal: the pick, or else the newest attempt not yet failed.
    if pose == 'flight':
        perched = current_pick(sp['slug'], 'perched', picks) or next(
            (a for a in reversed(attempts(sp['slug'], 'perched'))
             if (read_verdict(a) or {'passed': True})['passed']),
            None,
        )
        if perched:
            images.append((
                'The perched painting of this same animal: paint the same individual, with the '
                'same colors, markings and painting style, in the new pose.', perched,
            ))
    return images


# --------------------------------------------------------------------------
# Attempts, verdicts and picks
# --------------------------------------------------------------------------

def attempts(slug: str, pose: str) -> list[Path]:
    folder = WORK_DIR / slug
    if not folder.is_dir():
        return []
    return sorted(folder.glob(f'{pose}-[0-9][0-9].png'))


def verdict_path(attempt: Path) -> Path:
    return attempt.with_suffix('.verify.json')


def read_verdict(attempt: Path) -> dict | None:
    path = verdict_path(attempt)
    if not path.exists():
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load_picks() -> dict:
    if not PICKS_PATH.exists():
        return {}
    with open(PICKS_PATH, encoding='utf-8') as f:
        return json.load(f)


def save_picks(picks: dict) -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    with open(PICKS_PATH, 'w', encoding='utf-8') as f:
        json.dump(picks, f, indent=2, sort_keys=True)


def current_pick(slug: str, pose: str, picks: dict) -> Path | None:
    """A hand pick if there is one, otherwise the newest attempt that passed."""
    chosen = picks.get(slug, {}).get(pose)
    if chosen:
        path = WORK_DIR / slug / chosen
        if path.exists():
            return path
    passed = [a for a in attempts(slug, pose) if (read_verdict(a) or {}).get('passed')]
    return passed[-1] if passed else None


def needs_painting(slug: str, pose: str) -> bool:
    """True until the pose has an attempt that hasn't failed verification."""
    for attempt in attempts(slug, pose):
        verdict = read_verdict(attempt)
        if verdict is None or verdict['passed']:
            return False
    return True


def next_attempt_path(slug: str, pose: str) -> Path:
    return WORK_DIR / slug / f'{pose}-{len(attempts(slug, pose)) + 1:02d}.png'


# --------------------------------------------------------------------------
# Gemini
# --------------------------------------------------------------------------

def gemini_client():
    try:
        from google import genai
    except ImportError:
        sys.exit('Missing google-genai: pip install -r tools/illustrate/requirements.txt')
    if not os.environ.get('GEMINI_API_KEY'):
        sys.exit('Set GEMINI_API_KEY first.')
    return genai.Client()


def image_input(path: Path) -> dict:
    return {
        'type': 'image',
        'data': base64.b64encode(path.read_bytes()).decode('ascii'),
        'mime_type': IMAGE_TYPES[path.suffix.lower()],
    }


def with_retries(call, what: str):
    for attempt in range(3):
        try:
            return call()
        except Exception as error:  # the API raises a range of types
            # A rejected request (4xx other than rate limiting) fails the same way again.
            status = getattr(error, 'status_code', None) or getattr(error, 'code', None)
            if attempt == 2 or (isinstance(status, int) and 400 <= status < 500 and status != 429):
                raise
            wait = 10 * (attempt + 1)
            print(f'  {what} failed ({error}); retrying in {wait}s')
            time.sleep(wait)


def paint(client, prompt: str, images: list[tuple[str, Path]], model: str, resolution: str = '1K') -> bytes:
    request = [{'type': 'text', 'text': prompt}]
    for label, path in images:
        request += [{'type': 'text', 'text': label}, image_input(path)]
    interaction = with_retries(lambda: client.interactions.create(
        model=model,
        input=request,
        response_format={
            # JPEG is the only format offered; it's kept as PNG from here on.
            'type': 'image', 'mime_type': 'image/jpeg', 'aspect_ratio': '1:1', 'image_size': resolution,
        },
    ), 'painting')
    if not getattr(interaction, 'output_image', None):
        raise RuntimeError(f'No image came back: {getattr(interaction, "output_text", "")!r}')
    return _as_png(base64.b64decode(interaction.output_image.data))


def _as_png(image: bytes) -> bytes:
    import io

    from PIL import Image

    with Image.open(io.BytesIO(image)) as decoded:
        out = io.BytesIO()
        decoded.convert('RGB').save(out, format='PNG')
    return out.getvalue()


VERIFY_SCHEMA = {
    'type': 'object',
    'properties': {
        'common_name': {'type': 'string'},
        'scientific_name': {'type': 'string'},
        'kind': {'type': 'string', 'enum': ['bird', 'mammal', 'other']},
        'heads': {'type': 'integer'},
        'wings': {'type': 'integer'},
        'legs_visible': {'type': 'integer'},
        'tails': {'type': 'integer'},
        'anything_besides_the_animal': {'type': 'boolean'},
        'text_or_watermark': {'type': 'boolean'},
        'cut_off_by_the_edge': {'type': 'boolean'},
        'problems': {'type': 'string'},
    },
    'required': [
        'common_name', 'scientific_name', 'kind', 'heads', 'wings', 'legs_visible', 'tails',
        'anything_besides_the_animal', 'text_or_watermark', 'cut_off_by_the_edge', 'problems',
    ],
}

VERIFY_PROMPT = """You are checking a natural-history illustration before it is published.
Identify the species shown, as precisely as its markings allow. Then count, carefully and
literally, what is actually painted: heads, wings (separate wing shapes, not feathers),
legs you can see, tails. Say whether anything besides the animal is painted (plants, ground,
scenery, a shadow, a frame -- a single short bare twig it perches on does not
count), whether there is any text, signature
or watermark, and whether any part of the animal is cut off by the edge of the image.
List any anatomical problems -- extra or missing limbs, fused or floating parts, a
malformed beak, eyes or feet -- in `problems`, or leave it empty."""


def _same_name(a: str, b: str) -> bool:
    def norm(s):
        return re.sub(r'[^a-z]', '', s.lower())
    return norm(a) == norm(b)


def judge(sp: dict, pose: str, seen: dict) -> list[str]:
    """Why an attempt fails, from what the blind check saw; empty if it passes."""
    reasons = []
    if not (_same_name(seen['scientific_name'], sp['sci_name'])
            or _same_name(seen['common_name'], sp['com_name'])):
        reasons.append(f"looks like {seen['common_name']} ({seen['scientific_name']})")
    if seen['heads'] != 1:
        reasons.append(f"{seen['heads']} heads")
    if seen['tails'] > 1:
        reasons.append(f"{seen['tails']} tails")
    if sp['kind'] == 'bird':
        if seen['wings'] not in ((1, 2) if pose == 'perched' else (2,)):
            reasons.append(f"{seen['wings']} wings")
        if seen['legs_visible'] > 2:
            reasons.append(f"{seen['legs_visible']} legs")
    else:
        if seen['wings']:
            reasons.append(f"{seen['wings']} wings")
        if seen['legs_visible'] > 4:
            reasons.append(f"{seen['legs_visible']} legs")
    if seen['anything_besides_the_animal']:
        reasons.append('something else is painted')
    if seen['text_or_watermark']:
        reasons.append('text or watermark')
    if seen['cut_off_by_the_edge']:
        reasons.append('cut off by the edge')
    if seen['problems'].strip():
        reasons.append(seen['problems'].strip())
    return reasons


def check(client, attempt: Path, model: str) -> dict:
    interaction = with_retries(lambda: client.interactions.create(
        model=model,
        input=[{'type': 'text', 'text': VERIFY_PROMPT}, image_input(attempt)],
        response_format={'type': 'text', 'mime_type': 'application/json', 'schema': VERIFY_SCHEMA},
    ), 'verifying')
    return json.loads(interaction.output_text)


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------

def cmd_species(args):
    picks = load_picks()
    for sp in load_species(args.db):
        status = []
        for pose in POSES:
            tries = attempts(sp['slug'], pose)
            picked = current_pick(sp['slug'], pose, picks)
            status.append(f"{pose} {len(tries)} tried{', picked' if picked else ''}")
        kind = '' if sp['kind'] == 'bird' else f" [{sp['kind']}]"
        print(f"{sp['count']:6}  {sp['slug']:32} {sp['com_name']}{kind}  ({'; '.join(status)})")


def cmd_generate(args):
    sections = parse_sections(PROMPT_PATH.read_text(encoding='utf-8'))
    picks = load_picks()
    plates = style_plates()
    if not plates:
        print('Note: style/ is empty, so the style comes from prompt.md alone.')
    todo = [
        (sp, pose)
        for sp in select(load_species(args.db), args.slugs)
        for pose in POSES if pose in args.pose
        if args.again or needs_painting(sp['slug'], pose)
    ]
    if not todo:
        print('Nothing to paint: every pose has an attempt that is unverified or passed. '
              'Use --again to paint more.')
        return
    # Without a photo the model paints the species from memory and drifts
    # toward a generic bird, so every species needs one first.
    missing = sorted({sp['slug'] for sp, _ in todo if not anatomy_reference(sp['slug'])})
    if missing and not args.no_reference:
        sys.exit(
            f'No reference photo for: {", ".join(missing)}. Add references/<slug>.jpg '
            '(public domain or CC0, logged in references/SOURCES.md) first.'
        )
    print(f'{len(todo)} paintings to make with {args.model}.')
    if args.dry_run:
        for sp, pose in todo[:3]:
            print(f"\n--- {sp['slug']} {pose} ---\n{build_prompt(sp, pose, sections)}")
            for label, path in attachments(sp, pose, picks):
                print(f'[image {path.name}] {label}')
        if len(todo) > 3:
            print(f'\n... and {len(todo) - 3} more.')
        return
    client = gemini_client()
    for n, (sp, pose) in enumerate(todo, 1):
        out = next_attempt_path(sp['slug'], pose)
        print(f"[{n}/{len(todo)}] {sp['com_name']}, {pose} -> {out.relative_to(HERE)}")
        try:
            image = paint(
                client, build_prompt(sp, pose, sections), attachments(sp, pose, picks),
                args.model, args.resolution,
            )
        except Exception as error:
            print(f'  skipped: {error}')
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(image)


def cmd_verify(args):
    species = select(load_species(args.db), args.slugs)
    todo = [
        (sp, pose, attempt)
        for sp in species for pose in POSES for attempt in attempts(sp['slug'], pose)
        if args.again or read_verdict(attempt) is None
    ]
    if not todo:
        print('Nothing new to verify.')
        return
    client = gemini_client()
    failed = 0
    for n, (sp, pose, attempt) in enumerate(todo, 1):
        try:
            seen = check(client, attempt, args.model)
        except Exception as error:
            print(f'[{n}/{len(todo)}] {attempt.relative_to(HERE)}: skipped: {error}')
            continue
        reasons = judge(sp, pose, seen)
        verdict = {'passed': not reasons, 'reasons': reasons, 'seen': seen, 'model': args.model}
        verdict_path(attempt).write_text(json.dumps(verdict, indent=2), encoding='utf-8')
        failed += bool(reasons)
        print(f"[{n}/{len(todo)}] {attempt.relative_to(HERE)}: "
              f"{'FAIL - ' + '; '.join(reasons) if reasons else 'ok'}")
    print(f'{len(todo) - failed} passed, {failed} failed. Run generate again to redo the failures.')


def cmd_pick(args):
    attempt = WORK_DIR / args.slug / f'{args.pose}-{args.number:02d}.png'
    if not attempt.exists():
        sys.exit(f'No such attempt: {attempt.relative_to(HERE)}')
    picks = load_picks()
    picks.setdefault(args.slug, {})[args.pose] = attempt.name
    save_picks(picks)
    print(f'Picked {attempt.relative_to(HERE)}.')


def cmd_review(args):
    picks = load_picks()
    blocks = []
    for sp in select(load_species(args.db), args.slugs):
        rows = []
        for pose in POSES:
            picked = current_pick(sp['slug'], pose, picks)
            cells = []
            for attempt in attempts(sp['slug'], pose):
                verdict = read_verdict(attempt)
                if verdict is None:
                    badge, why = 'unverified', ''
                elif verdict['passed']:
                    badge, why = 'ok', ''
                else:
                    badge, why = 'fail', '; '.join(verdict['reasons'])
                number = int(attempt.stem.split('-')[1])
                cells.append(
                    f'<figure class="{badge}{" picked" if attempt == picked else ""}">'
                    f'<img src="{sp["slug"]}/{attempt.name}" loading="lazy" alt="">'
                    f'<figcaption><b>{pose} {number}</b> {badge}'
                    f'{" &middot; picked" if attempt == picked else ""}<br>{html.escape(why)}'
                    f'<code>pick {sp["slug"]} {pose} {number}</code></figcaption></figure>'
                )
            rows.append(f'<div class="row">{"".join(cells) or "<p>No attempts yet.</p>"}</div>')
        blocks.append(
            f'<section><h2>{html.escape(sp["com_name"])} <small>{html.escape(sp["sci_name"])}'
            f' &middot; {sp["count"]} detections</small></h2>{"".join(rows)}</section>'
        )
    page = REVIEW_PAGE.replace('{body}', ''.join(blocks))
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    out = WORK_DIR / 'review.html'
    out.write_text(page, encoding='utf-8')
    print(f'Wrote {out}')


REVIEW_PAGE = """<!doctype html><meta charset="utf-8"><title>Illustration review</title>
<style>
body{font:14px system-ui,sans-serif;margin:24px;background:#f4f1ea;color:#222}
section{margin-bottom:32px}h2{font-size:18px;margin:0 0 8px}small{color:#777;font-weight:normal}
.row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px}
figure{margin:0;width:220px;background:#fff;border:3px solid #ddd;border-radius:6px;padding:6px}
figure.ok{border-color:#9c9}figure.fail{border-color:#e99}figure.picked{border-color:#36c}
img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff}
figcaption{font-size:12px;line-height:1.4}code{display:block;color:#666;margin-top:4px}
</style><h1>Illustration review</h1><p>Blue = picked, green = passed, red = failed.
Change a pick with <code>python illustrate.py pick &lt;slug&gt; &lt;pose&gt; &lt;n&gt;</code>.</p>{body}"""


# How far the perch may reach from the feet, as a fraction of the painting's
# width: the model tends to paint a long, forked branch, and this trims it to
# a short stub under the feet.
STUB_REACH = 0.06


def keep_what_touches_the_animal(painted, cut, pose: str, low: float = 14, high: float = 40):
    """The AI cutout keeps only the animal and drops the twig it grips. This
    adds back what is printed on the paper and touches the animal's feet -- the
    twig, trimmed to a stub -- and drops everything else: loose specks, stains,
    and the rest of a long branch."""
    import numpy as np
    from PIL import Image
    from scipy import ndimage

    rgb = np.asarray(painted.convert('RGB'), dtype=np.float32)
    animal_alpha = np.asarray(cut.getchannel('A'), dtype=np.float32) / 255
    # The animal is the AI cutout's main body plus any sizeable piece of it
    # (a wingtip the outline cut off); small loose bits it kept are dropped.
    labels, count = ndimage.label(animal_alpha > 0.5)
    if count:
        sizes = ndimage.sum(np.ones_like(labels), labels, range(1, count + 1))
        big = 1 + np.nonzero(sizes >= 0.02 * sizes.max())[0]
        animal_alpha = animal_alpha * ndimage.binary_dilation(np.isin(labels, big), iterations=3)
    animal = animal_alpha > 0.5
    edge = 8
    border = np.concatenate([
        rgb[:edge].reshape(-1, 3), rgb[-edge:].reshape(-1, 3),
        rgb[:, :edge].reshape(-1, 3), rgb[:, -edge:].reshape(-1, 3),
    ])
    paper = np.median(border, axis=0)
    # How far each pixel is from bare paper, as a soft 0-1 coverage.
    printed = np.clip((np.linalg.norm(rgb - paper, axis=2) - low) / (high - low), 0, 1)

    alpha = animal_alpha
    if pose == 'perched' and animal.any():
        twig = (printed > 0.5) & ~animal
        rows = np.nonzero(animal)[0]
        lower = np.arange(animal.shape[0])[:, None] > rows.min() + 0.6 * (rows.max() - rows.min())
        feet = ndimage.binary_dilation(animal, iterations=6) & twig & lower
        if feet.any():
            reach = ndimage.distance_transform_edt(~feet) < STUB_REACH * animal.shape[1]
            labels, _ = ndimage.label(twig & reach)
            stub = np.isin(labels, np.unique(labels[feet]))
            stub = ndimage.gaussian_filter(ndimage.binary_dilation(stub, iterations=2).astype(np.float32), 1.5)
            alpha = np.maximum(alpha, printed * stub)

    # Drop anything not joined to the animal itself: specks and stray marks.
    labels, _ = ndimage.label(alpha > 0.5)
    main = np.isin(labels, np.unique(labels[animal]))
    alpha = alpha * ndimage.binary_dilation(main, iterations=3)
    out = painted.convert('RGBA')
    out.putalpha(Image.fromarray((alpha * 255).round().astype(np.uint8)))
    return out


# Every illustration ships on the same square canvas so the web UI's slots
# line up. Animals are scaled toward the same filled area, so a compact finch
# doesn't dwarf a slender nuthatch -- but never below MIN_FIT of the size
# that would just fit, so slender ones still read.
CANVAS = 800
PAD = 0.04
TARGET_COVERAGE = 0.30
MIN_FIT = 0.75


def place_on_canvas(image, pose: str, side: int = CANVAS):
    """The cutout on a transparent side x side square: perched animals stand
    on a shared baseline, flying ones are centered."""
    from PIL import Image

    alpha = image.getchannel('A')
    box = alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
    if box is None:
        raise ValueError('nothing left after removing the background')
    animal = image.crop(box)
    inner = side * (1 - 2 * PAD)
    fit = inner / max(animal.size)
    filled = sum(animal.getchannel('A').point(lambda a: 1 if a > 128 else 0).histogram()[1:])
    even = (TARGET_COVERAGE * side * side / max(filled, 1)) ** 0.5
    scale = max(min(fit, even), fit * MIN_FIT)
    size = (max(1, round(animal.width * scale)), max(1, round(animal.height * scale)))
    animal = animal.resize(size, Image.LANCZOS)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    x = (side - animal.width) // 2
    margin = round(side * PAD)
    y = side - margin - animal.height if pose == 'perched' else (side - animal.height) // 2
    canvas.paste(animal, (x, y), animal)
    return canvas


def cmd_cutout(args):
    try:
        from PIL import Image, ImageEnhance
        from rembg import new_session, remove
    except ImportError:
        sys.exit('Missing rembg/Pillow: pip install -r tools/illustrate/requirements.txt')
    picks = load_picks()
    session = None
    CUT_DIR.mkdir(parents=True, exist_ok=True)
    for sp in select(load_species(args.db), args.slugs):
        for pose in POSES:
            source = current_pick(sp['slug'], pose, picks)
            if source is None:
                continue
            out = CUT_DIR / f"{sp['slug']}{POSE_SUFFIX[pose]}.png"
            if out.exists() and out.stat().st_mtime > source.stat().st_mtime and not args.force:
                continue
            if session is None:
                session = new_session(args.model)
            print(f'{source.relative_to(HERE)} -> {out.relative_to(HERE)}')
            with Image.open(source) as image:
                colour = args.colour if args.colour is not None else sp['colour'] or COLOUR
                toned = ImageEnhance.Color(image.convert('RGB')).enhance(colour)
                cut = keep_what_touches_the_animal(toned, remove(toned, session=session), pose)
            place_on_canvas(cut, pose, side=args.size).save(out, optimize=True)


def rewrite_slugs(source: str, slugs: list[str], name: str = SLUGS_NAME) -> str:
    """The TypeScript `source` with `const <name> = new Set([...]);` listing
    `slugs`: on one line while it fits, one per line after that, as Biome
    would format it."""
    quoted = [f'"{slug}"' for slug in sorted(slugs)]

    def listed(match):
        start = f'{match.group(1) or ""}const {name} = new Set(['
        one_line = f'{start}{", ".join(quoted)}]);'
        if len(one_line) <= 80:
            return one_line
        return start + '\n' + ''.join(f'\t{q},\n' for q in quoted) + ']);'

    new, count = re.subn(
        rf'^(export )?const {name} = new Set\(\[.*?\]\);', listed, source,
        flags=re.DOTALL | re.MULTILINE,
    )
    if count != 1:
        raise ValueError(f'{name} not found')
    return new


def installed_slugs(folder: Path) -> tuple[list[str], list[str]]:
    """Species with a perched pose in `folder`, and those that also have a
    flight pose; the web UI shows the perched one in place of a missing flight."""
    names = {p.stem for p in folder.glob('*.png')}
    perched = sorted(n for n in names if not n.endswith('-2'))
    return perched, [n for n in perched if f'{n}-2' in names]


def cmd_install(args):
    wanted = {sp['slug'] for sp in select(load_species(args.db), args.slugs)}
    copied = 0
    for path in sorted(CUT_DIR.glob('*.png')) if CUT_DIR.is_dir() else []:
        if path.stem.removesuffix('-2') in wanted:
            PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, PUBLIC_DIR / path.name)
            copied += 1
    perched, flight = installed_slugs(PUBLIC_DIR)
    source = SLUGS_TS.read_text(encoding='utf-8')
    source = rewrite_slugs(rewrite_slugs(source, perched), flight, FLIGHT_SLUGS_NAME)
    SLUGS_TS.write_text(source, encoding='utf-8', newline='\n')
    print(f'Copied {copied} files. {len(perched)} species in {SLUGS_TS.name}, {len(flight)} with a flight pose.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB, help='birds.db to take species from')
    commands = parser.add_subparsers(dest='command', required=True)

    commands.add_parser('species', help='list species and their progress').set_defaults(run=cmd_species)

    generate = commands.add_parser('generate', help='paint poses that need it')
    generate.add_argument('slugs', nargs='*')
    generate.add_argument(
        '--pose', choices=POSES, action='append',
        help='pose to paint (repeatable; default: perched only, flight poses are opt-in)',
    )
    generate.add_argument('--again', action='store_true', help='paint another attempt even if one is fine')
    generate.add_argument('--model', default=PAINT_MODEL)
    generate.add_argument('--resolution', default='1K', choices=['1K', '2K'], help='size of the painting (1K is plenty for the 800px canvas)')
    generate.add_argument('--dry-run', action='store_true', help='show the prompts, call nothing')
    generate.add_argument(
        '--no-reference', action='store_true', help='paint even without a reference photo',
    )
    generate.set_defaults(run=cmd_generate)

    verify = commands.add_parser('verify', help='blind-check unverified attempts')
    verify.add_argument('slugs', nargs='*')
    verify.add_argument('--again', action='store_true', help='re-check attempts that have a verdict')
    verify.add_argument('--model', default=VERIFY_MODEL)
    verify.set_defaults(run=cmd_verify)

    review = commands.add_parser('review', help='write work/review.html')
    review.add_argument('slugs', nargs='*')
    review.set_defaults(run=cmd_review)

    pick = commands.add_parser('pick', help='choose an attempt by hand')
    pick.add_argument('slug')
    pick.add_argument('pose', choices=POSES)
    pick.add_argument('number', type=int)
    pick.set_defaults(run=cmd_pick)

    cutout = commands.add_parser('cutout', help='remove the paper from picked attempts')
    cutout.add_argument('slugs', nargs='*')
    cutout.add_argument('--model', default='birefnet-general', help='rembg model')
    cutout.add_argument('--size', type=int, default=CANVAS, help='square canvas, in px')
    cutout.add_argument(
        '--colour', type=float, help='saturation, 1 = as painted (default: the species\' notes, else COLOUR)',
    )
    cutout.add_argument('--force', action='store_true')
    cutout.set_defaults(run=cmd_cutout)

    install = commands.add_parser('install', help='copy cutouts into the web UI')
    install.add_argument('slugs', nargs='*')
    install.set_defaults(run=cmd_install)

    args = parser.parse_args(argv)
    if args.command == 'generate':
        args.pose = args.pose or ['perched']
    args.run(args)


if __name__ == '__main__':
    main()
