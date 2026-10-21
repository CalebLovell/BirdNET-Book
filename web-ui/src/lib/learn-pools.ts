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

/** What puts a species in each pool, for the quiz's info tip. */
export const LEARN_POOL_MEANINGS: Record<LearnPool, string> = {
	regulars: `species heard at least ${FREQUENT_SPECIES_THRESHOLD} times.`,
	rare: `species heard fewer than ${FREQUENT_SPECIES_THRESHOLD} times.`,
	all: "every species with a clip to play.",
};
