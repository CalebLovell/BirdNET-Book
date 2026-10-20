#!/usr/bin/env python3
"""Seed scripts/birds.db with detections for local dev: none, a year, or
several years.

The most recent twelve weeks are real: scripts/test_data/
backyard_detections.csv.gz is one backyard station's actual detections
(July-September), exported from its birds.db. They are replayed exactly as
recorded -- the true dawn chorus, the species BirdNET actually confuses,
the odd mammal that slips past the bird filter, a handful of one-off
rarities, a recorder outage, and mid-record changes to the station's own
settings (Overlap moves from 0 to 1.2 and 1.25).

The nine months before that (October to early July) are extrapolated from
the real data, so every time range the web-ui offers has something behind
it:

  * each species keeps its real character -- its detection times are
    resampled from its own real ones (moved with the sunrise and sunset),
    and its confidences from its own real scores;
  * each species' abundance is fitted to its real count, then carried
    through the year by a seasonal presence curve: residents peak in their
    singing season, summer breeders arrive and leave on schedule, passage
    migrants come through in spring and fall;
  * species a July-September recording can't contain, but this yard would
    have -- winter sparrows and kinglets, spring warblers --
    are added at modest levels;
  * overall volume meets the real data's own level at both seams, dips in
    midwinter, peaks in the May dawn chorus, and has weather-length quiet
    spells and the odd recorder outage.

Asked for more than a year, the extrapolation keeps going back. Each
earlier year is the same yard's year with its own luck: overall volume
drifts a little and every species has better and worse years, so year-
over-year views have something to compare. The year leading into the
real recording is never varied, so its seam still meets the real data.

The synthetic rows are seeded, so a reseed produces the same history again.

Everything is shifted by whole days so the last real day lands on today.
Times of day are never moved; detections later today than right now are
dropped, the way a real station has only heard the morning so far. Week and
File_Name are rebuilt from the shifted date, matching what BirdNET-Pi would
have written.

The station's location is blanked to 0, 0 in the fixture, since this
repository is public.

Every detection also gets an audio clip at BirdNET-Pi's real extraction
path (the same BIRDNET_EXTRACTED_DIR default web-ui itself uses), so any
play button or spectrogram in the UI has something to play. The clips are
synthesized calls modelled on each species' real one (seed_calls.py), a few
variants per species, rendered once into Extracted/.seed-calls/ and hard-
linked into place -- tens of thousands of clips for the disk cost of a few
hundred. A reseed removes the links the last seed made (listed in the pool's
manifest) and never touches any other file.

Usage:
    python3 scripts/seed_test_data.py               # wipes and reseeds a full year
    python3 scripts/seed_test_data.py --years 5     # wipes and reseeds five years
    python3 scripts/seed_test_data.py --empty       # wipes, leaving no detections
    python3 scripts/seed_test_data.py --append      # adds on top of existing rows
    python3 scripts/seed_test_data.py --days 14     # only the most recent 14 days
    python3 scripts/seed_test_data.py --no-audio    # skip the audio clips
"""
import argparse
import csv
import gzip
import importlib
import math
import os
import random
import shutil
import site
import sqlite3
import subprocess
import sys
import zlib
from collections import defaultdict
from datetime import date, datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), 'birds.db')

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), 'test_data', 'backyard_detections.csv.gz')

# Mirrors web-ui's default BIRDNET_EXTRACTED_DIR: BirdSongs lives as a
# sibling of the BirdNET-Pi checkout, never inside the repo itself.
DEFAULT_EXTRACTED_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'BirdSongs', 'Extracted')
)

DEFAULT_DAYS = 365
DEFAULT_SEED = 1

AUDIOFMT = 'mp3'

# The station's settings for the extrapolated months: the real record
# starts with Overlap 0, so the months leading up to it use the same.
LAT = 0.0
LON = 0.0
CUTOFF = 0.7
SENS = 1.25
OVERLAP = 0.0


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


