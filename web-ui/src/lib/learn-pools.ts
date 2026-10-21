// Pure metadata, no server-only imports -- safe for the pool switcher on the
// Learn page to import directly, unlike learn.ts which touches the db. Mirrors
// the split used by timeline-periods.ts / timeline.ts.
//
// Pools split the station's birds by how familiar they are, never by when they
// were heard: a time window leaves the game empty on any quiet morning.
export const LEARN_POOLS = ["common", "uncommon", "rare", "all"] as const;
export type LearnPool = (typeof LEARN_POOLS)[number];

/** The pools that split the station's species between them; "all" is their
    sum. */
export type FamiliarityPool = Exclude<LearnPool, "all">;

export const LEARN_POOL_LABELS: Record<LearnPool, string> = {
	common: "Common",
	uncommon: "Uncommon",
	rare: "Rare",
	all: "All",
};

/** Detections all-time a species needs before it counts as common. */
export const COMMON_SPECIES_THRESHOLD = 25;

/** The fewest detections that make a species common. Never at or below the
    rare cutoff, so an owner who raises it past 25 can't make a bird both. */
function commonMin(rareMax: number) {
	return Math.max(COMMON_SPECIES_THRESHOLD, rareMax + 1);
}

/**
 * Which pool a species' all-time detection count puts it in. Rare is the app's
 * one meaning of rare -- the Highlights card's `rareMax`, which the owner tunes
 * in Settings -- so the quiz and the Rare pill never disagree; common is a bird
 * heard often; uncommon is everything between.
 */
export function familiarityPool(
	detections: number,
	rareMax: number,
): FamiliarityPool {
	if (detections <= rareMax) return "rare";
	if (detections >= commonMin(rareMax)) return "common";
	return "uncommon";
}

/** What puts a species in each pool, for the quiz's info tip, from the same
    cutoffs as `familiarityPool`. */
export function learnPoolMeanings(rareMax: number): Record<LearnPool, string> {
	const common = commonMin(rareMax);
	return {
		common: `species heard ${common} or more times.`,
		uncommon: `species heard ${rareMax + 1} to ${common - 1} times.`,
		rare: `species heard ${rareMax} or fewer times.`,
		all: "every species with a clip to play.",
	};
}
