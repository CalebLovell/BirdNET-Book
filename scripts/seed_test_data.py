#!/usr/bin/env python3
"""Seed scripts/birds.db with real BirdNET-Pi detections for local dev.

Replays scripts/test_data/backyard_detections.csv.gz -- about twelve weeks
of one backyard station's actual detections (July-September), exported
from its birds.db -- instead of inventing data. Real data has the things a
generator only approximates: the true dawn chorus, the species BirdNET
actually confuses, frogs and insects that slip past the bird filter, a
handful of one-off rarities, a recorder outage, and mid-record changes to
the station's own settings (Overlap moves from 0 to 1.2 and 1.25).

The history is shifted by whole days so its last recorded day lands on
today. Times of day are never moved, so the activity curves stay real;
detections later today than right now are dropped, the way a real station
has only heard the morning so far. Week and File_Name are rebuilt from the
shifted date, matching what BirdNET-Pi would have written.

The station's location is blanked to 0, 0 in the fixture, since this
repository is public.

Also generates one placeholder audio clip per species (for its most recent
detection) at BirdNET-Pi's real extraction path, so web-ui's play button
has something real to play locally -- the same BIRDNET_EXTRACTED_DIR
default web-ui itself uses.

Usage:
    python3 scripts/seed_test_data.py               # wipes and reseeds the full history
    python3 scripts/seed_test_data.py --append      # adds on top of existing rows
    python3 scripts/seed_test_data.py --days 14     # only the most recent 14 days
    python3 scripts/seed_test_data.py --no-audio    # skip placeholder audio clips
"""
import argparse
import csv
import gzip
import math
import os
import sqlite3
import struct
import wave
from datetime import date, datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), 'birds.db')

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), 'test_data', 'backyard_detections.csv.gz')

# Mirrors web-ui's default BIRDNET_EXTRACTED_DIR: BirdSongs lives as a
# sibling of the BirdNET-Pi checkout, never inside the repo itself.
DEFAULT_EXTRACTED_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'BirdSongs', 'Extracted')
)

AUDIOFMT = 'mp3'


def load_fixture(path: str = FIXTURE_PATH) -> list[dict]:
    """The recorded detections, oldest first, exactly as the station logged them."""
    with gzip.open(path, 'rt', newline='') as fixture:
        rows = list(csv.DictReader(fixture))
    rows.sort(key=lambda row: (row['Date'], row['Time']))
    return rows


def file_name_for(com_name: str, confidence: float, date_str: str, time_str: str) -> str:
    """BirdNET-Pi's extraction name: <Species>-<pct>-<date>-birdnet-<time>.<fmt>."""
    com_name_safe = com_name.replace("'", '').replace(' ', '_')
    return f'{com_name_safe}-{round(confidence * 100)}-{date_str}-birdnet-{time_str}.{AUDIOFMT}'


def generate_rows(days: int | None = None, now: datetime | None = None):
    """Replays the fixture so its last recorded day is `now`'s date.

    `days` keeps only the most recent N days (today included); None keeps
    the whole recording."""
    now = (now or datetime.now()).replace(microsecond=0)
    recorded = load_fixture()
    last_recorded = date.fromisoformat(recorded[-1]['Date'])
    shift = now.date() - last_recorded
    first_kept = now.date() - timedelta(days=days - 1) if days else None

    rows = []
    for row in recorded:
        detected_at = datetime.fromisoformat(f"{row['Date']}T{row['Time']}") + shift
        if detected_at > now:
            continue
        if first_kept and detected_at.date() < first_kept:
            continue

        date_str = detected_at.strftime('%Y-%m-%d')
        time_str = detected_at.strftime('%H:%M:%S')
        confidence = float(row['Confidence'])
        rows.append((
            date_str, time_str, row['Sci_Name'], row['Com_Name'], confidence,
            float(row['Lat']), float(row['Lon']), float(row['Cutoff']),
            detected_at.isocalendar()[1], float(row['Sens']), float(row['Overlap']),
            file_name_for(row['Com_Name'], confidence, date_str, time_str),
        ))
    return rows