# --------------------------------------------------------------------------
# Seasonality
#
# Each species carries a presence curve: given a day of the year it returns
# how present it is, 0 meaning "not here" and 1 its peak. Days of the year
# are the recording's own calendar, before the shift to today, so the
# seasons line up with the real months.
# --------------------------------------------------------------------------

def _within(doy: int, start: int, end: int) -> bool:
    """Windows that wrap past New Year (winter visitors) are still one window."""
    if start <= end:
        return start <= doy <= end
    return doy >= start or doy <= end


def window(start: int, end: int, ramp: int = 14, floor: float = 0.0):
    """Present between two days of the year, fading in and out over `ramp` days.

    `floor` is what's left outside the window -- 0 for a true migrant, a
    small number for one that mostly leaves but always has a few stragglers."""

    def presence(doy: int) -> float:
        if not _within(doy, start, end):
            return floor
        edge_distance = min((doy - start) % 365, (end - doy) % 365)
        return floor + (1 - floor) * min(1.0, (edge_distance + 1) / ramp)

    return presence


def year_round(peak_doy: int, amplitude: float):
    """Here every day, but more vocal around `peak_doy`."""

    def presence(doy: int) -> float:
        return (1 + amplitude * math.cos(2 * math.pi * (doy - peak_doy) / 365)) / (1 + amplitude)

    return presence


def passage(spring: tuple[int, int], fall: tuple[int, int], fall_scale: float = 0.7):
    """Two short windows a year: north in spring, back through in fall."""
    spring_window = window(*spring, ramp=6)
    fall_window = window(*fall, ramp=8)
    return lambda doy: max(spring_window(doy), fall_scale * fall_window(doy))


def both(*curves):
    """A species shaped by two things at once, e.g. here March-November and
    loudest in May."""

    def presence(doy: int) -> float:
        return math.prod(curve(doy) for curve in curves)

    return presence


