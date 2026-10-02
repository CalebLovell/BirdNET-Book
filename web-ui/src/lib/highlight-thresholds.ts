// The Highlights card's thresholds, and the plain-language guide to them the
// card's info tip shows. One place for both, so the explanation can never
// drift from what the rules in lib/highlights-data.ts actually do. Pure, so
// the server and the browser can both read it.

/** Every window the Highlights card is judged for. "live" is the Live page's
    rolling 24 hours; the rest are the timeline's calendar periods. */
export type HighlightPeriod =
	| "live"
	| "day"
	| "week"
	| "month"
	| "year"
	| "all";

/** How far back a rule looks, in each period's own unit: days for Live and
    Day, weeks for Week, months for Month. A year always looks at the one
    before it. */
export type Lookback = { days: number; weeks: number; months: number };

export type HighlightThresholds = {
	/** Rare: heard before, with at most this many records ever. */
	rareMax: number;
	/** Regular: heard in at least this many periods in a row, this one
	    included -- or, for a year or all time, on more than this share of its
	    days. */
	consistent: Lookback & { yearShare: number; allTimeShare: number };
	/** Gone quiet: heard in each period of the lookback, not in the window. */
	goneQuiet: Lookback;
	/** Returned: silent for the whole lookback, heard in the window. */
	returned: Lookback;
	/** Vocal: this many times its usual count per period over the lookback,
	    with at least this many detections, from a bird heard on at least this
	    share of the lookback's recorded days. */
	vocal: Lookback & { ratio: number; minDetections: number; presence: number };
};

/** Every lookback is the same short stretch -- ten days for Live and Day, the
    one week, month or year before -- so the rules agree on what "before"
    means. Regular asks for a longer run, so it stays news. */
export const HIGHLIGHT_THRESHOLDS: HighlightThresholds = {
	rareMax: 5,
	consistent: {
		days: 10,
		weeks: 10,
		months: 3,
		yearShare: 75,
		allTimeShare: 75,
	},
	goneQuiet: { days: 10, weeks: 1, months: 1 },
	returned: { days: 10, weeks: 1, months: 1 },
	vocal: {
		days: 10,
		weeks: 1,
		months: 1,
		ratio: 3,
		minDetections: 10,
		presence: 25,
	},
};

/**
 * How many whole periods before the window a rule looks at: the setting in
 * the period's own unit, one for a year, none for all time (nothing comes
 * before it).
 */
export function lookbackFor(lookback: Lookback, period: HighlightPeriod) {
	switch (period) {
		case "live":
		case "day":
			return lookback.days;
		case "week":
			return lookback.weeks;
		case "month":
			return lookback.months;
		case "year":
			return 1;
		case "all":
			return 0;
	}
}

/** One line of the info tip: a highlight's name and what earns it. */
export type HighlightGuideEntry = { name: string; meaning: string };

const UNIT: Record<
	Exclude<HighlightPeriod, "all">,
	{ one: string; this: string; last: string }
> = {
	live: { one: "day", this: "today", last: "yesterday" },
	day: { one: "day", this: "this day", last: "the day before" },
	week: { one: "week", this: "this week", last: "last week" },
	month: { one: "month", this: "this month", last: "last month" },
	year: { one: "year", this: "this year", last: "last year" },
};

/**
 * What each line on the card means for this period, in a sentence apiece --
 * the basics, not every guard. Lines a period never shows are left out.
 */
export function highlightGuide(
	period: HighlightPeriod,
	thresholds: HighlightThresholds = HIGHLIGHT_THRESHOLDS,
): HighlightGuideEntry[] {
	const busiest = {
		name: "Busiest hour",
		meaning: "The hour with the most detections.",
	};
	if (period === "all")
		return [
			busiest,
			{
				name: "Regular",
				meaning: `Heard on over ${thresholds.consistent.allTimeShare}% of all the days the station has recorded.`,
			},
		];

	const unit = UNIT[period];
	// "the past 10 days" or, for a single period, "last week".
	const past = (lookback: Lookback) => {
		const n = lookbackFor(lookback, period);
		return n === 1 ? unit.last : `the past ${n} ${unit.one}s`;
	};
	const run = lookbackFor(thresholds.consistent, period);

	return [
		{
			name: "Up or down",
			meaning:
				period === "live"
					? "Detections and species in the last 24 hours against the 24 before."
					: `Detections and species ${unit.this} against ${unit.last}.`,
		},
		busiest,
		{ name: "New", meaning: "Recorded here for the first time ever." },
		{
			name: "Rare",
			meaning: `Heard before, but no more than ${thresholds.rareMax} times ever.`,
		},
		{
			name: "Regular",
			meaning:
				period === "year"
					? `Heard on over ${thresholds.consistent.yearShare}% of days this year.`
					: `Heard every ${unit.one} for at least ${run} ${unit.one}s in a row.`,
		},
		{
			name: "Gone quiet",
			meaning:
				lookbackFor(thresholds.goneQuiet, period) === 1
					? `Heard ${unit.last}, but not ${unit.this}.`
					: `Heard every ${unit.one} of ${past(thresholds.goneQuiet)}, but not ${unit.this}.`,
		},
		{
			name: "Returned",
			meaning: `Heard before, silent ${lookbackFor(thresholds.returned, period) === 1 ? "all" : "for"} ${past(thresholds.returned)}, and back ${unit.this}.`,
		},
		{
			name: "Vocal",
			meaning: `Heard at least ${thresholds.vocal.ratio}× as much as usual, compared with ${past(thresholds.vocal)}.`,
		},
	];
}
