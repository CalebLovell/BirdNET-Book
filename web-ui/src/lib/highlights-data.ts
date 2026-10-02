// Highlights: the rules that decide what a window of detections is worth
// remarking on, shared by the Live page (the rolling last 24 hours) and the
// timeline (whichever calendar window is selected). Pure on purpose -- the SQL
// that gathers the evidence lives in lib/live-highlights.ts and lib/timeline.ts,
// so the judgement itself can be tested against hand-written facts rather than
// a seeded database, and the two pages can never disagree about what counts.
//
// Every line but the busiest hour is gated: it speaks only when something
// deviates from this station's own baseline. A card that finds something to
// say every time is wallpaper, and stops being read.

import { QUIET_AFTER_DAYS } from "~/lib/migration-data.ts";

/** Silence long enough that coming back is news on the Live page. The same
    fortnight the timeline's quiet list uses, and the same fortnight a Day on
    the timeline is compared with -- longer periods ask for a bird to have been
    away for their whole comparison stretch instead. */
export const RETURN_AFTER_DAYS = QUIET_AFTER_DAYS;

/** Records ever, at or below which a species is still a rare visitor here. */
export const RARE_LIFETIME_MAX = 5;

/** Share of the baseline's days a species must have been heard on before its
    silence counts as breaking a routine rather than just a gap: 10 of the 14
    days before a Live window. */
export const ROUTINE_MIN_SHARE = 10 / 14;

/** How long such a regular must have been silent before it is worth saying. */
export const ROUTINE_SILENT_DAYS = 2;

/** The least stretch that can show a routine at all: a month two days in has
    one day of last month to compare with, and one day is not a routine. */
export const ROUTINE_MIN_BASELINE_DAYS = 7;

/**
 * Detections per day below which the activity comparison stays quiet. A station
 * averaging a handful of detections swings by hundreds of percent on noise
 * alone, and "up 200%" on three detections is not a highlight.
 */
export const VOLUME_BASELINE_MIN = 20;

/** How far from the baseline's daily rate counts as busy, and as quiet. */
export const BUSY_RATIO = 1.3;
export const QUIET_RATIO = 0.7;

/** How many times its usual daily rate a species must be heard at before the
    window counts as far more than usual for it. Well above the station-wide
    BUSY_RATIO, since one species' counts swing far more than everything's --
    a single day doubling its usual is ordinary noise. */
export const VOCAL_RATIO = 3;

/** Share of the comparison's recorded days a species must have been heard on
    to have a "usual" at all. Below it the bird was barely around, and a jump
    from four detections to eighty is an arrival, not a regular gone loud. */
export const VOCAL_MIN_PRESENCE = 1 / 4;

/** Detections a species needs in the window before it can be more vocal than
    usual, so a couple of stray calls from a quiet bird never count. */
export const VOCAL_MIN_DETECTIONS = 10;

/** Birds a line names before summing up the rest, so a migration week doesn't
    turn one line into a paragraph. */
export const MAX_NAMED_BIRDS = 5;

/** A bird as a line names it, plus what earned it its place ("23 days away"). */
export type HighlightBird = { comName: string; note: string | null };

export type SpeciesHighlightKind =
	| "new"
	| "returned"
	| "rare"
	| "vocal"
	| "routine";

export type Highlight =
	| {
			kind: "activity";
			direction: "up" | "down";
			/** How far the window's daily rate sits from the baseline's, rounded. */
			percent: number;
			/** What the window is compared against: "the four weeks before". */
			baselineLabel: string;
			/** The window's detections -- or, for a window still in progress, its
			    detections per day so far (see `perDay`). */
			detections: number;
			perDay: boolean;
			/** Species against the baseline's usual count. Null for a window still
			    in progress, whose species list isn't finished yet. */
			speciesDelta: number | null;
	  }
	| { kind: "busiest-hour"; hour: number }
	| {
			kind: SpeciesHighlightKind;
			/** Every qualifying species counts toward this... */
			total: number;
			/** ...but only the first MAX_NAMED_BIRDS are named. */
			birds: HighlightBird[];
			/** For "vocal": what the birds are heard far more than, as the
			    activity line names it ("the four weeks before"). */
			comparedWith?: string;
	  };