# Every species in the real recording, with the shape of its year. Their
# levels are fitted to the real counts, so these only say *when*.
REAL_SPECIES_PRESENCE = {
    # --- residents ------------------------------------------------------
    'American Goldfinch': year_round(185, 0.45),
    'House Finch': year_round(120, 0.85),
    'Blue Jay': year_round(265, 0.45),
    'Cedar Waxwing': year_round(215, 0.5),
    'Northern Cardinal': year_round(110, 0.55),
    'Red-bellied Woodpecker': year_round(260, 0.4),
    'White-breasted Nuthatch': year_round(60, 0.35),
    'House Sparrow': year_round(130, 0.6),
    'Hairy Woodpecker': year_round(60, 0.3),
    'Downy Woodpecker': year_round(60, 0.3),
    'Mourning Dove': year_round(150, 0.7),
    'Black-capped Chickadee': year_round(60, 0.5),
    'Carolina Chickadee': year_round(60, 0.5),
    'Eastern Bluebird': year_round(100, 0.5),
    'Red-headed Woodpecker': year_round(150, 0.3),
    'Carolina Wren': year_round(90, 0.4),
    "Cooper's Hawk": year_round(100, 0.3),
    'Red-tailed Hawk': year_round(60, 0.2),
    'Red-shouldered Hawk': year_round(80, 0.4),
    'Pileated Woodpecker': year_round(80, 0.3),
    'Belted Kingfisher': year_round(120, 0.2),
    'Wild Turkey': year_round(105, 0.8),
    'American Crow': year_round(60, 0.3),
    'Barred Owl': year_round(60, 0.5),
    'Eurasian Collared-Dove': year_round(130, 0.4),
    'Canada Goose': year_round(60, 0.4),
    'Bald Eagle': year_round(30, 0.4),
    'American Kestrel': year_round(100, 0.2),
    'Ring-billed Gull': year_round(30, 0.5),
    'Eastern Gray Squirrel': year_round(270, 0.5),
    'Coyote': year_round(30, 0.5),

    # --- partial migrants: thin in winter -------------------------------
    'Northern Flicker': window(60, 305, ramp=20, floor=0.2),
    'American Robin': both(window(55, 315, ramp=20, floor=0.15), year_round(125, 0.6)),
    'Common Grackle': window(60, 300, ramp=14, floor=0.05),
    'Great Blue Heron': window(60, 320, ramp=20, floor=0.2),
    'Field Sparrow': window(80, 290, ramp=14, floor=0.1),
    'Eastern Meadowlark': window(60, 300, ramp=14, floor=0.15),
    'Eastern Phoebe': window(70, 295, ramp=10, floor=0.05),
    'Brown-headed Cowbird': window(75, 210, ramp=12, floor=0.05),

    # --- summer breeders ------------------------------------------------
    'Ruby-throated Hummingbird': window(115, 270, ramp=10),
    'House Wren': window(108, 245, ramp=12),
    'Great Crested Flycatcher': window(118, 235, ramp=10),
    'Purple Martin': window(95, 225, ramp=12),
    'Eastern Wood-Pewee': window(130, 270, ramp=10),
    'Summer Tanager': window(115, 260, ramp=10),
    'Chimney Swift': window(105, 280, ramp=10),
    'Eastern Kingbird': window(115, 250, ramp=10),
    'Yellow-throated Vireo': window(108, 250, ramp=10),
    'Acadian Flycatcher': window(125, 245, ramp=10),
    'Yellow-billed Cuckoo': window(135, 260, ramp=10),
    'Gray Catbird': window(115, 280, ramp=10),
    'Barn Swallow': window(100, 260, ramp=10),
    'Osprey': window(80, 280, ramp=10),
    'Caspian Tern': window(100, 250, ramp=10),

    # --- passage migrants and winter visitors ---------------------------
    'Rose-breasted Grosbeak': passage((120, 140), (250, 275)),
    "Swainson's Thrush": passage((125, 148), (250, 280)),
    'Yellow-bellied Sapsucker': passage((88, 115), (262, 292)),
    'Lesser Yellowlegs': passage((100, 135), (195, 270)),
    'Greater Yellowlegs': passage((95, 130), (215, 290)),
    'Least Sandpiper': passage((110, 140), (195, 265)),
    'Spotted Sandpiper': passage((110, 145), (195, 265)),
    'Sandhill Crane': passage((50, 90), (265, 330)),
    'Red-breasted Nuthatch': window(230, 120, ramp=20),
    'Green-winged Teal': window(245, 110, ramp=20),
    'White-throated Sparrow': window(265, 130, ramp=14),

    # --- mammals --------------------------------------------------------
    'Eastern Chipmunk': passage((65, 150), (230, 300), fall_scale=1.0),
}

# Real species with too few detections of their own to resample times from,
# that should borrow the night's rather than the day's.
NOCTURNAL = {'Barred Owl', 'Coyote'}


class AddedSpecies:
    """A species a July-September recording can't contain, added outright."""

    def __init__(self, common, sci, presence, peak_per_day):
        self.common = common
        self.sci = sci
        self.presence = presence
        # Detections on a typical day at its peak.
        self.peak_per_day = peak_per_day


ADDED_SPECIES = [
    # --- winter visitors ------------------------------------------------
    AddedSpecies('Dark-eyed Junco', 'Junco hyemalis', window(285, 105, ramp=16), 22),
    AddedSpecies('Golden-crowned Kinglet', 'Regulus satrapa', window(280, 110, ramp=14), 4),
    AddedSpecies('Brown Creeper', 'Certhia americana', window(280, 110, ramp=14), 2),
    AddedSpecies('Pine Siskin', 'Spinus pinus', window(300, 100, ramp=18), 3),

    # --- passage migrants ----------------------------------------------
    # The real late-September record has no fall warblers going through, so
    # the ones that would pass before October only come in spring.
    AddedSpecies('White-crowned Sparrow', 'Zonotrichia leucophrys', passage((110, 135), (280, 305)), 4),
    AddedSpecies('Ruby-crowned Kinglet', 'Corthylio calendula', passage((95, 125), (275, 305)), 6),
    AddedSpecies('Hermit Thrush', 'Catharus guttatus', passage((90, 115), (285, 310)), 2),
    AddedSpecies('Yellow-rumped Warbler', 'Setophaga coronata', passage((100, 135), (278, 310)), 9),
    AddedSpecies('Palm Warbler', 'Setophaga palmarum', passage((105, 130), (275, 295)), 3),
    AddedSpecies('Tennessee Warbler', 'Leiothlypis peregrina', window(122, 142, ramp=6), 3),
    AddedSpecies('Magnolia Warbler', 'Setophaga magnolia', window(125, 145, ramp=6), 2),
    AddedSpecies('Black-throated Green Warbler', 'Setophaga virens', window(118, 140, ramp=6), 2),
]


