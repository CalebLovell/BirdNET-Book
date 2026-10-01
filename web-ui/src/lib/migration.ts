import { count, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import { audioUrlFor } from "~/lib/audio.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import {
	ARRIVAL_WINDOW_DAYS,
	type ArrivalSpecies,
	type MarkerDetection,
	MIGRATION_LIST_LIMIT,
	QUIET_AFTER_DAYS,
	type QuietSpecies,
	RESIDENT_MIN_DAYS,
} from "~/lib/migration-data.ts";
import { timestampToMillis } from "~/lib/visits.ts";

type MarkerRow = {
	comName: string;
	date: string;
	detectedAt: string;
	confidence: number | null;
	fileName: string;
};

/**
 * The single detection each row stands on, one per species.
 *
 * `edge` picks which end: "last" for the detection a quiet species fell silent
 * after, "first" for the one an arrival turned up on. The bare Date/Time/
 * Confidence/File_Name columns are not in the GROUP BY on purpose -- SQLite
 * guarantees that a query with exactly one min() or max() aggregate takes its
 * bare columns from the very row that matched, which is what makes this one
 * query rather than ten.
 */
async function getMarkerDetections(
	comNames: string[],
	edge: "first" | "last",
	windowFilter?: ReturnType<typeof sql>,
): Promise<Map<string, MarkerDetection>> {
	if (comNames.length === 0) return new Map();

	const detectedAt = sql<string>`${detections.Date} || ' ' || ${detections.Time}`;
	const pick =
		edge === "last" ? sql`max(${detectedAt})` : sql`min(${detectedAt})`;
	const scope = windowFilter
		? sql`${detections.Com_Name} in ${comNames} and (${windowFilter})`
		: sql`${detections.Com_Name} in ${comNames}`;

	const rows: MarkerRow[] = await db
		.select({
			comName: detections.Com_Name,
			date: detections.Date,
			detectedAt: sql<string>`${pick}`,
			confidence: detections.Confidence,
			fileName: detections.File_Name,
		})
		.from(detections)
		.where(scope)
		.groupBy(detections.Com_Name);

	// Ages all come off one clock reading, so no two rows in a card can disagree
	// about how long ago "now" was.
	const nowMs = Date.now();

	return new Map(
		rows.map((row) => [
			row.comName,
			{
				detectedAt: row.detectedAt,
				ageMs: nowMs - timestampToMillis(row.detectedAt),
				confidence: row.confidence,
				audioUrl: audioUrlFor(row.date, row.comName, row.fileName),
			},
		]),
	);
}

/** A species with no marker detection cannot happen -- every row here came from
 * a group that had at least one -- but the map lookup still has to resolve. */
const NO_MARKER: MarkerDetection = {
	detectedAt: "",
	ageMs: 0,
	confidence: null,
	audioUrl: null,
};

/**
 * Regular residents that have fallen silent: detected on enough separate days
 * to count as established, but not at all in the last two weeks. Ordered by
 * longest silence first, since that is the one most likely to have left.
 *
 * Dates come out of SQLite as local-time strings, so every boundary here is
 * computed with `'localtime'` to match them.
 */
export async function getQuietSpecies(): Promise<QuietSpecies[]> {
	const rows = await db
		.select({
			comName: detections.Com_Name,
			sciName: detections.Sci_Name,
			count: count(),
			lastSeen: sql<string>`max(${detections.Date})`,
		})
		.from(detections)
		.groupBy(detections.Com_Name, detections.Sci_Name)
		.having(
			sql`count(distinct ${detections.Date}) >= ${RESIDENT_MIN_DAYS}
			    and max(${detections.Date}) < date('now', 'localtime', ${`-${QUIET_AFTER_DAYS} days`})`,
		)
		.orderBy(sql`max(${detections.Date}) asc`, detections.Com_Name)
		.limit(MIGRATION_LIST_LIMIT);

	const markers = await getMarkerDetections(
		rows.map((row) => row.comName),
		"last",
	);

	return Promise.all(
		rows.map(async (row) => ({
			...row,
			...(markers.get(row.comName) ?? NO_MARKER),
			imageUrl: illustrationUrlFor(row.sciName),
		})),
	);
}

/**
 * Species heard in the last two weeks that were absent for the two weeks
 * before that -- first-ever sightings and returning migrants alike, which is
 * the mirror image of the quiet list. Ordered newest arrival first.
 *
 * The absence is checked against the preceding window only, not all history:
 * a bird that summered here last year and has just come back is exactly the
 * arrival this card exists to surface.
 */
export async function getNewArrivals(): Promise<ArrivalSpecies[]> {
	const recentStart = sql`date('now', 'localtime', ${`-${ARRIVAL_WINDOW_DAYS} days`})`;
	const priorStart = sql`date('now', 'localtime', ${`-${ARRIVAL_WINDOW_DAYS * 2} days`})`;
	const inWindow = sql`${detections.Date} >= ${recentStart}`;

	const rows = await db
		.select({
			comName: detections.Com_Name,
			sciName: detections.Sci_Name,
			count: count(),
			firstSeen: sql<string>`min(${detections.Date})`,
		})
		.from(detections)
		.where(inWindow)
		.groupBy(detections.Com_Name, detections.Sci_Name)
		.having(
			sql`${detections.Com_Name} not in (
				select ${detections.Com_Name} from ${detections}
				where ${detections.Date} >= ${priorStart} and ${detections.Date} < ${recentStart}
			)`,
		)
		.orderBy(sql`min(${detections.Date}) desc`, detections.Com_Name)
		.limit(MIGRATION_LIST_LIMIT);

	// Scoped to the window: the arrival is the first detection of *this* visit,
	// not of a stay the bird made a year ago.
	const markers = await getMarkerDetections(
		rows.map((row) => row.comName),
		"first",
		inWindow,
	);

	return Promise.all(
		rows.map(async (row) => ({
			...row,
			...(markers.get(row.comName) ?? NO_MARKER),
			imageUrl: illustrationUrlFor(row.sciName),
		})),
	);
}
