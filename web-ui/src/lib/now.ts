import { createServerFn } from "@tanstack/react-start";
import { and, avg, count, desc, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import { audioUrlFor } from "~/lib/audio.ts";
import {
	type IllustrationPose,
	illustrationUrlFor,
} from "~/lib/illustrations.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import {
	countVisits,
	localTimestamp,
	timestampToMillis,
} from "~/lib/visits.ts";
import { getSpeciesInfo } from "~/lib/wikipedia.ts";

// Every figure on the Today page reads from one rolling 24-hour window rather
// than the calendar day, so no two cards can disagree -- and so the page still
// shows a full night of activity when someone checks it at 1am.
export const detectedAt = sql<string>`datetime(${detections.Date} || ' ' || ${detections.Time})`;
export const isLast24h = sql`datetime(${detections.Date} || ' ' || ${detections.Time}) >= datetime('now', '-24 hours', 'localtime')`;

export type NowSummary = {
	detections: number;
};

export type CurrentBird = {
	/** Same form as a RecentDetection's key, so the page can tell a new hero
	    bird from one it has already shown. */
	key: string;
	comName: string;
	sciName: string;
	speciesSlug: string;
	imageUrl: string | null;
	detectedAt: string;
	/** Age at query time, so the first paint already knows the right state. */
	ageMs: number;
	confidence: number | null;
	audioUrl: string | null;
	countLast24h: number;
	visitsLast24h: number;
	averageConfidence: number | null;
	firstHeardLast24h: string | null;
	allTimeCount: number;
};

export type RecentDetection = {
	key: string;
	comName: string;
	sciName: string;
	speciesSlug: string;
	imageUrl: string | null;
	detectedAt: string;
	ageMs: number;
	confidence: number | null;
	audioUrl: string | null;
};

export type NowSnapshot = {
	/** When the server built this snapshot, as "YYYY-MM-DD HH:MM:SS" local. */
	generatedAt: string;
	current: CurrentBird | null;
	summary: NowSummary;
	/** The window's detections newest first, less the one the hero is showing:
	    each bird sits in one place at a time, and moves down into the log when
	    the next arrives. */
	recent: RecentDetection[];
	/** Every row the log can page through: the window's detections, less the
	    hero's own. */
	recentTotal: number;
};

/** One page of the log beneath the hero, aged against `generatedAt`. */
export type RecentPage = {
	page: number;
	recent: RecentDetection[];
	recentTotal: number;
	generatedAt: string;
};

// The bundled kachō-e illustration when there is one, else Wikipedia's
// thumbnail. getSpeciesInfo memoizes per species, so polling this every ten
// seconds costs one network call per species per server lifetime.
async function imageUrlFor(
	sciName: string,
	comName: string,
	pose: IllustrationPose,
): Promise<string | null> {
	return (
		illustrationUrlFor(sciName, pose) ??
		(await getSpeciesInfo(comName)).imageUrl
	);
}

/** Rows per page of the log beneath the hero. */
export const RECENT_PAGE_SIZE = 15;

/** How many log pages `total` rows fill. */
export function recentPageCount(total: number): number {
	return Math.max(1, Math.ceil(total / RECENT_PAGE_SIZE));
}

type LatestRow = {
	comName: string;
	sciName: string;
	date: string;
	detectedAt: string;
	confidence: number | null;
	fileName: string;
};

function detectionKey(row: { detectedAt: string; fileName: string }): string {
	return `${row.detectedAt}-${row.fileName}`;
}

async function buildCurrentBird(
	latest: LatestRow,
	generatedAtMs: number,
): Promise<CurrentBird> {
	const isSameSpecies = sql`${detections.Com_Name} = ${latest.comName}`;

	const [[totals], [allTime], moments, imageUrl] = await Promise.all([
		db
			.select({
				countLast24h: count(),
				firstHeard: sql<
					string | null
				>`min(datetime(${detections.Date} || ' ' || ${detections.Time}))`,
			})
			.from(detections)
			.where(and(isLast24h, isSameSpecies)),
		// Confidence is averaged over the species' whole history, not the 24-hour
		// window: the hero shows the most recent detection however old it is, and
		// a window-scoped average reads as "--" for anything heard before it.
		db
			.select({
				allTimeCount: count(),
				averageConfidence: avg(detections.Confidence),
			})
			.from(detections)
			.where(isSameSpecies),
		db
			.select({ timestamp: detectedAt })
			.from(detections)
			.where(and(isLast24h, isSameSpecies)),
		imageUrlFor(latest.sciName, latest.comName, "flight"),
	]);

	return {
		key: detectionKey(latest),
		comName: latest.comName,
		sciName: latest.sciName,
		speciesSlug: comNameToSlug(latest.comName),
		imageUrl,
		detectedAt: latest.detectedAt,
		ageMs: generatedAtMs - timestampToMillis(latest.detectedAt),
		confidence: latest.confidence,
		audioUrl: audioUrlFor(latest.date, latest.comName, latest.fileName),
		countLast24h: totals.countLast24h,
		visitsLast24h: countVisits(moments.map((moment) => moment.timestamp)),
		averageConfidence:
			allTime.averageConfidence != null
				? Number(allTime.averageConfidence)
				: null,
		firstHeardLast24h: totals.firstHeard,
		allTimeCount: allTime.allTimeCount,
	};
}