# --------------------------------------------------------------------------
# Daily rhythm and volume
# --------------------------------------------------------------------------

def sun_times(doy: int) -> tuple[float, float]:
    """Rough sunrise/sunset in decimal hours for a mid-latitude yard.

    Swings from about 05:15/20:30 at the June solstice to 07:40/16:45 in
    late December, which is what moves the dawn chorus around the clock."""
    seasonal = math.cos(2 * math.pi * (doy - 172) / 365)
    return 6.45 - 1.25 * seasonal, 18.6 + 1.9 * seasonal


# Typical detections per day through the year, as (day of year, count).
# July to October are the real data's own levels; the rest dips to a
# midwinter low and peaks with the May dawn chorus.
VOLUME_ANCHORS = [
    (31, 60), (60, 110), (91, 250), (130, 560), (166, 480),
    (191, 390), (227, 220), (258, 100), (274, 105), (305, 85), (349, 60),
]
PEAK_VOLUME = max(count for _, count in VOLUME_ANCHORS)

# How far the real data's own level reaches into the extrapolated months.
# At each seam a species is heard at exactly its real rate; that pull fades
# over these many days, leaving its presence curve in charge of the rest.
SEAM_DAYS = 21
FALL_FADE_DAYS = 60
SUMMER_FADE_DAYS = 45


def volume(doy: int) -> float:
    """Linear between the anchors, wrapping round the year."""
    anchors = VOLUME_ANCHORS + [(VOLUME_ANCHORS[0][0] + 365, VOLUME_ANCHORS[0][1])]
    if doy < anchors[0][0]:
        doy += 365
    for (start, low), (end, high) in zip(anchors, anchors[1:]):
        if start <= doy <= end:
            return low + (high - low) * (doy - start) / (end - start)
    return anchors[-1][1]


def _doy(day: date) -> int:
    return day.timetuple().tm_yday


def _hours(time_str: str) -> float:
    hour, minute, second = (int(part) for part in time_str.split(':'))
    return hour + minute / 60 + second / 3600


class Profile:
    """What the real data says about one species: how often it's heard,
    when in the day, and how sure BirdNET is about it."""

    def __init__(self, common, sci, presence, rate, times, confidences):
        self.common = common
        self.sci = sci
        self.presence = presence
        # Detections per day at full presence on the year's busiest day.
        self.rate = rate
        # (hours, day of year) pairs to resample from.
        self.times = times
        self.confidences = confidences
        # Real rate over the curve's, at the start and end of the recording;
        # 1 for added species, which have no real rate to meet.
        self.summer_ratio = 1.0
        self.fall_ratio = 1.0

    def modelled_on(self, doy: int) -> float:
        return self.rate * self.presence(doy) * volume(doy) / PEAK_VOLUME

    def expected_on(self, doy: int, first_real_doy: int, last_real_doy: int) -> float:
        """The curve, pulled to the real rate near each seam: September's real
        level carries into October, early July's back into June."""
        after_recording = (doy - last_real_doy) % 365
        before_recording = (first_real_doy - doy) % 365
        fall_weight = max(0.0, 1 - after_recording / FALL_FADE_DAYS)
        summer_weight = max(0.0, 1 - before_recording / SUMMER_FADE_DAYS)
        correction = self.fall_ratio ** fall_weight * self.summer_ratio ** summer_weight
        return self.modelled_on(doy) * correction