def write_placeholder_wav(path: str, seed_text: str, duration: float = 1.2, framerate: int = 22050):
    """Writes a short synthesized tone, distinct per species, so the
    web-ui's play button has something real to play during local dev."""
    freq = 350 + (abs(hash(seed_text)) % 700)
    frame_count = int(duration * framerate)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(framerate)
        frames = bytearray()
        for i in range(frame_count):
            t = i / framerate
            envelope = max(0.0, min(1.0, t * 8, (duration - t) * 8))
            sample = int(32767 * 0.3 * envelope * math.sin(2 * math.pi * freq * t))
            frames += struct.pack('<h', sample)
        wav_file.writeframes(bytes(frames))


def seed_placeholder_audio(con: sqlite3.Connection, extracted_dir: str):
    """Generates one placeholder clip per species (its most recent
    detection) at BirdNET-Pi's real extraction path (By_Date/<date>/
    <species>/<file>), and repoints that one row's File_Name at the
    matching .wav so the DB and the file on disk agree."""
    cur = con.cursor()
    cur.execute("""
        SELECT Com_Name, Date, Time, File_Name FROM detections
        ORDER BY Date DESC, Time DESC
    """)
    seen = set()
    updates = []
    for com_name, date_str, time_str, file_name in cur.fetchall():
        if com_name in seen:
            continue
        seen.add(com_name)

        com_name_safe = com_name.replace("'", '').replace(' ', '_')
        # ':' is valid in filenames on the Pi's Linux filesystem (where the
        # real format comes from) but illegal on Windows dev machines, so
        # the placeholder file itself uses a filesystem-safe name.
        stem = os.path.splitext(file_name)[0].replace(':', '-')
        wav_name = f'{stem}.wav'
        full_path = os.path.join(extracted_dir, 'By_Date', date_str, com_name_safe, wav_name)
        write_placeholder_wav(full_path, com_name)
        updates.append((wav_name, com_name, date_str, time_str))

    cur.executemany(
        'UPDATE detections SET File_Name = ? WHERE Com_Name = ? AND Date = ? AND Time = ?',
        updates,
    )
    con.commit()
    print(f'Generated {len(updates)} placeholder audio clips under {extracted_dir}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default=DB_PATH, help='Path to birds.db')
    parser.add_argument(
        '--days',
        type=int,
        default=None,
        help='Keep only the most recent N days, including today (default: the whole recording)',
    )
    parser.add_argument('--append', action='store_true', help="Don't clear existing rows first")
    parser.add_argument(
        '--extracted-dir',
        default=os.environ.get('BIRDNET_EXTRACTED_DIR', DEFAULT_EXTRACTED_DIR),
        help='Directory to write placeholder audio clips into',
    )
    parser.add_argument(
        '--no-audio', action='store_true', help='Skip generating placeholder audio clips'
    )
    args = parser.parse_args()

    con = sqlite3.connect(args.db)
    cur = con.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS detections (
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
          File_Name VARCHAR(100) NOT NULL)
    """)

    if not args.append:
        reviews_table_exists = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'reviews'"
        ).fetchone()
        if reviews_table_exists:
            cur.execute('DELETE FROM reviews')
        cur.execute('DELETE FROM detections')

    rows = generate_rows(args.days)
    cur.executemany(
        'INSERT INTO detections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        rows,
    )
    con.commit()

    if not args.no_audio:
        seed_placeholder_audio(con, args.extracted_dir)

    total = cur.execute('SELECT COUNT(*) FROM detections').fetchone()[0]
    species = cur.execute('SELECT COUNT(DISTINCT Com_Name) FROM detections').fetchone()[0]
    days = len({row[0] for row in rows})
    con.close()

    print(f'Inserted {len(rows)} real detections across {days} days.')
    print(f'birds.db now has {total} total rows across {species} species.')


if __name__ == '__main__':
    main()
