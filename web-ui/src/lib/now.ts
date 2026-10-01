import { createServerFn } from "@tanstack/react-start";
import { and, avg, count, desc, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import { audioUrlFor } from "~/lib/audio.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import {
	countVisits,
	groupVisits,
	localTimestamp,
	timestampToMillis,
	type Visit,
} from "~/lib/visits.ts";

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

/**
 * One visit in the log: a species' unbroken stretch of detections (see
 * visits.ts), so a robin singing for twenty minutes is one row, not forty.
 */
export type RecentVisit = {
	/** The species and the visit's first detection, so it stays put as the
	    visit grows and the page can tell a newly arrived row from one it has
	    already shown. */
	key: string;
	comName: string;
	sciName: string;
	speciesSlug: string;
	imageUrl: string | null;
	/** The visit's first and latest detections, "YYYY-MM-DD HH:MM:SS". */
	firstAt: string;
	lastAt: string;
	/** Age of the latest detection at query time. */
	ageMs: number;
	detections: number;
	/** The visit's most confident detection, and that detection's recording --
	    the one worth playing. */
	confidence: number | null;
	audioUrl: string | null;
};

export type NowSnapshot = {
	/** When the server built this snapshot, as "YYYY-MM-DD HH:MM:SS" local. */
	generatedAt: string;
	/** The newest detection of the last 24 hours, or null when the window is
	    empty -- the page is about the last day, and an older bird is not news. */
	current: CurrentBird | null;
	/** Whether the station has ever recorded anything, so an empty window can
	    tell a quiet day from a station that has yet to hear its first bird. */
	hasAnyDetections: boolean;
	summary: NowSummary;
	/** The window's visits, most recently heard first, less the one the hero
	    is showing: each bird sits in one place at a time, and moves down into
	    the log when the next arrives. */
	recent: RecentVisit[];
	/** Every row the log can page through: the window's visits, less the
	    hero's own. */
	recentTotal: number;
};

/** One page of the log beneath the hero, aged against `generatedAt`. */
export type RecentPage = {
	page: number;
	recent: RecentVisit[];
	recentTotal: number;
	generatedAt: string;
};

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
		// Confidence is averaged over the species' whole history rather than the
		// window, so one lone detection today doesn't stand in for the species.
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
		illustrationUrlFor(latest.sciName, "flight"),
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

type WindowRow = LatestRow & { timestamp: string };

const detectionColumns = {
	comName: detections.Com_Name,
	sciName: detections.Sci_Name,
	date: detections.Date,
	detectedAt,
	confidence: detections.Confidence,
	fileName: detections.File_Name,
};

/** The newest detection of the last 24 hours, if there was one. */
async function getLatestRow(): Promise<LatestRow | undefined> {
	const [latest] = await db
		.select(detectionColumns)
		.from(detections)
		.where(isLast24h)
		.orderBy(desc(detections.Date), desc(detections.Time))
		.limit(1);
	return latest;
}

async function hasAnyDetections(): Promise<boolean> {
	const [row] = await db
		.select({ rowId: sql<number>`rowid` })
		.from(detections)
		.limit(1);
	return row !== undefined;
}

/**
 * Every detection in the window, folded into visits, newest first. `log` is
 * the same list less the visit the hero is showing -- the one whose latest
 * detection is the hero's own. A day of detections is a few thousand rows at
 * most, so clustering them on each poll stays cheap.
 */
async function getWindowVisits(heroKey: string | undefined) {
	const rows: WindowRow[] = (
		await db.select(detectionColumns).from(detections).where(isLast24h)
	).map((row) => ({ ...row, timestamp: row.detectedAt }));

	const visits = groupVisits(rows);
	const log = visits.filter(
		(visit) =>
			detectionKey(visit.moments[visit.moments.length - 1]) !== heroKey,
	);
	return { rows, visits, log };
}

/** One page of the log, newest first, aged against `generatedAtMs`. */
function buildRecentPage(
	log: Visit<WindowRow>[],
	page: number,
	generatedAtMs: number,
): Promise<RecentVisit[]> {
	const start = (page - 1) * RECENT_PAGE_SIZE;
	return Promise.all(
		log.slice(start, start + RECENT_PAGE_SIZE).map(async (visit) => {
			const first = visit.moments[0];
			const last = visit.moments[visit.moments.length - 1];
			const best = visit.moments.reduce((top, moment) =>
				(moment.confidence ?? -1) > (top.confidence ?? -1) ? moment : top,
			);
			return {
				key: `${visit.comName}-${first.detectedAt}`,
				comName: visit.comName,
				sciName: last.sciName,
				speciesSlug: comNameToSlug(visit.comName),
				imageUrl: illustrationUrlFor(last.sciName, "perched"),
				firstAt: first.detectedAt,
				lastAt: last.detectedAt,
				ageMs: generatedAtMs - timestampToMillis(last.detectedAt),
				detections: visit.moments.length,
				confidence: best.confidence,
				audioUrl: audioUrlFor(best.date, best.comName, best.fileName),
			};
		}),
	);
}

export const getNowSnapshot = createServerFn({ method: "GET" }).handler(
	async (): Promise<NowSnapshot> => {
		// Read the clock once, so every age in the snapshot is measured from the
		// same instant and the client can re-base them all off one offset.
		const generatedAtDate = new Date();
		const generatedAtMs = generatedAtDate.getTime();

		// Everything, the hero included, is bounded to the last 24 hours: a bird
		// heard two days ago leaves the page to its quiet state instead.
		const latest = await getLatestRow();
		const [current, window, anyDetections] = await Promise.all([
			latest ? buildCurrentBird(latest, generatedAtMs) : null,
			getWindowVisits(latest ? detectionKey(latest) : undefined),
			latest ? true : hasAnyDetections(),
		]);

		return {
			generatedAt: localTimestamp(generatedAtDate),
			current,
			hasAnyDetections: anyDetections,
			summary: { detections: window.rows.length },
			recent: await buildRecentPage(window.log, 1, generatedAtMs),
			recentTotal: window.log.length,
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
		const latest = await getLatestRow();
		const { log } = await getWindowVisits(
			latest ? detectionKey(latest) : undefined,
		);
		return {
			page,
			recent: await buildRecentPage(log, page, generatedAtDate.getTime()),
			recentTotal: log.length,
			generatedAt: localTimestamp(generatedAtDate),
		};
	});