def build_profiles(recorded: list[dict]) -> list[Profile]:
    by_species = defaultdict(list)
    for row in recorded:
        by_species[(row['Com_Name'], row['Sci_Name'])].append(row)

    first = date.fromisoformat(recorded[0]['Date'])
    last = date.fromisoformat(recorded[-1]['Date'])
    real_doys = [_doy(first + timedelta(days=offset)) for offset in range((last - first).days + 1)]

    def sample(rows):
        return [(_hours(row['Time']), _doy(date.fromisoformat(row['Date']))) for row in rows]

    night_pool = sample(
        row for (common, _), rows in by_species.items()
        if common in NOCTURNAL for row in rows
    )
    day_pool = sample(
        row for (common, _), rows in by_species.items() if common not in NOCTURNAL for row in rows
    )
    all_confidences = [float(row['Confidence']) for row in recorded]

    profiles = []
    for (common, sci), rows in by_species.items():
        presence = REAL_SPECIES_PRESENCE[common]
        # How much of its year the recording caught, so a species heard
        # only at the very end of its season is scaled up to its peak.
        exposure = sum(presence(doy) * volume(doy) / PEAK_VOLUME for doy in real_doys)
        rate = len(rows) / max(exposure, 1.0)
        own_times = sample(rows)
        if len(own_times) >= 15:
            times = own_times
        else:
            times = night_pool if common in NOCTURNAL else day_pool
        confidences = [float(row['Confidence']) for row in rows]
        if len(confidences) < 10:
            confidences = all_confidences
        profile = Profile(common, sci, presence, rate, times, confidences)
        profile.summer_ratio = _seam_ratio(profile, rows, real_doys[:SEAM_DAYS])
        profile.fall_ratio = _seam_ratio(profile, rows, real_doys[-SEAM_DAYS:])
        profiles.append(profile)

    for added in ADDED_SPECIES:
        peak = max(added.presence(doy) * volume(doy) / PEAK_VOLUME for doy in range(1, 366))
        profiles.append(Profile(
            added.common, added.sci, added.presence, added.peak_per_day / peak,
            day_pool, all_confidences,
        ))
    return profiles


def _seam_ratio(profile: Profile, rows: list[dict], doys: list[int]) -> float:
    """How far the species' real count over `doys` is from its curve's.

    Smoothed by one detection either side so a species the recording only
    heard once isn't scaled to nothing or to a flood, and clamped for the
    same reason."""
    window_doys = set(doys)
    real = sum(1 for row in rows if _doy(date.fromisoformat(row['Date'])) in window_doys)
    modelled = sum(profile.modelled_on(doy) for doy in doys)
    return min(20.0, max(0.05, (real + 1) / (modelled + 1)))


def _poisson(rng: random.Random, mean: float) -> int:
    if mean > 50:
        return max(0, round(rng.gauss(mean, math.sqrt(mean))))
    threshold, count, product = math.exp(-mean), 0, rng.random()
    while product > threshold:
        count += 1
        product *= rng.random()
    return count


def resample_time(rng: random.Random, profile: Profile, doy: int) -> float:
    """One of the species' real times, moved with the sun: a dawn detection
    on a July morning becomes a dawn detection on a January one."""
    hours, real_doy = rng.choice(profile.times)
    sunrise, sunset = sun_times(doy)
    real_sunrise, real_sunset = sun_times(real_doy)
    noon = (real_sunrise + real_sunset) / 2
    shift = (sunrise - real_sunrise) if hours < noon else (sunset - real_sunset)
    return (hours + shift + rng.gauss(0, 0.15)) % 24


# How much one year differs from the next, as lognormal sigmas: the yard
# as a whole, and each species on top of that.
YEAR_VOLUME_SIGMA = 0.08
YEAR_SPECIES_SIGMA = 0.25


