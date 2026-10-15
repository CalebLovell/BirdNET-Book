"""Synthesized bird calls for local test data.

Not recordings, and not meant to fool anyone -- but each species gets a call
built from what its real one is like (the cardinal's falling "cheer" whistles,
the junco's one-pitch trill, the dove's low coos, the woodpecker's drum and
rattle, the crow's harsh caw), at roughly the right pitch and tempo, over a
little background hiss. That's enough for the web UI's spectrograms to show
recognisable shapes, and for the players to have something worth scrubbing
through.

Each species renders a few variants (different rng draws: pitch, tempo,
note counts, noise floor), so a list of detections isn't the same clip over
and over. A species without a recipe of its own gets a generic warbled song
seeded by its name.

Used by seed_test_data.py; run directly to write every species' variants to
a folder for listening:

    python3 scripts/seed_calls.py OUT_DIR
"""

import math
import os
import random
import sys
import wave
from collections.abc import Callable

import numpy as np

SR = 32000
CLIP_SECONDS = 6.0
VARIANTS = 4
# Bumped whenever a recipe changes, so the seeder renders a fresh pool rather
# than reusing stale clips.
VERSION = 2

PURE = (1.0,)
SOFT = (1.0, 0.25, 0.08)
RICH = (1.0, 0.7, 0.5, 0.35, 0.25, 0.15)
NASAL = (0.5, 1.0, 0.8, 0.6, 0.4, 0.3, 0.2)


# --------------------------------------------------------------------------
# Building blocks
# --------------------------------------------------------------------------

def _band_noise(n: int, lo: float, hi: float, rng: np.random.Generator) -> np.ndarray:
    spectrum = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spectrum[(freqs < lo) | (freqs > hi)] = 0
    out = np.fft.irfft(spectrum, n)
    peak = np.max(np.abs(out)) or 1.0
    return out / peak


