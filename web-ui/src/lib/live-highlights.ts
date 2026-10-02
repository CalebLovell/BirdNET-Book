import { createServerFn } from "@tanstack/react-start";
import { count, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import {
	HIGHLIGHT_THRESHOLDS,
	lookbackFor,
} from "~/lib/highlight-thresholds.ts";
import {
	type DayTally,
	type Highlight,
	judgeHighlights,
} from "~/lib/highlights-data.ts";
import { detectedAt, isLast24h } from "~/lib/now.ts";
import { timestampToMillis } from "~/lib/visits.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything before the rolling 24-hour window the rest of the page uses. */
const isBeforeWindow = sql`${detectedAt} < datetime('now', '-24 hours', 'localtime')`;

/** Which 24-hour slice back from now a detection falls in: 0 is the window
    itself, 1 the 24 hours before it, and so on. The Live page's "days". */
const daySlice = sql<number>`cast(julianday('now', 'localtime') - julianday(${detectedAt}) as integer)`;

export type LiveHighlights = {
	/** False for a station that has never recorded anything -- the hero card
	    above already says so, far more plainly than this card could. */
	hasAnyDetections: boolean;
	highlights: Highlight[];
};

/**
 * The last 24 hours' highlights, by the same rules -- the same function -- the
 * timeline's Highlights card applies to a Day: each 24-hour slice back from
 * now stands in for a calendar day.
 *
 * Deliberately not part of getNowSnapshot: the Live page repolls that every
 * ten seconds, and none of these judgements can change that fast. This runs
 * from the route loader alone, which is also what keeps its full-table scans
 * off the polling path.
 */
export const getLiveHighlights = createServerFn({ method: "GET" }).handler(
	async (): Promise<LiveHighlights> => {
		const settings = HIGHLIGHT_THRESHOLDS;
		// One clock read for every age in the card, so two lines can never
		// disagree about how long a bird has been away.
		const nowMs = Date.now();
		const longest = Math.max(
			1,
			lookbackFor(settings.consistent, "live") - 1,
			lookbackFor(settings.goneQuiet, "live"),
			lookbackFor(settings.returned, "live"),
			lookbackFor(settings.vocal, "live"),
		);

		const [windowRows, historyRows, hourRows, sliceRows, streakRows, [volume]] =
			await Promise.all([
				db
					.select({
						comName: detections.Com_Name,
						firstInWindow: sql<string>`min(${detectedAt})`,
					})
					.from(detections)
					.where(isLast24h)
					.groupBy(detections.Com_Name),
				// Life before the window, per species: how often it has been heard and
				// when it was last heard.
				db
					.select({
						comName: detections.Com_Name,
						countBefore: count(),
						lastBefore: sql<string>`max(${detectedAt})`,
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
				// The window and the longest lookback as 24-hour slices, per species.
				db
					.select({
						slice: daySlice,
						comName: detections.Com_Name,
						count: count(),
					})
					.from(detections)
					.where(
						sql`${detectedAt} >= datetime('now', ${`-${longest + 1} days`}, 'localtime')`,
					)
					.groupBy(daySlice, detections.Com_Name),
				// Every 24-hour slice before the window each species was heard in,
				// back to the station's first: what a Consistent bird's run is
				// counted against.
				db
					.select({ slice: daySlice, comName: detections.Com_Name })
					.from(detections)
					.where(isBeforeWindow)
					.groupBy(daySlice, detections.Com_Name),
				db.select({ allTimeCount: count() }).from(detections),
			]);

		if (!volume || volume.allTimeCount === 0) {
			return { hasAnyDetections: false, highlights: [] };
		}

		const slices: DayTally[] = Array.from(
			{ length: longest + 1 },
			() => new Map(),
		);
		for (const row of sliceRows) {
			if (row.slice < 0 || row.slice > longest) continue;
			slices[row.slice].set(row.comName, row.count);
		}

		const daysBetween = (fromMs: number, toMs: number) =>
			Math.floor((toMs - fromMs) / DAY_MS);
		const firstInWindow = new Map(
			windowRows.map((row) => [row.comName, row.firstInWindow]),
		);
		const lifetime = new Map<string, number>();
		const awayDays = new Map<string, number>();
		const silentDays = new Map<string, number>();
		for (const row of historyRows) {
			const lastMs = timestampToMillis(row.lastBefore);
			const first = firstInWindow.get(row.comName);
			lifetime.set(
				row.comName,
				row.countBefore + (slices[0].get(row.comName) ?? 0),
			);
			if (first)
				awayDays.set(
					row.comName,
					daysBetween(lastMs, timestampToMillis(first)),
				);
			else silentDays.set(row.comName, daysBetween(lastMs, nowMs));
		}
		for (const [comName, n] of slices[0])
			if (!lifetime.has(comName)) lifetime.set(comName, n);

		// Slice 1 first: the 24 hours before the window, then the 24 before that.
		const oldestSlice = Math.max(0, ...streakRows.map((row) => row.slice));
		const history = Array.from(
			{ length: oldestSlice },
			() => new Set<string>(),
		);
		for (const { slice, comName } of streakRows)
			if (slice >= 1) history[slice - 1].add(comName);

		const hourCounts = Array<number>(24).fill(0);
		for (const row of hourRows) hourCounts[Number(row.hour)] = row.count;

		const { highlights } = judgeHighlights(
			{
				period: "live",
				window: [slices[0]],
				before: slices.slice(1).map((slice) => [slice]),
				history,
				hourCounts,
				lifetime,
				heardBefore: new Set(historyRows.map((row) => row.comName)),
				awayDays,
				silentDays,
			},
			settings,
		);

		return { hasAnyDetections: true, highlights };
	},
);
