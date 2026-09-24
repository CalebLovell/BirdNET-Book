import { createServerFn } from "@tanstack/react-start";
import { avg, desc, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import { audioUrlFor } from "~/lib/audio.ts";
import { ebirdUrlFor } from "~/lib/ebird.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import {
	type CatalogSpecies,
	findCatalogSpeciesBySlug,
} from "~/lib/species-catalog.ts";
import { loadInstalledSpeciesCatalog } from "~/lib/species-control.server.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import { buildHourActivity, type HourActivity } from "~/lib/stats-data.ts";
import {
	getDetectionYears,
	getMonthlyTrend,
	getYearTrend,
	type TrendPoint,
} from "~/lib/trend.ts";
import { localTimestamp, timestampToMillis } from "~/lib/visits.ts";
import { getSpeciesInfo } from "~/lib/wikipedia.ts";

export type { HourActivity };
export type Visit = {
	date: string;
	time: string;
	confidence: number | null;
	audioUrl?: string | null;
};
/**
 * A visit the log renders as "4:13 AM / 27 minutes ago". The age is measured
 * on the server, the same way the Today page measures its rows, so both sides of
 * hydration render an identical label from identical data.
 */
export type RecentVisit = Visit & { ageMs: number };

/** The species' highest-confidence detection, featured with a spectrogram. */
export type BestRecording = {
	date: string;
	time: string;
	confidence: number | null;
	audioUrl: string | null;
};

export type SpeciesDetail = {
	comName: string;
	sciName: string;
	imageUrl: string | null;
	ebirdUrl: string;
	totalDetections: number;
	availableYears: number[];
	firstDetected: Visit;
	lastDetected: Visit;
	averageConfidence: number | null;
	/** Per-day counts for the selected year, which the heat map draws. */
	history: TrendPoint[];
	/** Every detection by calendar month, all years folded together. */
	detectionTrend: TrendPoint[];
	/** Every detection by hour of day, like the stats page's chart. */
	hourActivity: HourActivity[];
	/** The single cleanest clip -- highest confidence, all-time. */
	bestRecording: BestRecording | null;
	recentVisits: RecentVisit[];
	/** When the visit ages were measured, for `useAgeOffset` to advance them. */
	generatedAt: string;
	/** The visit log page the URL asked for, clamped to the pages that exist,
	 * so a deep link server-renders the right rows. */
	visitLog: VisitPage;
};

// The slug drops punctuation, so it cannot be turned back into a common name by
// string surgery. Instead the station's distinct names -- a few hundred at most
// -- are slugged and matched, which also means a name we haven't anticipated the
// punctuation of still resolves.
async function resolveComName(slug: string): Promise<string | null> {
	const rows = await db
		.selectDistinct({ comName: detections.Com_Name })
		.from(detections);

	return (
		rows.find((row) => comNameToSlug(row.comName) === slug)?.comName ?? null
	);
}

function byComName(comName: string) {
	return sql`${detections.Com_Name} = ${comName}`;
}

/** Every detection of this species by hour of day, scoped exactly like the
 * stats page's chart so the two read the same way. */
async function getHourActivity(
	filter: ReturnType<typeof byComName>,
): Promise<HourActivity[]> {
	const rows = await db
		.select({
			hour: sql<string>`strftime('%H', ${detections.Time})`,
			count: sql<number>`count(*)`,
		})
		.from(detections)
		.where(filter)
		.groupBy(sql`strftime('%H', ${detections.Time})`);

	return buildHourActivity(
		rows.map((row) => ({ hour: Number(row.hour), count: row.count })),
	);
}

/** Visits per page of the visit log. */
export const VISITS_PAGE_SIZE = 10;

/** One page of this species' visits, newest first, aged against `now`. */
async function getVisitPage(
	comName: string,
	page: number,
	now: Date,
): Promise<RecentVisit[]> {
	const rows = await db
		.select({
			date: detections.Date,
			time: detections.Time,
			confidence: detections.Confidence,
			fileName: detections.File_Name,
		})
		.from(detections)
		.where(byComName(comName))
		.orderBy(desc(detections.Date), desc(detections.Time))
		.limit(VISITS_PAGE_SIZE)
		.offset((page - 1) * VISITS_PAGE_SIZE);

	return rows.map((visit) => ({
		date: visit.date,
		time: visit.time,
		confidence: visit.confidence,
		audioUrl: audioUrlFor(visit.date, comName, visit.fileName),
		ageMs: now.getTime() - timestampToMillis(`${visit.date} ${visit.time}`),
	}));
}

export type VisitPage = {
	page: number;
	visits: RecentVisit[];
	generatedAt: string;
};

/** How many visit-log pages a species with `total` detections fills. */
export function visitPageCount(total: number): number {
	return Math.max(1, Math.ceil(total / VISITS_PAGE_SIZE));
}

function toPageNumber(page: number): number {
	return Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
}

/**
 * A later page of the visit log. The detail loader already carries page one,
 * so this only runs when someone steps back through the species' history --
 * which reaches all the way to its first detection, not just the selected year.
 */
export const getSpeciesVisits = createServerFn({ method: "GET" })
	.validator((input: { comName: string; page: number }) => ({
		comName: input.comName,
		page: toPageNumber(input.page),
	}))
	.handler(async ({ data: { comName, page } }): Promise<VisitPage> => {
		const now = new Date();
		return {
			page,
			visits: await getVisitPage(comName, page, now),
			generatedAt: localTimestamp(now),
		};
	});

