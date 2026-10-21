#!/usr/bin/env python3
"""Collects CC0 reference photos for common North American birds.

    rank    score every species BirdNET knows by how widely and how often
            its location model expects it across the US and Canada, and
            write the result to ranking.csv

Usage:
    python photos.py rank [--out ranking.csv]
"""

import argparse
import csv
import json
from pathlib import Path
from typing import Iterable

import numpy as np

from illustrate import slugify

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
MODEL_DIR = REPO_ROOT / 'model'
MDATA_MODEL = MODEL_DIR / 'BirdNET_GLOBAL_6K_V2.4_MData_Model_V2_FP16.tflite'
LABELS = MODEL_DIR / 'BirdNET_GLOBAL_6K_V2.4_Model_FP16_Labels.txt'
COMMON_NAMES = MODEL_DIR / 'l18n' / 'labels_en.json'
RANKING_CSV = HERE / 'ranking.csv'
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

    args = parser.parse_args(argv)
    args.run(args)


if __name__ == '__main__':
    main()
