// Calendar windows for the timeline page. Pure date math on "YYYY-MM-DD" day
// strings -- no db imports -- so the period switcher and the server loader can
// share one definition of what "the week of..." means. All arithmetic runs in
// UTC on date-only values, which keeps a window's edges from sliding when the
// browser and the station disagree about the local zone.

import type { TimelinePeriod } from "~/lib/timeline-periods.ts";

/**
 * The value a period's picker round-trips through the URL:
 * day "2026-07-28", week "2026-W31" (ISO, Monday-based, matching
 * `<input type="week">`), month "2026-07", year "2026". "all" has no anchor.
 */
export type TimelineAnchor = string;

export type TimelineWindow = {
	/** Inclusive first calendar day, "YYYY-MM-DD". */
	start: string;
	/** Inclusive last calendar day, "YYYY-MM-DD". */
	end: string;
	/** Human label for headings and empty states, e.g. "July 2026". */
	label: string;
};

const DAY_MS = 86_400_000;

const ANCHOR_PATTERNS: Record<TimelinePeriod, RegExp> = {
	day: /^\d{4}-\d{2}-\d{2}$/,
	week: /^\d{4}-W\d{2}$/,
	month: /^\d{4}-\d{2}$/,
	year: /^\d{4}$/,
	// Never parsed; "all" spans everything the station has.
	all: /^$/,
};

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});
const RANGE_DAY = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

function utcDate(day: string): Date {
	return new Date(`${day}T00:00:00Z`);
}

function dayString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function shiftDays(day: string, delta: number): string {
	return dayString(new Date(utcDate(day).getTime() + delta * DAY_MS));
}

/** Monday of the ISO week containing `day`. */
function isoWeekMonday(day: string): Date {
	const date = utcDate(day);
	// getUTCDay() is Sunday-based; ISO weeks start Monday.
	const offset = (date.getUTCDay() + 6) % 7;
	return new Date(date.getTime() - offset * DAY_MS);
}

/**
 * The ISO week anchor for a day. The week belongs to whichever year holds its
 * Thursday, so the last days of December can land in week 1 of the next year.
 */
function isoWeekAnchor(day: string): TimelineAnchor {
	const monday = isoWeekMonday(day);
	const thursday = new Date(monday.getTime() + 3 * DAY_MS);
	const year = thursday.getUTCFullYear();
	const firstThursday = new Date(
		isoWeekMonday(`${year}-01-04`).getTime() + 3 * DAY_MS,
	);
	const week =
		1 +
		Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
	return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday of the week an ISO anchor names, inverting {@link isoWeekAnchor}. */
function isoWeekAnchorMonday(anchor: TimelineAnchor): Date {
	const year = Number(anchor.slice(0, 4));
	const week = Number(anchor.slice(6));
	// Jan 4th is always in ISO week 1, so its Monday anchors the year.
	const week1Monday = isoWeekMonday(`${year}-01-04`);
	return new Date(week1Monday.getTime() + (week - 1) * 7 * DAY_MS);
}

export function isValidAnchor(period: TimelinePeriod, anchor: string): boolean {
	if (period === "all") return true;
	if (!ANCHOR_PATTERNS[period].test(anchor)) return false;

	// The shape is right; reject values that name a day or week that doesn't
	// exist ("2026-02-31", "2026-W53" in a 52-week year) by round-tripping them
	// through the calendar and requiring the same string back.
	switch (period) {
		case "day": {
			const parsed = utcDate(anchor);
			return !Number.isNaN(parsed.getTime()) && dayString(parsed) === anchor;
		}
		case "week": {
			const monday = isoWeekAnchorMonday(anchor);
			return (
				!Number.isNaN(monday.getTime()) &&
				isoWeekAnchor(dayString(monday)) === anchor
			);
		}
		case "month": {
			const month = Number(anchor.slice(5, 7));
			return month >= 1 && month <= 12;
		}
		case "year":
			return true;
	}
}

const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});
const SHORT_MONTH = new Intl.DateTimeFormat("en-US", {
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});