def year_factors(profiles: list[Profile], years_back: int, seed: int) -> dict[str, float]:
    """Each species' multiplier for the year `years_back` years before the
    one leading into the recording. That year itself is 1 throughout, so
    the one-year history -- and its seam with the real data -- is unchanged.

    Drawn from their own generator, so how many years are generated never
    changes any one year's luck."""
    if years_back == 0:
        return {profile.common: 1.0 for profile in profiles}
    rng = random.Random(f'{seed}-year-{years_back}')
    overall = rng.lognormvariate(0, YEAR_VOLUME_SIGMA)
    return {
        profile.common: overall * rng.lognormvariate(0, YEAR_SPECIES_SIGMA)
        for profile in profiles
    }


def extrapolate(recorded: list[dict], first: date, last: date, seed: int = DEFAULT_SEED):
    """Synthetic detections for every day from `first` to `last`, in the
    recording's own calendar, as (datetime, Profile, confidence)."""
    rng = random.Random(seed)
    profiles = build_profiles(recorded)
    first_recorded = date.fromisoformat(recorded[0]['Date'])
    first_real_doy = _doy(first_recorded)
    last_real_doy = _doy(date.fromisoformat(recorded[-1]['Date']))
    detections = []
    weather = 1.0
    outage_days_left = 0
    factors_by_year = {}
    day = first
    while day <= last:
        doy = _doy(day)
        years_back = (first_recorded - day - timedelta(days=1)).days // 365
        if years_back not in factors_by_year:
            factors_by_year[years_back] = year_factors(profiles, years_back, seed)
        factors = factors_by_year[years_back]
        # Weather doesn't reset at midnight, so it's a random walk pulled
        # back toward normal: quiet spells last a few days.
        weather = min(1.3, max(0.55, 1.0 + (weather - 1.0) * 0.8 + rng.gauss(0, 0.09)))
        if outage_days_left > 0:
            outage_days_left -= 1
            factor = 0.02
        elif rng.random() < 0.01:
            # SD card full, power cut, mic unplugged for a day or three.
            outage_days_left = rng.randint(0, 2)
            factor = 0.02
        else:
            factor = weather * (0.45 if rng.random() < 0.1 else 1.0)

        midnight = datetime.combine(day, datetime.min.time())
        for profile in profiles:
            expected = profile.expected_on(doy, first_real_doy, last_real_doy)
            for _ in range(_poisson(rng, expected * factor * factors[profile.common])):
                at = midnight + timedelta(hours=resample_time(rng, profile, doy))
                confidence = rng.choice(profile.confidences) + rng.gauss(0, 0.01)
                confidence = round(min(0.9999, max(CUTOFF, confidence)), 4)
                detections.append((at.replace(microsecond=0), profile, confidence))
        day += timedelta(days=1)
    return detections


def generate_rows(days: int | None = DEFAULT_DAYS, now: datetime | None = None, seed: int = DEFAULT_SEED):
    """The year ending on `now`'s date: the real recording at the end, the
    extrapolated months before it, all shifted so the last real day is today.

    `days` keeps only the most recent N days (today included); None keeps
    just the real recording, and 0 nothing at all."""
    if days == 0:
        return []
    now = (now or datetime.now()).replace(microsecond=0)
    recorded = load_fixture()
    first_recorded = date.fromisoformat(recorded[0]['Date'])
    last_recorded = date.fromisoformat(recorded[-1]['Date'])
    shift = now.date() - last_recorded
    if days:
        first_kept = now.date() - timedelta(days=days - 1)
    else:
        first_kept = first_recorded + shift

    def row_for(detected_at, sci, com, confidence, lat, lon, cutoff, sens, overlap):
        date_str = detected_at.strftime('%Y-%m-%d')
        time_str = detected_at.strftime('%H:%M:%S')
        return (
            date_str, time_str, sci, com, confidence, lat, lon, cutoff,
            detected_at.isocalendar()[1], sens, overlap,
            file_name_for(com, confidence, date_str, time_str),
        )

    rows = []
    synthetic_first = first_kept - shift
    synthetic_last = first_recorded - timedelta(days=1)
    if synthetic_first <= synthetic_last:
        for at, profile, confidence in extrapolate(recorded, synthetic_first, synthetic_last, seed):
            rows.append(row_for(
                at + shift, profile.sci, profile.common, confidence,
                LAT, LON, CUTOFF, SENS, OVERLAP,
            ))

    for row in recorded:
        detected_at = datetime.fromisoformat(f"{row['Date']}T{row['Time']}") + shift
        if detected_at > now or detected_at.date() < first_kept:
            continue
        rows.append(row_for(
            detected_at, row['Sci_Name'], row['Com_Name'], float(row['Confidence']),
            float(row['Lat']), float(row['Lon']), float(row['Cutoff']),
            float(row['Sens']), float(row['Overlap']),
        ))

    rows.sort(key=lambda r: (r[0], r[1]))
    return rows