/**
 * Everything the rules need, already gathered. Each species list arrives
 * ordered by how strongly it qualifies, because only the first few are named.
 */
export type HighlightFacts = {
	/** Detections inside the window. Zero means nothing to say at all. */
	detections: number;
	/** 24 counts, midnight first, summed across every species in the window. */
	hourCounts: number[];
	/** Heard in the window, never heard before it. Most detections first. */
	newSpecies: string[];
	/** Heard in the window after RETURN_AFTER_DAYS or more away. Longest
	    absence first. */
	returning: { comName: string; daysAway: number }[];
	/** Heard in the window and barely ever otherwise. Fewest records first. */
	rare: { comName: string; lifetimeCount: number }[];
	/** Heard far more than usual in the window. Biggest jump first. */
	vocal: ({ comName: string } & VocalJump)[];
	/** How the comparison stretch is named, for the vocal line. Null when
	    there is none (all time, or too little history). */
	comparedWith: string | null;
	/** Regulars absent from the window. Most regular first. */
	breakingRoutine: { comName: string; daysSilent: number }[];
	/** The window's pace against the stretch before it. Null when there is no
	    stretch before it to compare with (all time, or too little history). */
	activity: {
		baselineLabel: string;
		/** The window's detections per day. */
		windowPerDay: number;
		/** The baseline's detections per day. */
		baselinePerDay: number;
		/** The window's detections, for the sentence. */
		windowDetections: number;
		/** Whether the window is still running, so its figures are "so far". */
		inProgress: boolean;
		windowSpecies: number;
		/** Mean distinct species per period across the baseline. */
		baselineSpecies: number;
	} | null;
};

/** A species heard far more than usual: its count in the window, what its
    usual daily rate comes to over as many days, and the multiple between. */
export type VocalJump = { count: number; usual: number; ratio: number };

/**
 * A species heard far more than usual in the window, or null unless it clears
 * VOCAL_RATIO. Only a bird that was properly around in the comparison stretch
 * -- heard on VOCAL_MIN_PRESENCE of its recorded days -- has a usual to beat;
 * one barely heard before is closer to an arrival, which a multiple over a
 * handful of detections would wildly overstate.
 */
export function vocalJump({
	windowCount,
	windowDays,
	baselineCount,
	baselineDays,
	daysHeard,
}: {
	windowCount: number;
	windowDays: number;
	baselineCount: number;
	/** The comparison's recorded days. */
	baselineDays: number;
	/** How many of those days the species was heard on. */
	daysHeard: number;
}): VocalJump | null {
	if (windowDays <= 0 || baselineDays <= 0 || baselineCount === 0) return null;
	if (windowCount < VOCAL_MIN_DETECTIONS) return null;
	if (daysHeard < VOCAL_MIN_PRESENCE * baselineDays) return null;
	const usual = (baselineCount / baselineDays) * windowDays;
	const ratio = windowCount / usual;
	return ratio >= VOCAL_RATIO ? { count: windowCount, usual, ratio } : null;
}

/** "76, usually about 5" -- the window's count against its usual. */
export function formatVocal({
	count,
	usual,
}: {
	count: number;
	usual: number;
}) {
	const usually =
		usual < 0.5 ? "under 1" : `about ${Math.round(usual).toLocaleString()}`;
	return `${count.toLocaleString()}, usually ${usually}`;
}

/**
 * "than the four weeks before", "than in September 2026": the comparison as
 * the end of "heard far more ...". A label naming a period itself needs the
 * "in"; one already reading as a stretch doesn't.
 */
