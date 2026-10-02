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
	/** Regular: for Live and Day, heard every day for at least `streakDays`
	    days straight, this one included; for a week or a month, on every
	    recorded day of it; for a year or all time, on more than `yearShare`% or
	    `allTimeShare`% of its days. */
	consistent: { streakDays: number; yearShare: number; allTimeShare: number };
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
    means. */
export const HIGHLIGHT_THRESHOLDS: HighlightThresholds = {
	rareMax: 5,
	consistent: { streakDays: 10, yearShare: 90, allTimeShare: 90 },
	goneQuiet: { days: 10, weeks: 3, months: 3 },
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
	// The card says "yesterday" for the day before any Day, so the guide does.
	day: { one: "day", this: "today", last: "yesterday" },
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
	const busiest = { name: "Busiest hour", meaning: "Most detections." };
	if (period === "all")
		return [
			busiest,
			{
				name: "Regular",
				meaning: `Heard on over ${thresholds.consistent.allTimeShare}% of days.`,
			},
		];

	const unit = UNIT[period];
	// "the past 10 days" or, for a single period, "last week".
	const past = (lookback: Lookback) => {
		const n = lookbackFor(lookback, period);
		return n === 1 ? unit.last : `the past ${n} ${unit.one}s`;
	};

	return [
		{
			name: "Up or down",
			meaning: `Compared with ${period === "live" ? "the 24 hours before" : unit.last}.`,
		},
		busiest,
		{ name: "New", meaning: "First record ever." },
		{ name: "Rare", meaning: `${thresholds.rareMax} or fewer records.` },
		{
			name: "Vocal",
			meaning: `${thresholds.vocal.ratio}× its usual, vs. ${past(thresholds.vocal)}.`,
		},
		{
			name: "Returned",
			meaning: `Silent ${past(thresholds.returned)}, back ${unit.this}.`,
		},
		{
			name: "Regular",
			meaning:
				period === "live" || period === "day"
					? `Heard ${thresholds.consistent.streakDays}+ days straight.`
					: period === "year"
						? `Heard on over ${thresholds.consistent.yearShare}% of days.`
						: `Heard every day ${unit.this}.`,
		},
		{
			name: "Gone quiet",
			meaning: `Heard ${past(thresholds.goneQuiet)}, not ${unit.this}.`,
		},
	];
}
