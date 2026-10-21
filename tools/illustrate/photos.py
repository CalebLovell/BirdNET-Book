#!/usr/bin/env python3
"""Collects CC0 reference photos for common North American birds.

    rank    score every species BirdNET knows by how widely and how often
            its location model expects it across the US and Canada, and
            write the result to ranking.csv

    candidates
            gather up to five CC0 or public-domain photos per species from
            iNaturalist, topped up from Wikimedia Commons, into
            work/photos/candidates.json (resumable)

Usage:
    python photos.py rank [--out ranking.csv]
    python photos.py candidates [--top 300] [--db PATH]
"""

import argparse
import csv
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable, Iterable

import numpy as np

from illustrate import DEFAULT_DB, PUBLIC_DIR, WORK_DIR, installed_slugs, load_species, slugify

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
MODEL_DIR = REPO_ROOT / 'model'
MDATA_MODEL = MODEL_DIR / 'BirdNET_GLOBAL_6K_V2.4_MData_Model_V2_FP16.tflite'
LABELS = MODEL_DIR / 'BirdNET_GLOBAL_6K_V2.4_Model_FP16_Labels.txt'
COMMON_NAMES = MODEL_DIR / 'l18n' / 'labels_en.json'
RANKING_CSV = HERE / 'ranking.csv'
PHOTOS_DIR = WORK_DIR / 'photos'
CANDIDATES_JSON = PHOTOS_DIR / 'candidates.json'
INAT_API = 'https://api.inaturalist.org/v1'
COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
USER_AGENT = 'BirdNET-Pi-Live photos tool'
REQUEST_GAP = 1.0
BACKOFF = (5, 15, 45)
WANT = 5
WIKIMEDIA_BELOW = 3
WEEKS = range(1, 49)
THRESHOLD = 0.03


def _frange(start: float, stop: float, step: float) -> list[float]:
    count = int(round((stop - start) / step)) + 1
    return [start + i * step for i in range(count)]


# Contiguous US and southern Canada, then Alaska and Yukon.
GRID: list[tuple[float, float]] = (
    [(lat, lon) for lat in _frange(25, 60, 2.5) for lon in _frange(-125, -65, 2.5)]
    + [(lat, lon) for lat in _frange(60, 70, 5) for lon in _frange(-165, -130, 5)]
)


def score_species(probs: Iterable[np.ndarray], labels: list[str],
                  threshold: float = THRESHOLD) -> list[tuple[str, str, float]]:
    """Mean probability per label, counting values below threshold as zero.

    Returns (sci_name, com_name, score) for every label scoring above zero,
    highest first.
    """
    total = np.zeros(len(labels))
    count = 0
    for p in probs:
        total += np.where(p >= threshold, p, 0)
        count += 1
    mean = total / max(count, 1)
    ranked = []
    for label, score in zip(labels, mean):
        if score > 0:
            sci_name, _, com_name = label.partition('_')
            ranked.append((sci_name, com_name, float(score)))
    ranked.sort(key=lambda r: r[2], reverse=True)
    return ranked


def write_ranking(path: Path, ranked: list[tuple[str, str, float]]) -> None:
    with open(path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, lineterminator='\n')
        writer.writerow(['rank', 'sci_name', 'com_name', 'score'])
        for rank, (sci_name, com_name, score) in enumerate(ranked, 1):
            writer.writerow([rank, sci_name, com_name, f'{score:.6f}'])


def read_ranking(path: Path) -> list[dict]:
    with open(path, encoding='utf-8', newline='') as f:
        return [
            {
                'rank': int(row['rank']),
                'sci_name': row['sci_name'],
                'com_name': row['com_name'],
                'slug': slugify(row['sci_name']),
                'score': float(row['score']),
            }
            for row in csv.DictReader(f)
        ]


def _load_interpreter(model_path: Path):
    try:
        from ai_edge_litert.interpreter import Interpreter
    except ImportError:
        from tflite_runtime.interpreter import Interpreter
    interpreter = Interpreter(model_path=str(model_path))
    interpreter.allocate_tensors()
    return interpreter