export function thanPhrase(comparedWith: string | undefined | null): string {
	if (!comparedWith) return "than usual";
	return /^(the|your) /.test(comparedWith)
		? `than ${comparedWith}`
		: `than in ${comparedWith}`;
}

/**
 * How long a bird was away, at the scale that reads naturally: "23 days" up to
 * two months, then "5 months", then "2 years" -- so a bird back on the yearly
 * view isn't "back after 412 days".
 */
export function formatAway(days: number): string {
	if (days < 60) return `${days} ${plural(days, "day", "days")}`;
	if (days < 730) return `${Math.round(days / 30.44)} months`;
	const years = Math.round(days / 365.25);
	return `${years} ${plural(years, "year", "years")}`;
}

function plural(count: number, one: string, many: string): string {
	return count === 1 ? one : many;
}

function speciesLine<Row extends { comName: string }>(
	kind: SpeciesHighlightKind,
	rows: Row[],
	noteFor: (row: Row) => string | null,
): Highlight {
	return {
		kind,
		total: rows.length,
		birds: rows
			.slice(0, MAX_NAMED_BIRDS)
			.map((row) => ({ comName: row.comName, note: noteFor(row) })),
	};
}

function activityLine(facts: HighlightFacts): Highlight | null {
	const activity = facts.activity;
	// Volume speaks only when the baseline is worth comparing against, so a
	// quiet station's normal variation never gets dressed up as a trend.
	if (!activity || activity.baselinePerDay < VOLUME_BASELINE_MIN) return null;

	const ratio = activity.windowPerDay / activity.baselinePerDay;
	if (ratio < BUSY_RATIO && ratio > QUIET_RATIO) return null;

	return {
		kind: "activity",
		direction: ratio >= BUSY_RATIO ? "up" : "down",
		percent: Math.round(Math.abs(ratio - 1) * 100),
		baselineLabel: activity.baselineLabel,
		detections: activity.inProgress
			? Math.round(activity.windowPerDay)
			: activity.windowDetections,
		perDay: activity.inProgress,
		speciesDelta: activity.inProgress
			? null
			: activity.windowSpecies - Math.round(activity.baselineSpecies),
	};
}

/**
 * The window's highlights, in the order they read best: how the window compared
 * with the stretch before it, when it was busiest, then the birds -- arrivals,
 * returns, rarities and unusually vocal regulars first, absences last. Empty only for a window with no
 * detections, which the card reports with its empty note instead.
 */
export function buildHighlights(facts: HighlightFacts): Highlight[] {
	// A window with nothing in it is almost always the station being down, not
	// every bird falling silent at once -- so it says nothing about routines or
	// volume either.
	if (facts.detections === 0) return [];

	const lines: Highlight[] = [];

	const activity = activityLine(facts);
	if (activity) lines.push(activity);

	lines.push({
		kind: "busiest-hour",
		hour: facts.hourCounts.indexOf(Math.max(...facts.hourCounts)),
	});

	if (facts.newSpecies.length > 0) {
		lines.push(
			speciesLine(
				"new",
				facts.newSpecies.map((comName) => ({ comName })),
				() => null,
			),
		);
	}

	if (facts.returning.length > 0) {
		lines.push(
			speciesLine("returned", facts.returning, (row) =>
				formatAway(row.daysAway),
			),
		);
	}

	if (facts.rare.length > 0) {
		lines.push(
			speciesLine(
				"rare",
				facts.rare,
				(row) =>
					`${row.lifetimeCount} ${plural(row.lifetimeCount, "record", "records")} ever`,
			),
		);
	}

	if (facts.vocal.length > 0) {
		lines.push({
			...speciesLine("vocal", facts.vocal, formatVocal),
			...(facts.comparedWith ? { comparedWith: facts.comparedWith } : {}),
		});
	}

	if (facts.breakingRoutine.length > 0) {
		lines.push(
			speciesLine(
				"routine",
				facts.breakingRoutine,
				(row) => `silent ${row.daysSilent} days`,
			),
		);
	}

	return lines;
}
