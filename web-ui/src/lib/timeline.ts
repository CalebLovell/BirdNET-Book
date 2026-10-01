import { and, lt, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import { dayIdFor } from "~/lib/day.ts";
import { ebirdUrlFor } from "~/lib/ebird.ts";
import {
	buildHighlights,
	type Highlight,
	type HighlightFacts,
	RARE_LIFETIME_MAX,
	RETURN_AFTER_DAYS,
	ROUTINE_MIN_SHARE,
	ROUTINE_SILENT_DAYS,
	vocalRatio,
} from "~/lib/highlights-data.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import type { TimelinePeriod } from "~/lib/timeline-periods.ts";
import {
	addDays,
	anchorForDay,
	daysInRange,
	precedingWindows,
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
	 * A rare visitor here: its lifetime detection count at this station is at or
	 * below RARE_LIFETIME_MAX, regardless of the selected window, and it is not a
	 * first-ever arrival (see isNew) -- the two flags divide the species between
	 * them rather than both landing on a newcomer. Matches the threshold the Live
	 * page's Highlights use.
	 */
	isRare: boolean;
	/**
	 * Back after time away: the station had heard this species before, but not
	 * for RETURN_AFTER_DAYS or more before its first detection in this window.
	 * The same rule the Live page's Highlights use. Excludes newcomers (isNew)
	 * and rare visitors (isRare), so each species carries at most one of the
	 * three flags -- a returning regular, not a bird that is barely ever here
	 * anyway. Always false on "all time", which has no "before".
	 */
	isReturned: boolean;
	/** How many days the species was away before this window heard it again.
	    Null unless isReturned. */
	daysAway: number | null;
	/**
	 * How many times its usual daily rate the window heard this species at, when
	 * that's at least VOCAL_RATIO -- judged against the same stretch before the
	 * window as the Highlights' activity line. Null otherwise, and always for a
	 * New, Rare or Returned species: at most one flag each.
	 */
	vocalRatio: number | null;
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
 * The stretch before a window that its activity is judged against: how many
 * whole periods back, and how the sentence names them. Long enough that one
 * odd period can't set the bar on its own; a year is compared with the one
 * before it, since four years back is more history than most stations have.
 */
const BASELINE: Record<
	Exclude<TimelinePeriod, "all">,
	{ periods: number; label: string }
> = {
	day: { periods: 14, label: "the two weeks before" },
	week: { periods: 4, label: "the four weeks before" },
	month: { periods: 4, label: "the four months before" },
	year: { periods: 1, label: "the year before" },
};

/**
 * Plain-function form, so `timeline-page.ts` can compose the rows with the extra
 * queries a period needs without paying for a second round trip.
 */
export async function loadTimelineData({
	period,
	anchor,
}: TimelineRequest): Promise<TimelineData> {
	const window = windowFor(period, anchor);
	const inWindow = window
		? and(
				sql`${detections.Date} >= ${window.start}`,
				sql`${detections.Date} <= ${window.end}`,
			)
		: undefined;

	const baseline = period === "all" ? null : BASELINE[period];
	const baselineWindows = baseline
		? precedingWindows(period, anchor, baseline.periods)
		: [];
	const baselineStart = baselineWindows.at(-1)?.start ?? null;

	const [
		rows,
		dayRows,
		beforeRows,
		confidenceRows,
		lifetimeRows,
		baselineRows,
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
		// The window day by day, per species: when each bird first turned up in
		// it (for how long it had been away), and which days are already over
		// (for the pace of a window still running). "All time" needs neither.
		window
			? db
					.select({
						date: detections.Date,
						comName: detections.Com_Name,
						count: sql<number>`count(*)`,
					})
					.from(detections)
					.where(inWindow)
					.groupBy(detections.Date, detections.Com_Name)
			: Promise.resolve([]),
		// The last day each species was heard before this window opened. A species
		// missing from this list is one the window introduced (isNew); one whose
		// last visit came long enough before its first one in the window has
		// returned from an absence (isReturned). "All time" has no "before".
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
		// The stretch before the window, day by day per species: what "usual"
		// means for the window's pace, its species count and its regulars.
		window && baselineStart
			? db
					.select({
						date: detections.Date,
						comName: detections.Com_Name,
						count: sql<number>`count(*)`,
					})
					.from(detections)
					.where(
						and(
							sql`${detections.Date} >= ${baselineStart}`,
							lt(detections.Date, window.start),
						),
					)
					.groupBy(detections.Date, detections.Com_Name)
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

	const firstDayByName = new Map<string, string>();
	for (const row of dayRows) {
		const first = firstDayByName.get(row.comName);
		if (!first || row.date < first) firstDayByName.set(row.comName, row.date);
	}

	const lastBeforeByName = new Map(
		beforeRows.map((row) => [row.comName, row.lastBefore]),
	);

	const avgConfidenceByName = new Map(
		confidenceRows.map((row) => [row.comName, row.avgConfidence]),
	);
	const lifetimeByName = new Map(
		lifetimeRows.map((row) => [row.comName, row.lifetime]),
	);

	const usual =
		window && baseline
			? summarizeBaseline({
					window,
					baseline,
					baselineWindows,
					dayRows,
					baselineRows,
					stationFirst: nav.stationRange?.first ?? null,
				})
			: null;

	const withImages = await Promise.all(
		Array.from(bySpecies.values()).map(async (entry) => {
			const totalDetections = entry.hourCounts.reduce((a, b) => a + b, 0);
			// New, Rare, Returned and Vocal divide the species between them rather
			// than stacking: a first-ever arrival is "New"; failing that, a bird
			// heard only a handful of times ever is "Rare"; failing that, one away
			// long enough before this window is "Returned"; failing that, one heard
			// far more than its usual is "Vocal". The guards encode that order.
			const lastBefore = lastBeforeByName.get(entry.comName);
			const isNew = window !== null && lastBefore == null;
			const isRare =
				!isNew && (lifetimeByName.get(entry.comName) ?? 0) <= RARE_LIFETIME_MAX;
			const firstDay = firstDayByName.get(entry.comName);
			const away =
				lastBefore != null && firstDay != null
					? daysInRange(lastBefore, firstDay) - 1
					: null;
			const isReturned =
				!isNew && !isRare && away != null && away >= RETURN_AFTER_DAYS;
			const ratio =
				!isNew && !isRare && !isReturned && usual?.sufficient
					? vocalRatio({
							windowCount: usual.windowCountByName.get(entry.comName) ?? 0,
							windowDays: usual.windowDays,
							baselineCount: usual.baselineCountByName.get(entry.comName) ?? 0,
							baselineDays: usual.baselineDays,
						})
					: null;
			return {
				comName: entry.comName,
				sciName: entry.sciName,
				imageUrl: illustrationUrlFor(entry.sciName),
				ebirdUrl: ebirdUrlFor(entry.sciName, entry.comName),
				totalDetections,
				hourCounts: entry.hourCounts,
				isNew,
				firstHeard: isNew ? (firstDay ?? null) : null,
				averageConfidence: avgConfidenceByName.get(entry.comName) ?? null,
				isRare,
				isReturned,
				daysAway: isReturned ? away : null,
				vocalRatio: ratio,
			};
		}),
	);
	const sorted = withImages.sort(
		(a, b) => b.totalDetections - a.totalDetections,
	);

	return {
		rows: sorted,
		highlights: buildHighlights(
			highlightFacts({
				rows: sorted,
				window,
				baseline,
				usual,
				lastBeforeByName,
				lifetimeByName,
			}),
		),
		...nav,
	};
}

type DaySpeciesCount = { date: string; comName: string; count: number };

type BaselineSummary = ReturnType<typeof summarizeBaseline>;

/**
 * What "usual" means for a window: the stretch before it, period by period,
 * set against the window's own finished days. Shared by the activity line, the
 * Vocal flag and the regulars, so all three judge against the same stretch.
 */
function summarizeBaseline({
	window,
	baseline,
	baselineWindows,
	dayRows,
	baselineRows,
	stationFirst,
}: {
	window: TimelineWindow;
	baseline: { periods: number; label: string };
	/** The periods before the window, nearest first. */
	baselineWindows: TimelineWindow[];
	dayRows: DaySpeciesCount[];
	baselineRows: DaySpeciesCount[];
	stationFirst: string | null;
}) {
	// Days before the station first recorded can't have heard anything, so they
	// don't count toward a period's length -- a station's first, partial month
	// isn't judged as a whole one.
	const recordedFrom = (start: string) =>
		stationFirst && stationFirst > start ? stationFirst : start;

	// The baseline, period by period, and the days each species was heard on.
	const periods = baselineWindows.map(() => ({
		detections: 0,
		species: new Set<string>(),
		bySpecies: new Map<string, number>(),
	}));
	const daysHeard = new Map<string, Set<string>>();
	for (const row of baselineRows) {
		const period =
			periods[
				baselineWindows.findIndex(
					(w) => row.date >= w.start && row.date <= w.end,
				)
			];
		if (period) {
			period.detections += row.count;
			period.species.add(row.comName);
			period.bySpecies.set(
				row.comName,
				(period.bySpecies.get(row.comName) ?? 0) + row.count,
			);
		}
		const days = daysHeard.get(row.comName) ?? new Set<string>();
		days.add(row.date);
		daysHeard.set(row.comName, days);
	}

	// A period with nothing in it is the station being down (or not yet set
	// up), not a silent spell, so it's left out of the average rather than
	// dragging it down.
	const recorded = baselineWindows.flatMap((w, index) =>
		periods[index].detections > 0
			? [
					{
						...periods[index],
						days: Math.max(1, daysInRange(recordedFrom(w.start), w.end)),
					},
				]
			: [],
	);
	const baselineCountByName = new Map<string, number>();
	for (const period of recorded) {
		for (const [comName, n] of period.bySpecies) {
			baselineCountByName.set(
				comName,
				(baselineCountByName.get(comName) ?? 0) + n,
			);
		}
	}

	// A window still running is judged on its finished days alone: today's
	// count is only as far as the clock has got, and a dawn-heavy morning would
	// read as a boom. Today's own Day window has no finished days yet -- the
	// Live page covers it.
	const today = dayIdFor(new Date());
	const inProgress = window.end >= today;
	const lastComplete = inProgress ? addDays(today, -1) : window.end;
	const windowCountByName = new Map<string, number>();
	for (const row of dayRows) {
		if (row.date > lastComplete) continue;
		windowCountByName.set(
			row.comName,
			(windowCountByName.get(row.comName) ?? 0) + row.count,
		);
	}

	const oldest = baselineWindows.at(-1);
	const nearest = baselineWindows[0];
	const windowDays = daysInRange(recordedFrom(window.start), lastComplete);

	return {
		label: baseline.label,
		/** Enough of the baseline was recorded, and enough of the window is over,
		    to judge the window against it at all. */
		sufficient:
			recorded.length >= Math.ceil(baseline.periods / 2) && windowDays > 0,
		inProgress,
		today,
		windowDays,
		windowCountByName,
		windowDetections: Array.from(windowCountByName.values()).reduce(
			(sum, n) => sum + n,
			0,
		),
		baselineDays: recorded.reduce((sum, p) => sum + p.days, 0),
		baselineDetections: recorded.reduce((sum, p) => sum + p.detections, 0),
		baselineSpecies: recorded.length
			? recorded.reduce((sum, p) => sum + p.species.size, 0) / recorded.length
			: 0,
		baselineCountByName,
		daysHeard,
		/** The baseline's full length, recorded or not: the bar for a routine. */
		fullBaselineDays:
			oldest && nearest ? daysInRange(oldest.start, nearest.end) : 0,
	};
}

/**
 * The window's evidence for the shared highlight rules. The birds come straight
 * off the rows' flags; the activity comparison and the regulars need the
 * baseline summary.
 */
function highlightFacts({
	rows,
	window,
	baseline,
	usual,
	lastBeforeByName,
	lifetimeByName,
}: {
	rows: TimelineRow[];
	window: TimelineWindow | null;
	baseline: { periods: number; label: string } | null;
	usual: BaselineSummary | null;
	lastBeforeByName: Map<string, string>;
	lifetimeByName: Map<string, number>;
}): HighlightFacts {
	const hourCounts = Array.from({ length: 24 }, (_, hour) =>
		rows.reduce((sum, row) => sum + (row.hourCounts[hour] ?? 0), 0),
	);

	const facts: HighlightFacts = {
		detections: hourCounts.reduce((sum, n) => sum + n, 0),
		hourCounts,
		newSpecies: rows.filter((row) => row.isNew).map((row) => row.comName),
		returning: rows
			.flatMap((row) =>
				row.isReturned && row.daysAway != null
					? [{ comName: row.comName, daysAway: row.daysAway }]
					: [],
			)
			.sort((a, b) => b.daysAway - a.daysAway),
		rare: rows
			.filter((row) => row.isRare)
			.map((row) => ({
				comName: row.comName,
				lifetimeCount: lifetimeByName.get(row.comName) ?? row.totalDetections,
			}))
			.sort((a, b) => a.lifetimeCount - b.lifetimeCount),
		vocal: rows
			.flatMap((row) =>
				row.vocalRatio != null
					? [{ comName: row.comName, ratio: row.vocalRatio }]
					: [],
			)
			.sort((a, b) => b.ratio - a.ratio),
		breakingRoutine: [],
		activity: null,
	};

	if (!window || !baseline || !usual) return facts;

	if (usual.sufficient) {
		facts.activity = {
			baselineLabel: usual.label,
			windowPerDay: usual.windowDetections / usual.windowDays,
			baselinePerDay: usual.baselineDetections / usual.baselineDays,
			windowDetections: usual.windowDetections,
			inProgress: usual.inProgress,
			windowSpecies: rows.length,
			baselineSpecies: usual.baselineSpecies,
		};
	}

	// Regulars gone quiet: heard on most of the baseline's days, not once in the
	// window, and silent long enough to notice. The bar is the baseline's full
	// length, so a station too new to have a routine has no regulars.
	const minDays = Math.ceil(ROUTINE_MIN_SHARE * usual.fullBaselineDays);
	const heardInWindow = new Set(rows.map((row) => row.comName));
	const silentUntil = usual.inProgress ? usual.today : window.end;
	facts.breakingRoutine = Array.from(usual.daysHeard.entries())
		.flatMap(([comName, days]) => {
			if (heardInWindow.has(comName) || days.size < minDays) return [];
			const lastBefore = lastBeforeByName.get(comName);
			if (!lastBefore) return [];
			const daysSilent = daysInRange(lastBefore, silentUntil) - 1;
			return daysSilent >= ROUTINE_SILENT_DAYS
				? [{ comName, daysSilent, daysHeard: days.size }]
				: [];
		})
		.sort((a, b) => b.daysHeard - a.daysHeard);

	return facts;
}
