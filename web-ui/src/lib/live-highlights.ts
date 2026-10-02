import { createServerFn } from "@tanstack/react-start";
import { count, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import {
	buildHighlights,
	type Highlight,
	RARE_LIFETIME_MAX,
	RETURN_AFTER_DAYS,
	ROUTINE_MIN_SHARE,
	ROUTINE_SILENT_DAYS,
	vocalJump,
} from "~/lib/highlights-data.ts";
import { detectedAt, isLast24h } from "~/lib/now.ts";
import { timestampToMillis } from "~/lib/visits.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The fortnight the baseline averages over. It ends where the 24-hour window
 * begins, hence the 15 days in `isBaseline` below: day -15 to day -1 is the
 * fourteen whole days before the window, with no overlap to double-count.
 */
const BASELINE_DAYS = 14;

/** Everything before the rolling 24-hour window the rest of the page uses. */
const isBeforeWindow = sql`${detectedAt} < datetime('now', '-24 hours', 'localtime')`;

/** The fortnight before the window: what "usual" means for this station. */
const isBaseline = sql`${detectedAt} >= datetime('now', '-15 days', 'localtime') and ${isBeforeWindow}`;

/** Which 24-hour slice back from now a detection falls in: 0 is the window
    itself, 1-14 the fortnight before it. */
const daySlice = sql<number>`cast(julianday('now', 'localtime') - julianday(${detectedAt}) as integer)`;

export type LiveHighlights = {
	/** False for a station that has never recorded anything -- the hero card
	    above already says so, far more plainly than this card could. */
	hasAnyDetections: boolean;
	highlights: Highlight[];
};

/**
 * The last 24 hours' highlights, by the same rules the timeline's Highlights
 * card applies to a calendar window.
 *
 * Deliberately not part of getNowSnapshot: the Live page repolls that every
 * ten seconds, and none of these judgements can change that fast. This runs
 * from the route loader alone, which is also what keeps its full-table scans
 * off the polling path.
 */
export const getLiveHighlights = createServerFn({ method: "GET" }).handler(
	async (): Promise<LiveHighlights> => {
		// One clock read for every age in the card, so two lines can never
		// disagree about how long a bird has been away.
		const nowMs = Date.now();

		const [windowRows, historyRows, hourRows, sliceRows, [volume]] =
			await Promise.all([
				db
					.select({
						comName: detections.Com_Name,
						windowCount: count(),
						firstInWindow: sql<string>`min(${detectedAt})`,
					})
					.from(detections)
					.where(isLast24h)
					.groupBy(detections.Com_Name)
					.orderBy(sql`count(*) desc`),
				// Everything the rules need to know about life before the window, in
				// one grouped pass: how often a species has ever been heard, when it
				// was last heard, and how much of the last fortnight it was around for.
				db
					.select({
						comName: detections.Com_Name,
						countBefore: count(),
						lastBefore: sql<string>`max(${detectedAt})`,
						daysInFortnight: sql<number>`count(distinct case when ${isBaseline} then ${detections.Date} end)`,
						baselineCount: sql<number>`count(case when ${isBaseline} then 1 end)`,
					})
					.from(detections)
					.where(isBeforeWindow)
					.groupBy(detections.Com_Name),
				db
					.select({
						hour: sql<string>`strftime('%H', ${detections.Time})`,
						count: count(),
					})
					.from(detections)
					.where(isLast24h)
					.groupBy(sql`strftime('%H', ${detections.Time})`),
				// The fortnight as fourteen 24-hour slices, so the baseline can be a
				// daily rate and a daily species count.
				db
					.select({
						slice: daySlice,
						count: count(),
						species: sql<number>`count(distinct ${detections.Com_Name})`,
					})
					.from(detections)
					.where(isBaseline)
					.groupBy(daySlice),
				db.select({ allTimeCount: count() }).from(detections),
			]);

		if (!volume || volume.allTimeCount === 0) {
			return { hasAnyDetections: false, highlights: [] };
		}

		const history = new Map(historyRows.map((row) => [row.comName, row]));
		const heardInWindow = new Set(windowRows.map((row) => row.comName));
		const daysBetween = (fromMs: number, toMs: number) =>
			Math.floor((toMs - fromMs) / DAY_MS);

		const newSpecies = windowRows
			.filter((row) => !history.has(row.comName))
			.map((row) => row.comName);

		const rare = windowRows
			.flatMap((row) => {
				const before = history.get(row.comName);
				// New species are their own, better line -- never also "rare".
				if (!before) return [];
				const lifetimeCount = before.countBefore + row.windowCount;
				return lifetimeCount <= RARE_LIFETIME_MAX
					? [{ comName: row.comName, lifetimeCount }]
					: [];
			})
			.sort((a, b) => a.lifetimeCount - b.lifetimeCount);

		// A bird with three records ever has almost certainly also been away a
		// fortnight, so left alone these two lines name the same birds twice.
		// Rarity is the stronger claim, so it takes the bird.
		const isRare = new Set(rare.map((row) => row.comName));

		const returning = windowRows
			.flatMap((row) => {
				const before = history.get(row.comName);
				if (!before || isRare.has(row.comName)) return [];
				const daysAway = daysBetween(
					timestampToMillis(before.lastBefore),
					timestampToMillis(row.firstInWindow),
				);
				return daysAway >= RETURN_AFTER_DAYS
					? [{ comName: row.comName, daysAway }]
					: [];
			})
			.sort((a, b) => b.daysAway - a.daysAway);

		const routineMinDays = Math.ceil(ROUTINE_MIN_SHARE * BASELINE_DAYS);
		const breakingRoutine = historyRows
			.flatMap((row) => {
				if (heardInWindow.has(row.comName)) return [];
				if (row.daysInFortnight < routineMinDays) return [];
				const daysSilent = daysBetween(
					timestampToMillis(row.lastBefore),
					nowMs,
				);
				return daysSilent >= ROUTINE_SILENT_DAYS
					? [
							{
								comName: row.comName,
								daysSilent,
								daysInFortnight: row.daysInFortnight,
							},
						]
					: [];
			})
			.sort((a, b) => b.daysInFortnight - a.daysInFortnight);

		const hourCounts = Array<number>(24).fill(0);
		for (const row of hourRows) hourCounts[Number(row.hour)] = row.count;
		const windowDetections = hourCounts.reduce((sum, n) => sum + n, 0);

		// Slices with nothing in them are the station being down, not a silent
		// day, so they don't drag the average -- and a fortnight with too few
		// recorded days to call anything usual gets no comparison at all.
		const recorded = sliceRows.filter(
			(row) => row.slice >= 1 && row.slice <= BASELINE_DAYS && row.count > 0,
		);
		const sufficient = recorded.length >= BASELINE_DAYS / 2;

		// Heard far more than its own usual: the same rule the timeline's Vocal
		// flag applies, over the same recorded slices as the activity line.
		const isReturning = new Set(returning.map((row) => row.comName));
		const vocal = sufficient
			? windowRows
					.flatMap((row) => {
						const before = history.get(row.comName);
						if (!before || isRare.has(row.comName)) return [];
						if (isReturning.has(row.comName)) return [];
						const jump = vocalJump({
							windowCount: row.windowCount,
							windowDays: 1,
							baselineCount: before.baselineCount,
							baselineDays: recorded.length,
							daysHeard: before.daysInFortnight,
						});
						return jump == null ? [] : [{ comName: row.comName, ...jump }];
					})
					.sort((a, b) => b.ratio - a.ratio)
			: [];

		const activity = sufficient
			? {
					baselineLabel: "your two-week average",
					windowPerDay: windowDetections,
					baselinePerDay:
						recorded.reduce((sum, row) => sum + row.count, 0) / recorded.length,
					windowDetections,
					inProgress: false,
					windowSpecies: windowRows.length,
					baselineSpecies:
						recorded.reduce((sum, row) => sum + row.species, 0) /
						recorded.length,
				}
			: null;

		return {
			hasAnyDetections: true,
			highlights: buildHighlights({
				detections: windowDetections,
				hourCounts,
				newSpecies,
				returning,
				rare,
				vocal,
				comparedWith: sufficient ? "your two-week average" : null,
				breakingRoutine,
				activity,
			}),
		};
	},
);