def clip_file_name(file_name: str) -> str:
    """The name a seeded clip is written under. ':' is valid on the Pi's
    Linux filesystem (where the real format comes from) but illegal on
    Windows dev machines, and the clips are WAVs, not MP3s."""
    return os.path.splitext(file_name)[0].replace(':', '-') + '.wav'


def _remove_last_seed(seed_root: str, extracted_dir: str):
    """Deletes the clips the previous seed linked in, and any folders that
    leaves empty. Only paths in the manifest are touched."""
    manifest = os.path.join(seed_root, 'manifest.txt')
    if not os.path.exists(manifest):
        return
    with open(manifest, encoding='utf-8') as listing:
        paths = [line.rstrip('\n') for line in listing if line.strip()]
    folders = set()
    for relative in paths:
        full = os.path.join(extracted_dir, relative)
        try:
            os.remove(full)
        except FileNotFoundError:
            pass
        folders.add(os.path.dirname(full))
        folders.add(os.path.dirname(os.path.dirname(full)))
    for folder in sorted(folders, key=len, reverse=True):
        try:
            os.rmdir(folder)
        except OSError:
            pass  # not empty, or already gone
    os.remove(manifest)


def ensure_numpy():
    """seed_calls renders the clips with numpy, which a dev machine's Python
    may not have. Installs it (into the user site, outside a venv) rather
    than failing after the detections are already written."""
    try:
        import numpy  # noqa: F401
        return
    except ImportError:
        pass
    print('numpy is needed to render the audio clips; installing it...')
    in_venv = sys.prefix != sys.base_prefix
    command = [
        sys.executable, '-m', 'pip', 'install', '--quiet',
        '--disable-pip-version-check', '--no-warn-script-location', 'numpy',
    ]
    if not in_venv:
        command.insert(4, '--user')
    if subprocess.run(command).returncode != 0:
        sys.exit(
            'Could not install numpy. Install it with '
            f'"{sys.executable} -m pip install numpy", or rerun with --no-audio.'
        )
    site.main()  # pick up a user site that didn't exist when Python started
    importlib.invalidate_caches()
    import numpy  # noqa: F401


