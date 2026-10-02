import { and, lt, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import { dayIdFor } from "~/lib/day.ts";
import { ebirdUrlFor } from "~/lib/ebird.ts";
import {
	type HighlightThresholds,
	lookbackFor,
} from "~/lib/highlight-thresholds.ts";
import {
	type DayTally,
	type Highlight,
	judgeHighlights,
	type VocalJump,
} from "~/lib/highlights-data.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import type { TimelinePeriod } from "~/lib/timeline-periods.ts";
import {
	addDays,
	anchorForDay,
	daysInRange,
	precedingWindows,
	previousPeriodStart,
	type TimelineAnchor,
	type TimelineWindow,
	windowFor,
} from "~/lib/timeline-window.ts";

/**
 * Calendar windows, not rolling ones: "Weekly" means a specific Mon-Sun week
 * the picker names, so the page can be stepped through history rather than
 * only ever showing the trailing N hours.
 */
export type TimelineRequest = {
	period: TimelinePeriod;
	/** Ignored when the period is "all". See {@link TimelineAnchor}. */
	anchor: TimelineAnchor;
};

export type TimelineRow = {
	comName: string;
	sciName: string;
	imageUrl: string | null;
	ebirdUrl: string;
	totalDetections: number;
	hourCounts: number[];
	/**
	 * The station had never recorded this species before the window opened, so
	 * this window is where it first arrived. Always false on "all time", where
	 * every species is trivially first heard inside the window.
	 */
	isNew: boolean;
	/** The day a New species was first recorded, "YYYY-MM-DD" -- its first day
	    in this window. Null unless isNew. */
	firstHeard: string | null;
	/** Mean detection confidence across this window, 0–1. Null when the window
	    holds no scored detections for the species. */
	averageConfidence: number | null;
	/**
	 * Heard before the window, with only a handful of records ever (the
	 * station's Rare threshold). Never on a first-ever arrival, and never on
	 * "all time", whose list is every species' lifetime count already.
	 */
	isRare: boolean;
	/** Heard every day of the lookback and the window -- or, for a year or all
	    time, on most of its days. See lib/highlights-data.ts. */
	isConsistent: boolean;
	/** A Consistent bird's run: "15 days in a row", or "82% of days" for a
	    year or all time. Null unless isConsistent. */
	streak: string | null;
	/** Heard before, silent for the whole lookback, back in the window. */
	isReturned: boolean;
	/** How long the species was away before this window heard it again, in
	    the window's own unit ("3 weeks"). Null unless isReturned. */
	away: string | null;
	/** Heard far more than its usual daily rate over the lookback. Null
	    otherwise. Every flag stacks: a bird carries all it qualifies for. */
	vocal: VocalJump | null;
};

export type TimelineData = {
	rows: TimelineRow[];
	/** What the window is worth remarking on -- see lib/highlights-data.ts. */
	highlights: Highlight[];
	/** The resolved window, or null on "all time". */
	window: TimelineWindow | null;
	/**
	 * Anchors for the nearest neighbouring windows that actually hold
	 * detections, so the step arrows always land on something. Null when there
	 * is nothing further in that direction, which is what disables the arrow --
	 * this skips over silent stretches instead of walking the user through them.
	 */
	prevAnchor: TimelineAnchor | null;
	nextAnchor: TimelineAnchor | null;
	/**
	 * The day a period switch re-anchors on: the latest one inside this window
	 * that holds detections, or the nearest one outside it when the window is
	 * empty. Anchoring on the window's own start instead would drop Yearly onto
	 * January 1st -- a dead month for most stations -- so the switch follows the
	 * data. Null only when the station has never recorded anything.
	 */
	lastActiveDay: string | null;
	/**
	 * First and last day the station ever recorded, used to bound the picker.
	 * Null when it has never recorded anything.
	 */
	stationRange: { first: string; last: string } | null;
	/**
	 * Whether the station has ever recorded anything, regardless of the selected
	 * window. An empty window is not the same as an empty station -- the page
	 * needs the difference so it only hides the switcher when there is genuinely
	 * nothing to switch to.
	 */
	hasAnyDetections: boolean;
};

/**
 * Where a window sits in the station's history: what it can step to, what a
 * period switch should re-anchor on, and how far the picker may range. Every
 * period-scoped view needs this, including the day view -- which loads its
 * body from `day.ts` and would otherwise have no way to draw the toolbar
 * above it -- so it lives on its own rather than inside the rows query.
 */
export type TimelineNav = Pick<
	TimelineData,
	| "window"
	| "prevAnchor"
	| "nextAnchor"
	| "lastActiveDay"
	| "stationRange"
	| "hasAnyDetections"
>;

export async function loadTimelineNav(
	period: TimelinePeriod,
	window: TimelineWindow | null,
): Promise<TimelineNav> {
	const [[neighbours], [stationBounds]] = await Promise.all([
		// The nearest recorded day on either side of the window (what the step
		// arrows snap to) and the latest one inside it (what a period switch
		// re-anchors on), in a single pass over the dates.
		window
			? db
					.select({
						prev: sql<
							string | null
						>`max(case when ${detections.Date} < ${window.start} then ${detections.Date} end)`,
						next: sql<
							string | null
						>`min(case when ${detections.Date} > ${window.end} then ${detections.Date} end)`,
						inside: sql<
							string | null
						>`max(case when ${detections.Date} between ${window.start} and ${window.end} then ${detections.Date} end)`,
					})
					.from(detections)
			: Promise.resolve([{ prev: null, next: null, inside: null }]),
		db
			.select({
				first: sql<string | null>`min(${detections.Date})`,
				last: sql<string | null>`max(${detections.Date})`,
			})
			.from(detections),
	]);

	return {
		window,
		prevAnchor: neighbours.prev ? anchorForDay(period, neighbours.prev) : null,
		nextAnchor: neighbours.next ? anchorForDay(period, neighbours.next) : null,
		// Preferring what's inside the window keeps the switch where the user is
		// looking; the neighbours only stand in for an empty window, so changing
		// granularity can't strand them somewhere with nothing to show. "All
		// time" spans everything, making the station's last day its own.
		lastActiveDay: window
			? (neighbours.inside ?? neighbours.next ?? neighbours.prev)
			: stationBounds.last,
		stationRange:
			stationBounds.first && stationBounds.last
				? { first: stationBounds.first, last: stationBounds.last }
				: null,
		hasAnyDetections: stationBounds.first !== null,
	};
}

/**
 * Plain-function form, so `timeline-page.ts` can compose the rows with the extra
 * queries a period needs without paying for a second round trip. The station's
 * highlight thresholds come in from there, since reading the station config is
 * server-only work this module doesn't import.
 */
export async function loadTimelineData({
	period,
	anchor,
	settings,
}: TimelineRequest & { settings: HighlightThresholds }): Promise<TimelineData> {
	const window = windowFor(period, anchor);
	const inWindow = window
		? and(
				sql`${detections.Date} >= ${window.start}`,
				sql`${detections.Date} <= ${window.end}`,
			)
		: undefined;
	const today = dayIdFor(new Date());

	// Whole periods before the window, as many as the longest lookback any rule
	// asks for -- and at least the one just before, for the up/down line.
	const longest = Math.max(
		1,
		lookbackFor(settings.consistent, period) - 1,
		lookbackFor(settings.goneQuiet, period),
		lookbackFor(settings.returned, period),
		lookbackFor(settings.vocal, period),
	);
	const beforeWindows =
		period === "all" ? [] : precedingWindows(period, anchor, longest);
	const tallyFrom = beforeWindows.at(-1)?.start ?? window?.start ?? null;

	// Which period each detection falls in, as that period's first day -- the
	// same "YYYY-MM-DD" a window's start is -- so a species' whole history
	// reduces to the days, weeks or months it was heard in. A year or all time
	// counts no runs, so needs none.
	const periodStart =
		period === "day"
			? sql<string>`${detections.Date}`
			: period === "week"
				? sql<string>`date(${detections.Date}, '-' || ((cast(strftime('%w', ${detections.Date}) as integer) + 6) % 7) || ' days')`
				: period === "month"
					? sql<string>`strftime('%Y-%m-01', ${detections.Date})`
					: null;

	const [
		rows,
		tallyRows,
		beforeRows,
		confidenceRows,
		lifetimeRows,
		historyRows,
		nav,
	] = await Promise.all([
		db
			.select({
				comName: detections.Com_Name,
				sciName: detections.Sci_Name,
				hour: sql<string>`strftime('%H', ${detections.Time})`,
				count: sql<number>`count(*)`,
			})
			.from(detections)
			.where(inWindow)
			.groupBy(
				detections.Com_Name,
				detections.Sci_Name,
				sql`strftime('%H', ${detections.Time})`,
			),
		// Every day from the start of the longest lookback to the window's end,
		// per species: the evidence every highlight rule reads. All time takes
		// every day there is.
		db
			.select({
				date: detections.Date,
				comName: detections.Com_Name,
				count: sql<number>`count(*)`,
			})
			.from(detections)
			.where(
				window && tallyFrom
					? and(
							sql`${detections.Date} >= ${tallyFrom}`,
							sql`${detections.Date} <= ${window.end}`,
						)
					: undefined,
			)
			.groupBy(detections.Date, detections.Com_Name),
		// The last day each species was heard before this window opened. A
		// species missing from this list is one the window introduced; the
		// rest have a history to have been away from or gone quiet against.
		// "All time" has no "before".
		window
			? db
					.select({
						comName: detections.Com_Name,
						lastBefore: sql<string>`max(${detections.Date})`,
					})
					.from(detections)
					.where(lt(detections.Date, window.start))
					.groupBy(detections.Com_Name)
			: Promise.resolve([]),
		// Mean confidence per species inside the window.
		db
			.select({
				comName: detections.Com_Name,
				avgConfidence: sql<number | null>`avg(${detections.Confidence})`,
			})
			.from(detections)
			.where(inWindow)
			.groupBy(detections.Com_Name),
		// Lifetime detection count per species, ignoring the window: what makes
		// a species a rare visitor here at all.
		db
			.select({
				comName: detections.Com_Name,
				lifetime: sql<number>`count(*)`,
			})
			.from(detections)
			.groupBy(detections.Com_Name),
		// Every period before this one each species was heard in, back to the
		// station's first: what a Consistent bird's run is counted against.
		window && periodStart
			? db
					.select({ start: periodStart, comName: detections.Com_Name })
					.from(detections)
					.where(lt(detections.Date, window.start))
					.groupBy(periodStart, detections.Com_Name)
			: Promise.resolve([]),
		loadTimelineNav(period, window),
	]);

	const bySpecies = new Map<
		string,
		{ comName: string; sciName: string; hourCounts: number[] }
	>();
	for (const row of rows) {
		let entry = bySpecies.get(row.comName);
		if (!entry) {
			entry = {
				comName: row.comName,
				sciName: row.sciName,
				hourCounts: Array(24).fill(0),
			};
			bySpecies.set(row.comName, entry);
		}
		entry.hourCounts[Number(row.hour)] = row.count;
	}

	const tallies = new Map<string, DayTally>();
	for (const row of tallyRows) {
		const day = tallies.get(row.date) ?? new Map<string, number>();
		day.set(row.comName, row.count);
		tallies.set(row.date, day);
	}
	const daysOf = (start: string, end: string): DayTally[] => {
		const days: DayTally[] = [];
		for (let day = start; day <= end; day = addDays(day, 1))
			days.push(tallies.get(day) ?? new Map());
		return days;
	};

	// The window's days run through today at the latest; all time's start at
	// the station's first.
	const windowStart = window?.start ?? nav.stationRange?.first ?? today;
	const windowEnd = window && window.end < today ? window.end : today;
	const windowDays = daysOf(windowStart, windowEnd);

	const firstDayByName = new Map<string, string>();
	for (const row of tallyRows) {
		if (row.date < windowStart || row.date > windowEnd) continue;
		const first = firstDayByName.get(row.comName);
		if (!first || row.date < first) firstDayByName.set(row.comName, row.date);
	}

	const awayDays = new Map<string, number>();
	const silentDays = new Map<string, number>();
	for (const { comName, lastBefore } of beforeRows) {
		const firstDay = firstDayByName.get(comName);
		if (firstDay) awayDays.set(comName, daysInRange(lastBefore, firstDay) - 1);
		else silentDays.set(comName, daysInRange(lastBefore, windowEnd) - 1);
	}

	const lifetimeByName = new Map(
		lifetimeRows.map((row) => [row.comName, row.lifetime]),
	);
	const hourCounts = Array.from({ length: 24 }, (_, hour) =>
		Array.from(bySpecies.values()).reduce(
			(sum, entry) => sum + (entry.hourCounts[hour] ?? 0),
			0,
		),
	);

	const { highlights, flags } = judgeHighlights(
		{
			period,
			window: windowDays,
			before: beforeWindows.map((w) => daysOf(w.start, w.end)),
			history: historyBefore(
				period,
				anchor,
				historyRows,
				nav.stationRange?.first ?? null,
			),
			hourCounts,
			lifetime: lifetimeByName,
			heardBefore: new Set(beforeRows.map((row) => row.comName)),
			awayDays,
			silentDays,
		},
		settings,
	);

	const avgConfidenceByName = new Map(
		confidenceRows.map((row) => [row.comName, row.avgConfidence]),
	);

	const withImages = Array.from(bySpecies.values()).map((entry) => {
		const flag = flags.get(entry.comName);
		return {
			comName: entry.comName,
			sciName: entry.sciName,
			imageUrl: illustrationUrlFor(entry.sciName),
			ebirdUrl: ebirdUrlFor(entry.sciName, entry.comName),
			totalDetections: entry.hourCounts.reduce((a, b) => a + b, 0),
			hourCounts: entry.hourCounts,
			isNew: flag?.isNew ?? false,
			firstHeard: flag?.isNew
				? (firstDayByName.get(entry.comName) ?? null)
				: null,
			averageConfidence: avgConfidenceByName.get(entry.comName) ?? null,
			isRare: flag?.isRare ?? false,
			isConsistent: flag?.isConsistent ?? false,
			streak: flag?.streak ?? null,
			isReturned: flag?.isReturned ?? false,
			away: flag?.away ?? null,
			vocal: flag?.vocal ?? null,
		};
	});

	return {
		rows: withImages.sort((a, b) => b.totalDetections - a.totalDetections),
		highlights,
		...nav,
	};
}

/**
 * Every period before the window, nearest first, back to the station's first:
 * the species heard in each. A period with no row at all comes back as an
 * empty set -- the station recording nothing then.
 */
function historyBefore(
	period: TimelinePeriod,
	anchor: TimelineAnchor,
	rows: { start: string; comName: string }[],
	stationFirst: string | null,
): Set<string>[] {
	if (!stationFirst || period === "all" || period === "year") return [];
	const heard = new Map<string, Set<string>>();
	for (const { start, comName } of rows) {
		const species = heard.get(start) ?? new Set<string>();
		species.add(comName);
		heard.set(start, species);
	}
	const firstPeriod = windowFor(
		period,
		anchorForDay(period, stationFirst),
	).start;
	const history: Set<string>[] = [];
	let current = anchor;
	for (;;) {
		const start = previousPeriodStart(period, current);
		if (start == null || start < firstPeriod) break;
		history.push(heard.get(start) ?? new Set());
		current = anchorForDay(period, start);
	}
	return history;
}