def _model_outputs() -> Iterable[np.ndarray]:
    """Location model output for every grid point in every week."""
    interpreter = _load_interpreter(MDATA_MODEL)
    input_idx = interpreter.get_input_details()[0]['index']
    output_idx = interpreter.get_output_details()[0]['index']
    for lat, lon in GRID:
        for week in WEEKS:
            sample = np.expand_dims(np.array([lat, lon, week], dtype='float32'), 0)
            interpreter.set_tensor(input_idx, sample)
            interpreter.invoke()
            yield interpreter.get_tensor(output_idx)[0].copy()


def load_labels() -> list[str]:
    """Model labels as Sci_Com. The labels file may hold only the scientific
    name, in which case the common name comes from l18n/labels_en.json."""
    common = json.loads(COMMON_NAMES.read_text(encoding='utf-8'))
    labels = []
    for line in LABELS.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        sci_name, _, com_name = line.partition('_')
        labels.append(f'{sci_name}_{com_name or common.get(sci_name, sci_name)}')
    return labels


# --------------------------------------------------------------------------
# Candidates
# --------------------------------------------------------------------------

def target_species(ranking: list[dict], db_species: list[dict], painted: set[str],
                   top: int = 300) -> list[dict]:
    """The top `top` unpainted ranked species, then every station
    species, deduped by slug."""
    out: list[dict] = []
    seen: set[str] = set()
    pool = [r for r in ranking if r['slug'] not in painted][:top] + list(db_species)
    for sp in pool:
        if sp['slug'] not in seen:
            seen.add(sp['slug'])
            out.append({'slug': sp['slug'], 'sci_name': sp['sci_name'], 'com_name': sp['com_name']})
    return out


_last_request = 0.0


def http_get_json(url: str) -> dict:
    """GET a JSON document, one request a second, retrying throttling and
    server errors after 5s, 15s and 45s."""
    global _last_request
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    for attempt in range(len(BACKOFF) + 1):
        wait = _last_request + REQUEST_GAP - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as e:
            if (e.code != 429 and e.code < 500) or attempt == len(BACKOFF):
                raise
            time.sleep(BACKOFF[attempt])


def _inat_candidates(taxon_id: int, get_json: Callable[[str], dict], want: int) -> list[dict]:
    query = urllib.parse.urlencode({
        'taxon_id': taxon_id, 'photo_license': 'cc0', 'quality_grade': 'research',
        'order_by': 'votes', 'per_page': 10,
    })
    found = []
    for obs in get_json(f'{INAT_API}/observations?{query}').get('results', []):
        for photo in obs.get('photos', [])[:1]:
            if str(photo.get('license_code', '')).lower() != 'cc0' or not photo.get('url'):
                continue
            found.append({
                'url': photo['url'].replace('/square.', '/large.'),
                'page': f'https://www.inaturalist.org/photos/{photo["id"]}',
                'license': 'cc0',
                'credit': photo.get('attribution', ''),
                'source': 'inaturalist',
            })
    return found[:want]


def _free_license(name: str) -> str | None:
    """'cc0' or 'public domain' for an acceptable Commons licence, else None."""
    lowered = name.strip().lower()
    if lowered.startswith('cc0') or lowered.startswith('cc-zero'):
        return 'cc0'
    if lowered.startswith('public domain') or lowered == 'pd' or lowered.startswith('pd-') or lowered == 'pdm':
        return 'public domain'
    return None