/**
 * The anchor as the timeline's date stepper names it -- "Sep 23, 2026",
 * "Week 39, 2026", "Sep 2026", "2026" -- shorter than the browser's own picker
 * text ("09/23/2026", "September 2026"). `compact` squeezes the one word that
 * can give, "Week" to "Wk", for a phone.
 */
export function shortAnchorLabel(
	period: Exclude<TimelinePeriod, "all">,
	anchor: TimelineAnchor,
	{ compact = false }: { compact?: boolean } = {},
): string {
	switch (period) {
		case "day":
			return SHORT_DAY.format(utcDate(anchor));
		case "week":
			return `${compact ? "Wk" : "Week"} ${Number(anchor.slice(6))}, ${anchor.slice(0, 4)}`;
		case "month":
			return SHORT_MONTH.format(utcDate(`${anchor}-01`));
		case "year":
			return anchor;
	}
}

/** The anchor for the period containing `day`, used to snap between periods. */
export function anchorForDay(
	period: TimelinePeriod,
	day: string,
): TimelineAnchor {
	switch (period) {
		case "day":
			return day;
		case "week":
			return isoWeekAnchor(day);
		case "month":
			return day.slice(0, 7);
		case "year":
			return day.slice(0, 4);
		case "all":
			return "";
	}
}

/** The anchor for the period containing today, the default when none is set. */
export function currentAnchor(
	period: TimelinePeriod,
	now: Date = new Date(),
): TimelineAnchor {
	// Local parts, not UTC: "today" means the station operator's today.
	const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	return anchorForDay(period, local);
}

/**
 * The inclusive day range an anchor covers, plus the label that names it.
 * "all" has no anchor to resolve and returns null -- callers skip the date
 * filter and fall back to their own wording.
 */
export function windowFor(
	period: "all",
	anchor: TimelineAnchor,
): TimelineWindow | null;
export function windowFor(
	period: Exclude<TimelinePeriod, "all">,
	anchor: TimelineAnchor,
): TimelineWindow;
export function windowFor(
	period: TimelinePeriod,
	anchor: TimelineAnchor,
): TimelineWindow | null;
export function windowFor(
	period: TimelinePeriod,
	anchor: TimelineAnchor,
): TimelineWindow | null {
	switch (period) {
		case "day":
			return {
				start: anchor,
				end: anchor,
				label: DAY_LABEL.format(utcDate(anchor)),
			};
		case "week": {
			const monday = isoWeekAnchorMonday(anchor);
			const start = dayString(monday);
			const end = shiftDays(start, 6);
			return {
				start,
				end,
				label: `${RANGE_DAY.format(monday)} – ${RANGE_DAY.format(utcDate(end))}, ${utcDate(end).getUTCFullYear()}`,
			};
		}
		case "month": {
			const start = `${anchor}-01`;
			// Day 0 of the next month is the last day of this one.
			const year = Number(anchor.slice(0, 4));
			const month = Number(anchor.slice(5, 7));
			const end = dayString(new Date(Date.UTC(year, month, 0)));
			return { start, end, label: MONTH_LABEL.format(utcDate(start)) };
		}
		case "year":
			return {
				start: `${anchor}-01-01`,
				end: `${anchor}-12-31`,
				label: anchor,
			};
		case "all":
			return null;
	}
}

/**
 * The first day of the calendar period immediately before the one `anchor`
 * names, at the same granularity: the day before for "day", the Monday a week
 * back for "week", the first of last month, the first of last year. Null for
 * "all", which has no period before it. Stepped back repeatedly to find the
 * stretch a window's highlights compare it with (see precedingWindows).
 */
export function previousPeriodStart(
	period: TimelinePeriod,
	anchor: TimelineAnchor,
): string | null {
	const window = windowFor(period, anchor);
	if (!window) return null;
	// A day one step before this window's start lands in the previous period;
	// resolving that day back to a window gives the period's own first day.
	const dayInPrevPeriod = shiftDays(window.start, -1);
	return (
		windowFor(period, anchorForDay(period, dayInPrevPeriod))?.start ?? null
	);
}