def _envelope(n: int, attack: float, release: float) -> np.ndarray:
    env = np.ones(n)
    a = max(1, min(n // 2, int(attack * SR)))
    r = max(1, min(n // 2, int(release * SR)))
    env[:a] = np.linspace(0, 1, a)
    env[-r:] = np.minimum(env[-r:], np.linspace(1, 0, r))
    return env


def note(
    f0: float,
    f1: float | None = None,
    dur: float = 0.1,
    *,
    harm: tuple[float, ...] = SOFT,
    curve: float = 1.0,
    vib: float = 0.0,
    vib_rate: float = 0.0,
    am: float = 0.0,
    am_rate: float = 0.0,
    rasp: float = 0.0,
    attack: float = 0.01,
    release: float = 0.03,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """One sound: a pitch glide from f0 to f1 (shaped by `curve`), with
    harmonics, optional vibrato, amplitude buzz (`am` at `am_rate`) and rasp
    (band noise mixed in, for harsh calls)."""
    f1 = f0 if f1 is None else f1
    n = max(1, int(dur * SR))
    t = np.arange(n) / SR
    u = t / dur
    freq = f0 + (f1 - f0) * u**curve
    if vib:
        freq = freq + vib * np.sin(2 * math.pi * vib_rate * t)
    phase = 2 * math.pi * np.cumsum(freq) / SR
    y = np.zeros(n)
    for k, weight in enumerate(harm, start=1):
        if weight and k * max(f0, f1) < SR / 2 - 500:
            y += weight * np.sin(k * phase)
    y /= np.max(np.abs(y)) or 1.0
    if rasp:
        rng = rng or np.random.default_rng(0)
        lo, hi = min(f0, f1) * 0.6, max(f0, f1) * (len(harm) + 1)
        y = (1 - rasp) * y + rasp * _band_noise(n, lo, min(hi, SR / 2 - 100), rng) * np.abs(y)
    if am:
        y *= 1 - am * (0.5 + 0.5 * np.sin(2 * math.pi * am_rate * t))
    return y * _envelope(n, attack, release)


def click(dur: float = 0.012, lo: float = 800, hi: float = 9000, rng=None) -> np.ndarray:
    """A woody tap: a short burst of band noise with a fast decay."""
    rng = rng or np.random.default_rng(0)
    n = int(dur * SR)
    return _band_noise(n, lo, hi, rng) * np.exp(-np.arange(n) / (n / 5))


class Song:
    """Lays sounds end to end along a timeline, with gaps between them."""

    def __init__(self, rng: random.Random):
        self.r = rng
        self.np_rng = np.random.default_rng(rng.randrange(2**32))
        self.parts: list[tuple[float, np.ndarray, float]] = []
        self.t = 0.0
        # Each variant sings a little sharp or flat, a little fast or slow.
        self.pitch = rng.uniform(0.95, 1.05)
        self.tempo = rng.uniform(0.9, 1.1)

    def p(self, hz: float) -> float:
        return hz * self.pitch

    def d(self, seconds: float) -> float:
        return seconds * self.tempo

    def add(self, sound: np.ndarray, gap: float = 0.0, gain: float = 1.0) -> "Song":
        self.parts.append((self.t, sound, gain))
        self.t += len(sound) / SR + self.d(gap)
        return self

    def rest(self, seconds: float) -> "Song":
        self.t += self.d(seconds)
        return self

    def n(self, f0, f1=None, dur=0.1, gap=0.0, gain=1.0, **kw) -> "Song":
        """Adds one note, pitch and duration scaled to this variant."""
        kw.setdefault('rng', self.np_rng)
        return self.add(
            note(self.p(f0), None if f1 is None else self.p(f1), self.d(dur), **kw), gap, gain
        )

    def series(self, count, f0, f1=None, dur=0.1, gap=0.1, accel=1.0, drift=1.0, **kw):
        """`count` repeats of a note; `accel` shrinks each gap, `drift` scales
        each note's pitch from the last."""
        pitch = 1.0
        for _ in range(count):
            self.n(f0 * pitch, None if f1 is None else f1 * pitch, dur, gap, **kw)
            gap *= accel
            pitch *= drift
        return self

    def drum(self, count, rate, gap_after=0.0):
        for _ in range(count):
            self.add(click(rng=self.np_rng), 1 / rate - 0.012)
        return self.rest(gap_after)


# --------------------------------------------------------------------------
# Recipes. Each draws on the song's rng for counts and choices, so the
# variants differ in more than pitch.
# --------------------------------------------------------------------------

def _warble(s: Song, count: int, lo: float, hi: float, dur=(0.05, 0.12), gap=(0.01, 0.05), **kw):
    for _ in range(count):
        a, b = s.r.uniform(lo, hi), s.r.uniform(lo, hi)
        s.n(a, b, s.r.uniform(*dur), s.r.uniform(*gap), **kw)


def american_goldfinch(s):  # po-ta-to-chip, then twitter
    for f0, f1 in [(5200, 3600), (4600, 3400), (5000, 3800), (5600, 3200)]:
        s.n(f0, f1, 0.07, 0.06)
    s.rest(0.3)
    _warble(s, s.r.randint(6, 10), 3000, 6000, dur=(0.04, 0.08))


def house_finch(s):  # long jumbled warble ending in a buzzy note
    _warble(s, s.r.randint(14, 20), 2000, 6000, dur=(0.05, 0.11), gap=(0.0, 0.03))
    s.n(3500, 2800, 0.25, am=0.8, am_rate=90)


def northern_cardinal(s):  # cheer cheer cheer, purty purty purty
    s.series(s.r.randint(3, 5), 4300, 1900, 0.24, 0.07, harm=PURE, curve=0.6)
    s.rest(0.15)
    s.series(s.r.randint(4, 7), 2200, 3300, 0.09, 0.03, harm=PURE)


def white_breasted_nuthatch(s):  # nasal yank yank
    s.series(s.r.randint(3, 7), 700, 650, 0.12, 0.12, harm=NASAL)


def blue_jay(s):  # harsh jay! jay!
    s.series(s.r.randint(2, 4), 1300, 1000, 0.3, 0.15, harm=RICH, rasp=0.45)


def red_bellied_woodpecker(s):  # rolling kwirr
    s.series(s.r.randint(2, 3), 1200, 1050, 0.32, 0.35, harm=RICH, am=0.9, am_rate=32)


def cedar_waxwing(s):  # thin high trilled sree
    s.series(s.r.randint(3, 5), 7600, 7200, 0.5, 0.2, harm=PURE, am=0.7, am_rate=45)


def house_sparrow(s):  # cheep cheep cheep
    for _ in range(s.r.randint(4, 7)):
        s.n(2600, 4200, 0.05, 0.0)
        s.n(4200, 3000, 0.07, 0.12)


def hairy_woodpecker(s):  # sharp PEEK, then a rattle
    s.series(2, 4800, 4300, 0.06, 0.4, harm=RICH)
    s.series(14, 4500, 4200, 0.03, 0.03, harm=SOFT, drift=0.99)


def downy_woodpecker(s):  # pik, then a descending whinny
    s.n(4500, 4100, 0.05, 0.4, harm=RICH)
    s.series(16, 4800, 4400, 0.035, 0.035, accel=1.03, drift=0.985)


def northern_flicker(s):  # kee kee kee kee
    s.series(s.r.randint(12, 18), 2600, 2400, 0.05, 0.08, harm=RICH)


def drummer(s):  # a woodpecker's drum, then a call note
    s.drum(s.r.randint(14, 22), 18, 0.5)
    s.n(4300, 4000, 0.06, harm=RICH)


def american_robin(s):  # cheerily cheer-up: short whistled phrases
    for _ in range(s.r.randint(3, 4)):
        _warble(s, s.r.randint(2, 4), 2000, 3600, dur=(0.12, 0.22), gap=(0.03, 0.06), harm=SOFT)
        s.rest(0.35)


def mourning_dove(s):  # coo-OO-oo-oo-oo
    s.n(520, 640, 0.35, 0.15, harm=SOFT, release=0.08)
    s.n(640, 520, 0.6, 0.25, harm=SOFT, vib=12, vib_rate=7, release=0.1)
    s.series(3, 500, 470, 0.45, 0.2, harm=SOFT, release=0.1)


def dark_eyed_junco(s):  # one-pitch musical trill
    s.series(s.r.randint(16, 26), 5000, 3800, 0.04, 0.025, harm=SOFT)


def eastern_chipmunk(s):  # steady chip chip chip
    s.series(s.r.randint(8, 12), 6200, 4800, 0.04, 0.28, harm=SOFT)


def black_capped_chickadee(s):  # fee-bee, or chick-a-dee-dee-dee
    if s.r.random() < 0.5:
        s.n(4000, 4000, 0.35, 0.08, harm=PURE).n(3400, 3350, 0.35, 0.6, harm=PURE)
        s.n(4000, 4000, 0.35, 0.08, harm=PURE).n(3400, 3350, 0.35, 0.0, harm=PURE)
    else:
        s.n(7000, 5000, 0.04, 0.03).n(6500, 4500, 0.04, 0.06)
        s.series(s.r.randint(3, 6), 3600, 3500, 0.14, 0.05, harm=NASAL, am=0.5, am_rate=120)


def carolina_chickadee(s):  # fee-bee fee-bay
    for f in (6800, 4400, 6000, 3600):
        s.n(f, f * 0.97, 0.3, 0.12, harm=PURE)


def hawk_cak(s):  # cak-cak-cak
    s.series(s.r.randint(8, 12), 1700, 1500, 0.08, 0.08, harm=RICH, rasp=0.35)


def hawk_scream(s):  # kee-eeeer
    s.n(3300, 2100, 1.6, harm=RICH, rasp=0.5, curve=1.6, attack=0.08, release=0.4)


def red_shouldered_hawk(s):  # kee-ah kee-ah
    s.series(s.r.randint(4, 6), 2900, 2300, 0.3, 0.15, harm=RICH, rasp=0.3)


def eastern_bluebird(s):  # soft tu-a-wee
    for _ in range(2):
        s.n(2600, 3000, 0.12, 0.03).n(3000, 2700, 0.1, 0.03).n(2800, 3600, 0.22, 0.5)


def warbler_trill(s):  # loose sweet trill, rising at the end
    s.series(s.r.randint(8, 13), 4500, 5800, 0.06, 0.04, drift=1.01)
    s.n(5000, 6200, 0.12)


def black_throated_green(s):  # zee-zee-zoo-zee
    for f in (4800, 4800, 4100, 4900):
        s.n(f, f, 0.25, 0.08, am=0.7, am_rate=110)


def carolina_wren(s):  # tea-kettle tea-kettle tea-kettle
    for _ in range(s.r.randint(3, 5)):
        s.n(2600, 4200, 0.12, 0.02).n(4000, 2400, 0.14, 0.02).n(3000, 2600, 0.08, 0.06)


def kinglet(s):  # very high tsee tsee tsee, then a falling chatter
    s.series(s.r.randint(3, 5), 8400, 8000, 0.12, 0.1, harm=PURE)
    s.series(8, 7000, 6600, 0.04, 0.02, drift=0.97)


def ruby_crowned_kinglet(s):  # high notes, then a loud warble
    s.series(4, 7600, 7400, 0.06, 0.05, harm=PURE)
    s.rest(0.1)
    for _ in range(4):
        s.n(3600, 5200, 0.07, 0.01).n(5200, 3800, 0.07, 0.05)


def pine_siskin(s):  # twitter and a rising zreeee
    _warble(s, 8, 3000, 6000, dur=(0.04, 0.08))
    s.n(2800, 5200, 0.6, am=0.8, am_rate=80, curve=1.3)


def red_headed_woodpecker(s):  # harsh queeah
    s.series(s.r.randint(2, 4), 2200, 1900, 0.25, 0.3, harm=RICH, rasp=0.4)


def common_grackle(s):  # rusty-gate kh-sheee
    s.n(1500, 1500, 0.12, 0.04, harm=RICH, rasp=0.8)
    s.n(3000, 6500, 0.45, harm=RICH, rasp=0.4, curve=0.7)


def brown_creeper(s):  # see-ti-ti-see
    s.n(7500, 7300, 0.3, 0.05, harm=PURE)
    s.series(3, 6200, 6600, 0.08, 0.04, harm=PURE)
    s.n(7800, 7000, 0.25, harm=PURE)


def house_wren(s):  # rapid bubbling jumble
    _warble(s, s.r.randint(20, 28), 2000, 6500, dur=(0.03, 0.07), gap=(0.0, 0.02))


def brown_headed_cowbird(s):  # glug-glug-gleee
    s.n(600, 900, 0.18, 0.04, harm=RICH).n(800, 1100, 0.18, 0.08, harm=RICH)
    s.n(9500, 7000, 0.4, harm=PURE)


def sapsucker(s):  # mewing neeah
    s.series(s.r.randint(2, 4), 1700, 1200, 0.3, 0.25, harm=NASAL)


def hummingbird(s):  # squeaky chips
    s.series(s.r.randint(6, 10), 5800, 4200, 0.04, 0.1)


def white_crowned_sparrow(s):  # whistle, then buzzy trills
    s.n(3600, 3600, 0.6, 0.05, harm=PURE)
    s.n(4200, 3800, 0.3, 0.05, am=0.7, am_rate=70)
    s.series(6, 4400, 3400, 0.06, 0.03)
    s.n(3200, 3000, 0.3, am=0.8, am_rate=60)


def white_throated_sparrow(s):  # old Sam Peabody, Peabody, Peabody
    s.n(3200, 3200, 0.6, 0.05, harm=PURE).n(3900, 3900, 0.6, 0.05, harm=PURE)
    for _ in range(3):
        s.series(3, 3700, 3700, 0.16, 0.01, harm=PURE)


def field_sparrow(s):  # bouncing-ball whistles, speeding up
    s.series(14, 4200, 3800, 0.1, 0.22, accel=0.82, drift=1.01, harm=PURE)


def great_crested_flycatcher(s):  # loud rising wheep!
    s.series(s.r.randint(2, 3), 2000, 3600, 0.3, 0.4, harm=RICH, curve=0.6)


def flycatcher_pee_a_wee(s):  # slurred pee-a-wee
    s.n(3600, 4200, 0.3, 0.05, harm=PURE).n(4200, 3200, 0.25, 0.05, harm=PURE)
    s.n(3000, 4000, 0.4, harm=PURE)


def phoebe(s):  # buzzy fee-bee
    s.series(2, 4600, 4200, 0.2, 0.08, am=0.6, am_rate=150)


def kingbird(s):  # sputtering electric zeer
    s.series(5, 6500, 5500, 0.05, 0.03, rasp=0.3)
    s.n(7000, 5500, 0.4, am=0.8, am_rate=60, rasp=0.3)


def coyote(s):  # yips into a wavering howl
    s.series(4, 900, 1300, 0.12, 0.08, harm=RICH)
    s.n(700, 1100, 1.8, harm=SOFT, vib=60, vib_rate=4, curve=0.5, attack=0.1, release=0.4)


def squirrel(s):  # kuk kuk kuk chatter
    s.series(s.r.randint(10, 16), 2500, 1800, 0.05, 0.1, harm=RICH, rasp=0.6)


def kingfisher(s):  # dry rattle
    s.drum(s.r.randint(25, 35), 24)


def purple_martin(s):  # low gurgling chirps
    _warble(s, 12, 1800, 3400, dur=(0.06, 0.12), gap=(0.02, 0.06), harm=RICH)


def thrush_spiral(s):  # flutey phrases spiralling upward
    base = s.r.uniform(1800, 2400)
    for i in range(6):
        f = base * (1.12**i)
        s.n(f, f * 1.08, 0.09, 0.01, harm=SOFT, vib=40, vib_rate=30)


def hermit_thrush(s):  # a long held note, then a flutey cascade
    s.n(2300, 2300, 0.5, 0.02, harm=PURE)
    _warble(s, 6, 3000, 5500, dur=(0.06, 0.1), gap=(0.0, 0.02), harm=SOFT)


def red_breasted_nuthatch(s):  # tinny ank ank, higher than its cousin
    s.series(s.r.randint(5, 8), 1300, 1250, 0.09, 0.1, harm=NASAL)


def pileated(s):  # loud wuk-wuk-wuk
    s.series(s.r.randint(10, 16), 1600, 1400, 0.07, 0.1, harm=RICH)


def gull(s):  # kee-ow, laughing
    s.n(2400, 1600, 0.4, 0.1, harm=RICH, rasp=0.2)
    s.series(5, 1800, 1500, 0.12, 0.06, harm=RICH, rasp=0.2)


def teal(s):  # high whistled kreek
    s.series(3, 2400, 3000, 0.15, 0.3, harm=SOFT, am=0.4, am_rate=60)


def tern(s):  # raspy kraaa
    s.series(2, 1500, 1200, 0.5, 0.3, harm=RICH, rasp=0.7)


def canada_goose(s):  # honk-a-lonk
    s.series(s.r.randint(3, 5), 420, 520, 0.28, 0.15, harm=RICH, rasp=0.2)


def barred_owl(s):  # who cooks for you, who cooks for you-all
    for f, d in [(420, 0.25), (460, 0.2), (440, 0.3), (380, 0.5)]:
        s.n(f, f * 0.95, d, 0.08, harm=SOFT)
    s.rest(0.3)
    for f, d in [(430, 0.25), (460, 0.2), (440, 0.3)]:
        s.n(f, f * 0.95, d, 0.08, harm=SOFT)
    s.n(450, 330, 0.8, harm=SOFT, release=0.3)


def yellowlegs(s):  # tew-tew-tew
    s.series(3, 2700, 2400, 0.14, 0.1, harm=SOFT)


def sandhill_crane(s):  # rolling bugle
    s.series(2, 800, 900, 0.8, 0.2, harm=RICH, am=0.8, am_rate=22)


def heron(s):  # low harsh frahnk
    s.n(500, 420, 0.6, harm=RICH, rasp=0.6)


def tanager(s):  # robin-like, smoother
    for _ in range(3):
        _warble(s, 3, 2400, 3800, dur=(0.1, 0.16), gap=(0.02, 0.04), harm=SOFT)
        s.rest(0.25)


def grosbeak(s):  # a fast, sweet, robin-like song
    _warble(s, 12, 2000, 4200, dur=(0.08, 0.14), gap=(0.0, 0.03), harm=SOFT)


def american_crow(s):  # caw caw caw
    s.series(s.r.randint(3, 5), 650, 550, 0.35, 0.25, harm=RICH, rasp=0.5)


def chimney_swift(s):  # high chittering
    _warble(s, 22, 5000, 7500, dur=(0.02, 0.05), gap=(0.0, 0.02))


def osprey(s):  # cheep cheep cheep
    s.series(s.r.randint(5, 8), 2800, 3200, 0.12, 0.12, harm=SOFT)


def acadian(s):  # explosive peet-sa
    s.n(3000, 6000, 0.08, 0.02, harm=PURE).n(5500, 3500, 0.12, harm=PURE)


def sandpiper(s):  # peet-weet, kreet
    s.series(s.r.randint(2, 4), 4000, 5200, 0.1, 0.15, harm=SOFT, curve=0.5)


def wild_turkey(s):  # gobble
    s.n(700, 1300, 1.0, harm=RICH, am=0.9, am_rate=18, rasp=0.4)


def vireo(s):  # burry ee-oh phrases
    for _ in range(3):
        s.n(2400, 3200, 0.2, 0.03, harm=RICH, am=0.4, am_rate=80).n(3200, 2300, 0.2, 0.5, harm=RICH)


def bald_eagle(s):  # weak high chittering
    s.series(8, 3400, 2800, 0.08, 0.05, harm=SOFT)


def barn_swallow(s):  # twittering with a grating note
    _warble(s, 12, 2500, 6000, dur=(0.04, 0.08))
    s.n(3000, 3000, 0.3, rasp=0.6)


def collared_dove(s):  # coo-COO-coo
    s.n(500, 520, 0.25, 0.05, harm=SOFT).n(600, 620, 0.5, 0.05, harm=SOFT).n(480, 460, 0.4, harm=SOFT)


def kestrel(s):  # klee-klee-klee
    s.series(s.r.randint(6, 10), 3600, 3300, 0.07, 0.06, harm=SOFT)


def meadowlark(s):  # clear falling whistles
    for f in (4800, 4200, 3800, 3300, 2900):
        s.n(f, f * 0.85, 0.18, 0.04, harm=PURE)


def catbird(s):  # a mew, then a jumble
    s.n(2000, 2600, 0.3, 0.2, harm=NASAL, curve=0.6)
    _warble(s, 10, 1500, 5500, dur=(0.05, 0.1), gap=(0.01, 0.05))


def cuckoo(s):  # ka-ka-ka-kow-kow
    s.series(8, 1100, 1000, 0.05, 0.05, harm=RICH, accel=1.12)
    s.series(3, 900, 800, 0.15, 0.15, harm=RICH)


RECIPES: dict[str, Callable[[Song], None]] = {
    'American Goldfinch': american_goldfinch,
    'House Finch': house_finch,
    'Northern Cardinal': northern_cardinal,
    'White-breasted Nuthatch': white_breasted_nuthatch,
    'Blue Jay': blue_jay,
    'Red-bellied Woodpecker': red_bellied_woodpecker,
    'Cedar Waxwing': cedar_waxwing,
    'House Sparrow': house_sparrow,
    'Hairy Woodpecker': hairy_woodpecker,
    'Northern Flicker': northern_flicker,
    'Downy Woodpecker': downy_woodpecker,
    'American Robin': american_robin,
    'Mourning Dove': mourning_dove,
    'Dark-eyed Junco': dark_eyed_junco,
    'Eastern Chipmunk': eastern_chipmunk,
    'Black-capped Chickadee': black_capped_chickadee,
    "Cooper's Hawk": hawk_cak,
    'Eastern Bluebird': eastern_bluebird,
    'Yellow-rumped Warbler': warbler_trill,
    'Carolina Wren': carolina_wren,
    'Golden-crowned Kinglet': kinglet,
    'Pine Siskin': pine_siskin,
    'Red-headed Woodpecker': red_headed_woodpecker,
    'Common Grackle': common_grackle,
    'Red-tailed Hawk': hawk_scream,
    'Ruby-crowned Kinglet': ruby_crowned_kinglet,
    'Brown Creeper': brown_creeper,
    'House Wren': house_wren,
    'Brown-headed Cowbird': brown_headed_cowbird,
    'Yellow-bellied Sapsucker': sapsucker,
    'Ruby-throated Hummingbird': hummingbird,
    'White-crowned Sparrow': white_crowned_sparrow,
    'Great Crested Flycatcher': great_crested_flycatcher,
    'Coyote': coyote,
    'Red-shouldered Hawk': red_shouldered_hawk,
    'Belted Kingfisher': kingfisher,
    'Eastern Gray Squirrel': squirrel,
    'Purple Martin': purple_martin,
    'Rose-breasted Grosbeak': grosbeak,
    'Carolina Chickadee': carolina_chickadee,
    'White-throated Sparrow': white_throated_sparrow,
    "Swainson's Thrush": thrush_spiral,
    'Palm Warbler': warbler_trill,
    'Tennessee Warbler': warbler_trill,
    'Red-breasted Nuthatch': red_breasted_nuthatch,
    'Black-throated Green Warbler': black_throated_green,
    'Magnolia Warbler': warbler_trill,
    'Pileated Woodpecker': pileated,
    'Ring-billed Gull': gull,
    'Green-winged Teal': teal,
    'Hermit Thrush': hermit_thrush,
    'Caspian Tern': tern,
    'Canada Goose': canada_goose,
    'Barred Owl': barred_owl,
    'Lesser Yellowlegs': yellowlegs,
    'Sandhill Crane': sandhill_crane,
    'Great Blue Heron': heron,
    'Summer Tanager': tanager,
    'American Crow': american_crow,
    'Chimney Swift': chimney_swift,
    'Eastern Wood-Pewee': flycatcher_pee_a_wee,
    'Eastern Kingbird': kingbird,
    'Field Sparrow': field_sparrow,
    'Osprey': osprey,
    'Acadian Flycatcher': acadian,
    'Least Sandpiper': sandpiper,
    'Wild Turkey': wild_turkey,
    'Yellow-throated Vireo': vireo,
    'Bald Eagle': bald_eagle,
    'Barn Swallow': barn_swallow,
    'Eastern Phoebe': phoebe,
    'Eurasian Collared-Dove': collared_dove,
    'Greater Yellowlegs': yellowlegs,
    'Spotted Sandpiper': sandpiper,
    'American Kestrel': kestrel,
    'Eastern Meadowlark': meadowlark,
    'Gray Catbird': catbird,
    'Yellow-billed Cuckoo': cuckoo,
}

# Species the table doesn't name fall back by family, then to a warble.
FAMILY_RECIPES: list[tuple[str, Callable[[Song], None]]] = [
    ('Woodpecker', drummer),
    ('Warbler', warbler_trill),
    ('Sparrow', white_crowned_sparrow),
    ('Thrush', thrush_spiral),
    ('Hawk', hawk_cak),
    ('Owl', barred_owl),
    ('Dove', mourning_dove),
    ('Wren', house_wren),
    ('Flycatcher', flycatcher_pee_a_wee),
    ('Kinglet', kinglet),
]


def _generic(s: Song):
    _warble(s, s.r.randint(8, 14), 2000, 5500)


def recipe_for(com_name: str) -> Callable[[Song], None]:
    if com_name in RECIPES:
        return RECIPES[com_name]
    for word, recipe in FAMILY_RECIPES:
        if word in com_name:
            return recipe
    return _generic


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

def render(com_name: str, variant: int) -> np.ndarray:
    """One CLIP_SECONDS clip: the species' call starting a moment in, over a
    low hiss that's louder in the later variants."""
    rng = random.Random(f'{com_name}:{variant}:{VERSION}')
    song = Song(rng)
    recipe = recipe_for(com_name)
    recipe(song)
    # A woodpecker's call recipe is its voice; its drum is just as much it.
    if 'Woodpecker' in com_name and recipe is not drummer and variant % 2:
        song = Song(rng)
        drummer(song)

    n = int(CLIP_SECONDS * SR)
    out = np.zeros(n)
    start = rng.uniform(0.6, 1.4)
    for offset, sound, gain in song.parts:
        i = int((start + offset) * SR)
        if i >= n:
            break
        piece = sound[: n - i]
        out[i : i + len(piece)] += gain * piece
    peak = np.max(np.abs(out)) or 1.0
    out = out / peak * 0.7

    # Background: pinkish hiss (more energy low, as wind and traffic have).
    noise_rng = np.random.default_rng(rng.randrange(2**32))
    spectrum = np.fft.rfft(noise_rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spectrum /= np.sqrt(np.maximum(freqs, 50))
    hiss = np.fft.irfft(spectrum, n)
    hiss /= np.max(np.abs(hiss)) or 1.0
    # Quiet enough to sit below the call in the spectrogram, not over it.
    out += hiss * (0.002 + 0.0015 * variant)
    # Fade the clip's edges like an extraction cut from a longer recording.
    return out * _envelope(n, 0.05, 0.05)


def write_wav(path: str, samples: np.ndarray):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = (np.clip(samples, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SR)
        wav_file.writeframes(pcm.tobytes())


def safe_name(com_name: str) -> str:
    """BirdNET-Pi's folder name for a species."""
    return com_name.replace("'", '').replace(' ', '_')


def ensure_pool(pool_dir: str, com_names: list[str]) -> dict[str, list[str]]:
    """Renders any missing variants into `pool_dir`; returns each species'
    variant paths."""
    pool: dict[str, list[str]] = {}
    made = 0
    for com_name in com_names:
        paths = []
        for variant in range(VARIANTS):
            path = os.path.join(pool_dir, f'{safe_name(com_name)}-{variant}.wav')
            if not os.path.exists(path):
                write_wav(path, render(com_name, variant))
                made += 1
            paths.append(path)
        pool[com_name] = paths
    if made:
        print(f'Rendered {made} synthesized calls into {pool_dir}')
    return pool


if __name__ == '__main__':
    out_dir = sys.argv[1] if len(sys.argv) > 1 else 'seed-calls'
    for name in sys.argv[2:] or RECIPES:
        for v in range(VARIANTS):
            write_wav(os.path.join(out_dir, f'{safe_name(name)}-{v}.wav'), render(name, v))
    print(f'Wrote calls to {out_dir}')