/**
 * What a `/species/$comName` slug turned out to name.
 *
 * `undetected` is the interesting one: a bird the installed classifier knows
 * about but this station has never heard. That is a legitimate page -- you can
 * reasonably go looking for a bird you are still waiting on -- and reporting it
 * as an error would be a lie.
 */
export type SpeciesDetailResult =
	| { status: "detected"; detail: SpeciesDetail }
	| { status: "undetected"; comName: string; sciName: string }
	| { status: "unknown" };

/**
 * The bird a slug names according to the model's labels, or null.
 *
 * `loadInstalledSpeciesCatalog` throws when the model directory or the
 * localisation file cannot be read. That is swallowed on purpose: a station
 * with a broken model install should still tell someone their species URL
 * matched nothing, rather than escalating a typo into a claim that the whole
 * station is down. Species Control is the page that reports a broken catalog.
 */
async function resolveCatalogSpecies(
	slug: string,
): Promise<CatalogSpecies | null> {
	try {
		const catalog = await loadInstalledSpeciesCatalog();
		return findCatalogSpeciesBySlug(slug, catalog);
	} catch {
		return null;
	}
}

/** Both misses -- an unresolvable name and a name with zero rows -- ask the
 * catalog the same question, so they share one path. */
async function missToResult(slug: string): Promise<SpeciesDetailResult> {
	const known = await resolveCatalogSpecies(slug);
	if (!known) return { status: "unknown" };
	return {
		status: "undetected",
		comName: known.comName,
		sciName: known.sciName,
	};
}

export type SpeciesDetailInput = {
	comNameSlug: string;
	year: number;
	/** Which page of the visit log to include alongside page one. */
	visitsPage?: number;
};

export const getSpeciesDetail = createServerFn({ method: "GET" })
	.validator((input: SpeciesDetailInput) => input)
	.handler(
		async ({
			data: { comNameSlug, year, visitsPage = 1 },
		}): Promise<SpeciesDetailResult> => {
			const resolved = await resolveComName(comNameSlug);
			if (!resolved) return missToResult(comNameSlug);

			const filter = byComName(resolved);
			const generatedAtDate = new Date();

			const [totals] = await db
				.select({
					comName: detections.Com_Name,
					sciName: detections.Sci_Name,
					totalDetections: sql<number>`count(*)`,
					averageConfidence: avg(detections.Confidence),
				})
				.from(detections)
				.where(filter)
				.groupBy(detections.Com_Name, detections.Sci_Name);

			if (!totals || totals.totalDetections === 0) {
				return missToResult(comNameSlug);
			}
			const comName = totals.comName;
			const logPage = Math.min(
				toPageNumber(visitsPage),
				visitPageCount(totals.totalDetections),
			);

			const [
				[first],
				[last],
				[best],
				recentVisits,
				availableYears,
				history,
				detectionTrend,
				hourActivity,
				{ imageUrl: wikiImageUrl },
				logVisits,
			] = await Promise.all([
				db
					.select({
						date: detections.Date,
						time: detections.Time,
						confidence: detections.Confidence,
					})
					.from(detections)
					.where(filter)
					.orderBy(detections.Date, detections.Time)
					.limit(1),
				db
					.select({
						date: detections.Date,
						time: detections.Time,
						confidence: detections.Confidence,
					})
					.from(detections)
					.where(filter)
					.orderBy(desc(detections.Date), desc(detections.Time))
					.limit(1),
				db
					.select({
						date: detections.Date,
						time: detections.Time,
						confidence: detections.Confidence,
						fileName: detections.File_Name,
					})
					.from(detections)
					.where(filter)
					// The cleanest clip is the highest-confidence one; ties break toward
					// the most recent, since that clip is likeliest to still be on disk.
					.orderBy(desc(detections.Confidence), desc(detections.Date))
					.limit(1),
				getVisitPage(comName, 1, generatedAtDate),
				getDetectionYears(filter),
				getYearTrend(year, filter),
				getMonthlyTrend(filter),
				getHourActivity(filter),
				getSpeciesInfo(comName),
				// Page one is already in hand as `recentVisits`; only a deeper page
				// costs a second query.
				logPage === 1 ? null : getVisitPage(comName, logPage, generatedAtDate),
			]);
			const generatedAt = localTimestamp(generatedAtDate);

			const detail: SpeciesDetail = {
				comName,
				sciName: totals.sciName,
				imageUrl: illustrationUrlFor(totals.sciName, "flight") ?? wikiImageUrl,
				ebirdUrl: ebirdUrlFor(totals.sciName, comName),
				totalDetections: totals.totalDetections,
				availableYears,
				firstDetected: first ?? { date: "", time: "", confidence: null },
				lastDetected: last ?? { date: "", time: "", confidence: null },
				averageConfidence: totals.averageConfidence
					? Number(totals.averageConfidence)
					: null,
				history,
				detectionTrend,
				hourActivity,
				bestRecording: best
					? {
							date: best.date,
							time: best.time,
							confidence: best.confidence,
							audioUrl: audioUrlFor(best.date, comName, best.fileName),
						}
					: null,
				recentVisits,
				generatedAt,
				visitLog: {
					page: logPage,
					visits: logVisits ?? recentVisits,
					generatedAt,
				},
			};

			return { status: "detected", detail };
		},
	);