def _wikimedia_candidates(sci_name: str, get_json: Callable[[str], dict], want: int) -> list[dict]:
    query = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6,
        'gsrsearch': f'"{sci_name}" filetype:bitmap', 'gsrlimit': 20,
        'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 1024,
    })
    pages = get_json(f'{COMMONS_API}?{query}').get('query', {}).get('pages', {})
    found = []
    for page in sorted(pages.values(), key=lambda p: p.get('index', 0)):
        info = (page.get('imageinfo') or [{}])[0]
        meta = info.get('extmetadata', {})
        licence = _free_license(meta.get('LicenseShortName', {}).get('value', ''))
        if licence is None or not info.get('thumburl'):
            continue
        found.append({
            'url': info['thumburl'],
            'page': info.get('descriptionurl', ''),
            'license': licence,
            'credit': re.sub(r'<[^>]+>', '', meta.get('Artist', {}).get('value', '')).strip(),
            'source': 'wikimedia',
        })
    return found[:want]


def fetch_candidates(sp: dict, get_json: Callable[[str], dict], want: int = WANT) -> dict:
    """CC0 / public-domain photo candidates for one species. The entry stays
    keyed by BirdNET's name even when iNaturalist uses another."""
    entry = {'slug': sp['slug'], 'sci_name': sp['sci_name'], 'com_name': sp['com_name'],
             'taxon_ok': False, 'candidates': []}
    query = urllib.parse.urlencode({'q': sp['sci_name'], 'rank': 'species,subspecies', 'per_page': 1})
    results = get_json(f'{INAT_API}/taxa?{query}').get('results', [])
    if not results or results[0].get('iconic_taxon_name') != 'Aves':
        return entry
    entry['taxon_ok'] = True
    candidates = _inat_candidates(results[0]['id'], get_json, want)
    if len(candidates) < WIKIMEDIA_BELOW:
        candidates += _wikimedia_candidates(sp['sci_name'], get_json, want - len(candidates))
    entry['candidates'] = [{'n': n, **c} for n, c in enumerate(candidates, 1)]
    return entry


def gather_candidates(targets: list[dict], path: Path, get_json: Callable[[str], dict],
                      want: int = WANT) -> dict:
    """Fetch candidates for each target not already in `path`, saving after
    every species so a throttled run resumes where it stopped."""
    state = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    path.parent.mkdir(parents=True, exist_ok=True)
    for sp in targets:
        if sp['slug'] in state:
            continue
        state[sp['slug']] = fetch_candidates(sp, get_json, want)
        path.write_text(json.dumps(state, indent=2), encoding='utf-8')
        print(f'  {sp["slug"]}: {len(state[sp["slug"]]["candidates"])} candidates')
    return state


def cmd_candidates(args) -> None:
    painted = set(installed_slugs(PUBLIC_DIR)[0])
    db_species = load_species(args.db) if args.db.exists() else []
    targets = target_species(read_ranking(RANKING_CSV), db_species, painted, args.top)
    state = gather_candidates(targets, CANDIDATES_JSON, http_get_json)
    empty = sum(1 for sp in targets if not state[sp['slug']]['candidates'])
    print(f'{len(targets)} species, {empty} without candidates -> {CANDIDATES_JSON}')


def cmd_rank(args) -> None:
    labels = load_labels()
    ranked = score_species(_model_outputs(), labels, THRESHOLD)
    write_ranking(args.out, ranked)
    print(f'Wrote {len(ranked)} species to {args.out}')
    for rank, (sci_name, com_name, score) in enumerate(ranked[:10], 1):
        print(f'  {rank:>3}  {com_name} ({sci_name})  {score:.3f}')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)

    rank = commands.add_parser('rank', help='rank species with the location model')
    rank.add_argument('--out', type=Path, default=RANKING_CSV, help='where to write the ranking')
    rank.set_defaults(run=cmd_rank)

    candidates = commands.add_parser('candidates', help='gather CC0 photo candidates per species')
    candidates.add_argument('--top', type=int, default=300, help='how many ranked species to cover')
    candidates.add_argument('--db', type=Path, default=DEFAULT_DB, help='station database, whose species are always included')
    candidates.set_defaults(run=cmd_candidates)

    args = parser.parse_args(argv)
    args.run(args)


if __name__ == '__main__':
    main()
