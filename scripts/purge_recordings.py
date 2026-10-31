"""Frees disk space once it crosses PURGE_THRESHOLD, by deleting recordings.

Every species keeps its PURGE_KEEP_PER_SPECIES best recordings, by confidence,
however full the disk gets; beyond those, the least confident go first, the
oldest first among equals. Files listed in disk_check_exclude.txt are never
deleted. Below the threshold nothing is touched, so a station keeps every
recording for as long as it has room.
"""
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.helpers import BASE_PATH, get_settings  # noqa: E402

EXCLUDE_FILE = os.path.join(BASE_PATH, 'scripts/disk_check_exclude.txt')
# Free a little past the threshold, so the next check doesn't purge again
# for the sake of a single new recording.
HEADROOM = 2
BATCH = 25
SIDECARS = ('.png', '.json')
NAME = re.compile(r'-(\d{1,3})-(\d{4}-\d{2}-\d{2})-birdnet-')


def recordings(by_date):
    """(relative path, species, confidence, date) for every recording."""
    found = []
    for date in sorted(os.listdir(by_date)):
        date_dir = os.path.join(by_date, date)
        if not os.path.isdir(date_dir):
            continue
        for species in os.listdir(date_dir):
            species_dir = os.path.join(date_dir, species)
            if not os.path.isdir(species_dir):
                continue
            for name in os.listdir(species_dir):
                if name.endswith(SIDECARS):
                    continue
                match = NAME.search(name)
                confidence = int(match.group(1)) if match else 0
                found.append((f'{date}/{species}/{name}', species, confidence, date))
    return found


def deletion_order(found, keep, protected):
    """Recordings that may go, the first to go first."""
    by_species = {}
    for recording in found:
        by_species.setdefault(recording[1], []).append(recording)
    spare = []
    for group in by_species.values():
        group.sort(key=lambda r: (r[2], r[3]), reverse=True)
        spare += [r for r in group[keep:] if r[0] not in protected]
    spare.sort(key=lambda r: (r[2], r[3]))
    return [r[0] for r in spare]


def used_percent(path):
    usage = shutil.disk_usage(path)
    return usage.used * 100 / usage.total


def remove(by_date, relative):
    path = os.path.join(by_date, relative)
    for file in (path, *(path + suffix for suffix in SIDECARS)):
        try:
            os.remove(file)
        except FileNotFoundError:
            pass


def remove_empty_dirs(by_date):
    for root, dirs, files in os.walk(by_date, topdown=False):
        if root != by_date and not dirs and not files:
            os.rmdir(root)


def main():
    conf = get_settings()
    by_date = os.path.join(conf['EXTRACTED'], 'By_Date')
    threshold = int(conf.get('PURGE_THRESHOLD') or 95)
    keep = int(conf.get('PURGE_KEEP_PER_SPECIES') or 10)
    target = threshold - HEADROOM
    if not os.path.isdir(by_date) or used_percent(by_date) < threshold:
        return
    try:
        with open(EXCLUDE_FILE) as f:
            protected = {line.strip() for line in f}
    except FileNotFoundError:
        protected = set()

    order = deletion_order(recordings(by_date), keep, protected)
    deleted = 0
    while deleted < len(order) and used_percent(by_date) >= target:
        for relative in order[deleted:deleted + BATCH]:
            remove(by_date, relative)
        deleted += BATCH
    remove_empty_dirs(by_date)
    print(f'Removed {min(deleted, len(order))} recordings; disk {used_percent(by_date):.0f}% used.')


if __name__ == '__main__':
    main()
