// Pure metadata, no server-only imports -- safe for the pool switcher on the
// Learn page to import directly, unlike learn.ts which touches the db. Mirrors
// the split used by timeline-periods.ts / timeline.ts.
//
// Pools split the station's birds by how familiar they are, never by when they
// were heard: a time window leaves the game empty on any quiet morning.
export const LEARN_POOLS = ["regulars", "rare", "all"] as const;
export type LearnPool = (typeof LEARN_POOLS)[number];

export const LEARN_POOL_LABELS: Record<LearnPool, string> = {
	regulars: "Regulars",
	rare: "Rare",
	all: "All",
};

/** Detections all-time a species needs before it counts as a regular; below
    it, the species is rare here. */
export const FREQUENT_SPECIES_THRESHOLD = 25;

export const LEARN_POOL_DESCRIPTIONS: Record<LearnPool, string> = {
	regulars: `Species heard at least ${FREQUENT_SPECIES_THRESHOLD} times — the regulars worth knowing cold.`,
	rare: `Species heard fewer than ${FREQUENT_SPECIES_THRESHOLD} times — the visitors that are easy to miss.`,
	all: "Every species this station has ever recorded.",
};