/**
 * The hero always shows the station's newest detection, so whenever anything
 * has been heard inside the window, the window's newest row is the hero's and
 * the log starts one row in. With nothing in the window there is nothing to
 * skip, and nothing to list.
 */
function logTotal(windowCount: number): number {
	return Math.max(0, windowCount - 1);
}

/** One page of the log, newest first, aged against `generatedAtMs`. */
async function getRecentRows(
	page: number,
	windowCount: number,
	generatedAtMs: number,
): Promise<RecentDetection[]> {
	if (logTotal(windowCount) === 0) return [];

	const rows = await db
		.select({
			comName: detections.Com_Name,
			sciName: detections.Sci_Name,
			date: detections.Date,
			detectedAt,
			confidence: detections.Confidence,
			fileName: detections.File_Name,
		})
		.from(detections)
		.where(isLast24h)
		.orderBy(desc(detections.Date), desc(detections.Time))
		.limit(RECENT_PAGE_SIZE)
		// Past the hero's own row, which leads the window.
		.offset(1 + (page - 1) * RECENT_PAGE_SIZE);

	return Promise.all(
		rows.map(async (row) => ({
			key: detectionKey(row),
			comName: row.comName,
			sciName: row.sciName,
			speciesSlug: comNameToSlug(row.comName),
			imageUrl: await imageUrlFor(row.sciName, row.comName, "perched"),
			detectedAt: row.detectedAt,
			ageMs: generatedAtMs - timestampToMillis(row.detectedAt),
			confidence: row.confidence,
			audioUrl: audioUrlFor(row.date, row.comName, row.fileName),
		})),
	);
}

export const getNowSnapshot = createServerFn({ method: "GET" }).handler(
	async (): Promise<NowSnapshot> => {
		// Read the clock once, so every age in the snapshot is measured from the
		// same instant and the client can re-base them all off one offset.
		const generatedAtDate = new Date();
		const generatedAtMs = generatedAtDate.getTime();

		const [[latest], [{ detectionCount }]] = await Promise.all([
			// The one query deliberately NOT bounded to 24 hours: the hero card
			// names the most recent detection whatever its age, even if that was
			// days ago. Every other figure on the page respects the window.
			db
				.select({
					comName: detections.Com_Name,
					sciName: detections.Sci_Name,
					date: detections.Date,
					detectedAt,
					confidence: detections.Confidence,
					fileName: detections.File_Name,
				})
				.from(detections)
				.orderBy(desc(detections.Date), desc(detections.Time))
				.limit(1),
			db.select({ detectionCount: count() }).from(detections).where(isLast24h),
		]);

		const [current, recent] = await Promise.all([
			latest ? buildCurrentBird(latest, generatedAtMs) : null,
			getRecentRows(1, detectionCount, generatedAtMs),
		]);

		return {
			generatedAt: localTimestamp(generatedAtDate),
			current,
			summary: { detections: detectionCount },
			recent,
			recentTotal: logTotal(detectionCount),
		};
	},
);

function toPageNumber(page: number): number {
	return Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
}

/**
 * A later page of the log. The snapshot already carries page one, so this only
 * runs when someone steps back through the window.
 */
export const getRecentPage = createServerFn({ method: "GET" })
	.validator((input: { page: number }) => ({
		page: toPageNumber(input.page),
	}))
	.handler(async ({ data: { page } }): Promise<RecentPage> => {
		const generatedAtDate = new Date();
		const [{ detectionCount }] = await db
			.select({ detectionCount: count() })
			.from(detections)
			.where(isLast24h);
		return {
			page,
			recent: await getRecentRows(
				page,
				detectionCount,
				generatedAtDate.getTime(),
			),
			recentTotal: logTotal(detectionCount),
			generatedAt: localTimestamp(generatedAtDate),
		};
	});