/** Calendar days from `start` to `end` inclusive; zero or less when `end` comes
    first. */
export function daysInRange(start: string, end: string): number {
	return (
		Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / DAY_MS) + 1
	);
}

/** `day` moved `delta` days, as a day string. */
export function addDays(day: string, delta: number): string {
	return shiftDays(day, delta);
}

/**
 * The `count` whole periods just before the one `anchor` names, nearest first:
 * the stretch a window's highlights call "usual". Empty for "all", which has
 * nothing before it.
 */
export function precedingWindows(
	period: TimelinePeriod,
	anchor: TimelineAnchor,
	count: number,
): TimelineWindow[] {
	const windows: TimelineWindow[] = [];
	let current = anchor;
	for (let step = 0; step < count; step++) {
		const start = previousPeriodStart(period, current);
		if (start == null) break;
		current = anchorForDay(period, start);
		const window = windowFor(period, current);
		if (window) windows.push(window);
	}
	return windows;
}

/**
 * What a window's highlights compare it with, per period. Long enough that one
 * odd stretch can't set the bar on its own, but short enough to stay in the
 * same season: a day against the fortnight before, a week against the four
 * before (one week alone swings with whatever happens to be passing through),
 * and a month or a year against the one just before it.
 */
const COMPARISON: Record<
	Exclude<TimelinePeriod, "all">,
	{ periods: number; label: string | null }
> = {
	day: { periods: 14, label: "the two weeks before" },
	week: { periods: 4, label: "the four weeks before" },
	// Named after the period itself: "September 2026", "2025".
	month: { periods: 1, label: null },
	year: { periods: 1, label: null },
};

export type Comparison = {
	/** How many whole periods the stretch spans. */
	periods: number;
	/** How the activity line names the stretch: "the four weeks before",
	    "September 2026", "the same stretch of 2025". */
	label: string;
	/** The stretch's periods, nearest first. For a month or year still in
	    progress, each is cut to as many days as the window has finished. */
	windows: TimelineWindow[];
	/** First day of the whole stretch, uncut. A species last heard before this
	    was away for all of it, so hearing it in the window is a return. */
	start: string;
	/** Whether the window is still running (it ends today or later). */
	inProgress: boolean;
	/** The window's last finished day: yesterday for a window still running. */
	lastComplete: string;
};

/**
 * The stretch a window is judged against -- the one "before" that every
 * highlight line shares, so "returned", "more than usual" and "gone quiet" all
 * mean the same thing within a period. Null for "all", which has no before.
 *
 * A month or year still running is compared with the same days of the one
 * before -- the year so far against last year to the same date -- because a
 * part-year judged against a whole one is mostly measuring the seasons it
 * hasn't reached yet. A day or week is short enough not to need that.
 */
export function comparisonFor(
	period: TimelinePeriod,
	anchor: TimelineAnchor,
	today: string,
): Comparison | null {
	if (period === "all") return null;
	const window = windowFor(period, anchor);
	const { periods, label } = COMPARISON[period];
	const whole = precedingWindows(period, anchor, periods);
	const oldest = whole.at(-1);
	if (!oldest) return null;

	const inProgress = window.end >= today;
	const lastComplete = inProgress ? shiftDays(today, -1) : window.end;
	const finished = daysInRange(window.start, lastComplete);
	const cut = periods === 1 && inProgress && finished > 0;
	const windows = cut
		? whole.map((w) => {
				const end = shiftDays(w.start, finished - 1);
				return { ...w, end: end < w.end ? end : w.end };
			})
		: whole;

	const named = label ?? whole[0].label;
	return {
		periods,
		label: cut ? `the same stretch of ${named}` : named,
		windows,
		start: oldest.start,
		inProgress,
		lastComplete,
	};
}