def seed_audio(rows: list[tuple], extracted_dir: str, fresh: bool):
    """Links a synthesized call into place for every row, at By_Date/<date>/
    <species>/<File_Name>. Rows already carry their clip_file_name()."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import seed_calls

    # The manifest sits above the versioned pools, so a recipe change (a new
    # VERSION) still finds and removes the previous seed's links.
    seed_root = os.path.join(extracted_dir, '.seed-calls')
    pool_dir = os.path.join(seed_root, f'v{seed_calls.VERSION}')
    os.makedirs(pool_dir, exist_ok=True)
    if fresh:
        _remove_last_seed(seed_root, extracted_dir)
        for name in os.listdir(seed_root):
            stale = os.path.join(seed_root, name)
            if name.startswith('v') and os.path.isdir(stale) and stale != pool_dir:
                shutil.rmtree(stale)
    pool = seed_calls.ensure_pool(pool_dir, sorted({row[3] for row in rows}))

    # Every link is recorded as it's made, so even a run that fails partway
    # leaves a manifest the next seed can clean up after.
    linked = 0
    made_dirs = set()
    # NTFS allows a file 1,023 hard links; a common bird has thousands of
    # detections. When a variant fills up, a fresh copy of it takes over.
    overflow: dict[str, tuple[str, int]] = {}
    with open(os.path.join(seed_root, 'manifest.txt'), 'a', encoding='utf-8') as manifest:
        for row in rows:
            date_str, com_name, file_name = row[0], row[3], row[11]
            folder = os.path.join(extracted_dir, 'By_Date', date_str, seed_calls.safe_name(com_name))
            target = os.path.join(folder, file_name)
            if os.path.exists(target):
                continue  # a real recording, or an earlier --append's clip
            if folder not in made_dirs:
                os.makedirs(folder, exist_ok=True)
                made_dirs.add(folder)
            variants = pool[com_name]
            variant = variants[zlib.crc32(file_name.encode()) % len(variants)]
            source, copies = overflow.get(variant, (variant, 0))
            try:
                os.link(source, target)
            except OSError:
                copies += 1
                source = f'{os.path.splitext(variant)[0]}.{copies}.wav'
                if not os.path.exists(source):
                    shutil.copyfile(variant, source)
                overflow[variant] = (source, copies)
                os.link(source, target)
            manifest.write(os.path.relpath(target, extracted_dir) + '\n')
            linked += 1

    print(f'Linked {linked} synthesized clips under {extracted_dir}')


def days_for_years(years: int, today: date | None = None) -> int:
    """The days from this date `years` years ago to today, so N years means
    N whole calendar years, leap days included."""
    today = today or date.today()
    try:
        start = today.replace(year=today.year - years)
    except ValueError:  # 29 February, in a year without one
        start = today.replace(year=today.year - years, day=28)
    return (today - start).days


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default=DB_PATH, help='Path to birds.db')
    span = parser.add_mutually_exclusive_group()
    span.add_argument(
        '--days',
        type=int,
        default=DEFAULT_DAYS,
        help='Keep only the most recent N days, including today (default: a year)',
    )
    span.add_argument(
        '--years', type=int, help='Seed N years of history instead, ending today'
    )
    span.add_argument(
        '--empty', action='store_true', help='Clear the detections and seed nothing'
    )
    parser.add_argument(
        '--seed', type=int, default=DEFAULT_SEED, help='Random seed for the extrapolated months'
    )
    parser.add_argument('--append', action='store_true', help="Don't clear existing rows first")
    parser.add_argument(
        '--extracted-dir',
        default=os.environ.get('BIRDNET_EXTRACTED_DIR', DEFAULT_EXTRACTED_DIR),
        help='Directory to write the audio clips into',
    )
    parser.add_argument(
        '--no-audio', action='store_true', help='Skip generating audio clips'
    )
    args = parser.parse_args()
    if args.empty:
        args.days = 0
    elif args.years is not None:
        args.days = days_for_years(args.years)
    # Checked before the database is touched, so a missing dependency never
    # leaves detections behind with no clips to play.
    if not args.no_audio:
        ensure_numpy()

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

    rows = generate_rows(args.days, seed=args.seed)
    if not args.no_audio:
        rows = [(*row[:11], clip_file_name(row[11])) for row in rows]
    cur.executemany(
        'INSERT INTO detections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        rows,
    )
    con.commit()

    if not args.no_audio:
        seed_audio(rows, args.extracted_dir, fresh=not args.append)

    total = cur.execute('SELECT COUNT(*) FROM detections').fetchone()[0]
    species = cur.execute('SELECT COUNT(DISTINCT Com_Name) FROM detections').fetchone()[0]
    days = len({row[0] for row in rows})
    con.close()

    print(f'Inserted {len(rows)} detections across {days} days.')
    print(f'birds.db now has {total} total rows across {species} species.')


if __name__ == '__main__':
    main()
