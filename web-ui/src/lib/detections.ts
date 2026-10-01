import { rm } from "node:fs/promises";
import { createServerFn } from "@tanstack/react-start";
import {
	and,
	asc,
	count,
	countDistinct,
	desc,
	gte,
	inArray,
	lte,
	or,
	sql,
} from "drizzle-orm";
import Fuse from "fuse.js";
import { db, openWritableDetectionsDb } from "~/db/index.ts";
import { type Detection, detections } from "~/db/schema.ts";
import { extractedDir } from "~/lib/audio.server.ts";
import { audioUrlFor } from "~/lib/audio.ts";
import { requireUnlocked } from "~/lib/auth.ts";
import {
	type DetectionClipIdentity,
	resolveDetectionClipPath,
} from "~/lib/detection-file-path.server.ts";
import {
	type DetectionWorkspaceSearch,
	normalizeDetectionWorkspaceSearch,
} from "~/lib/detection-workspace.ts";
import { ebirdUrlFor } from "~/lib/ebird.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";

const isToday = sql`${detections.Date} = date('now', 'localtime')`;
const isLastHour = sql`datetime(${detections.Date} || ' ' || ${detections.Time}) >= datetime('now', '-1 hour', 'localtime')`;

export type DetectionStats = {
	total: number;
	today: number;
	lastHour: number;
	speciesToday: number;
	speciesAllTime: number;
};

export const getDetectionStats = createServerFn({ method: "GET" }).handler(
	async (): Promise<DetectionStats> => {
		const [{ total }] = await db.select({ total: count() }).from(detections);
		const [{ today }] = await db
			.select({ today: count() })
			.from(detections)
			.where(isToday);
		const [{ lastHour }] = await db
			.select({ lastHour: count() })
			.from(detections)
			.where(isLastHour);
		const [{ speciesToday }] = await db
			.select({ speciesToday: countDistinct(detections.Com_Name) })
			.from(detections)
			.where(isToday);
		const [{ speciesAllTime }] = await db
			.select({ speciesAllTime: countDistinct(detections.Com_Name) })
			.from(detections);

		return { total, today, lastHour, speciesToday, speciesAllTime };
	},
);

export const getRecentDetections = createServerFn({ method: "GET" }).handler(
	async (): Promise<Detection[]> => {
		return db
			.select()
			.from(detections)
			.orderBy(desc(detections.Date), desc(detections.Time))
			.limit(50);
	},
);

export const getDetections = createServerFn({ method: "GET" }).handler(
	async (): Promise<Detection[]> => {
		return db
			.select()
			.from(detections)
			.orderBy(desc(detections.Date), desc(detections.Time))
			.limit(200);
	},
);

export type DetectionTableRow = Detection & {
	rowId: number;
};

export type DetectionPage = {
	rows: DetectionTableRow[];
	total: number;
};

// The detections table is paginated on the server, so we can't fuzzy-match rows
// in the browser the way the species grid does. Instead we run the same Fuse
// config over the (small) distinct species list and turn the query into an
// explicit list of names for SQL to filter on.
async function fuzzySpeciesNames(query: string): Promise<string[]> {
	const names = await db
		.selectDistinct({
			comName: detections.Com_Name,
			sciName: detections.Sci_Name,
		})
		.from(detections);
	const fuse = new Fuse(names, {
		keys: ["comName", "sciName"],
		threshold: 0.2,
		ignoreLocation: true,
	});
	return fuse.search(query).map((result) => result.item.comName);
}

// A query like "93" or "93%" also matches rows whose confidence rounds to that
// percent — the same number the table renders. Fuzzy matching makes no sense
// for a number, so this is an exact match on the displayed value.
function confidencePercent(query: string): number | null {
	const match = /^(\d{1,3})\s*%?$/.exec(query.trim());
	if (!match) return null;
	const percent = Number(match[1]);
	return percent >= 0 && percent <= 100 ? percent : null;
}

async function detectionFilters(search: DetectionWorkspaceSearch) {
	const filters = [];
	if (search.species) {
		const matches = await fuzzySpeciesNames(search.species);
		const percent = confidencePercent(search.species);
		const clauses = [];
		if (matches.length > 0) clauses.push(inArray(detections.Com_Name, matches));
		if (percent !== null) {
			clauses.push(
				sql`CAST(ROUND(${detections.Confidence} * 100) AS INTEGER) = ${percent}`,
			);
		}
		// No match of either kind must yield zero rows, not "no filter".
		filters.push(clauses.length > 0 ? or(...clauses) : sql`1 = 0`);
	}
	if (search.minConfidence !== undefined) {
		filters.push(gte(detections.Confidence, search.minConfidence));
	}
	if (search.from) filters.push(gte(detections.Date, search.from));
	if (search.to) filters.push(lte(detections.Date, search.to));
	return filters.length > 0 ? and(...filters) : undefined;
}

function detectionOrder(
	search: DetectionWorkspaceSearch,
): ReturnType<typeof asc>[] {
	const order = search.direction === "asc" ? asc : desc;
	switch (search.sort) {
		case "species":
			return [
				order(detections.Com_Name),
				order(detections.Date),
				order(detections.Time),
			];
		case "scientific":
			return [
				order(detections.Sci_Name),
				order(detections.Date),
				order(detections.Time),
			];
		case "confidence":
			return [
				order(detections.Confidence),
				order(detections.Date),
				order(detections.Time),
			];
		default:
			return [order(detections.Date), order(detections.Time)];
	}
}

export const getDetectionsPage = createServerFn({ method: "GET" })
	.validator((input: Record<string, unknown>) =>
		normalizeDetectionWorkspaceSearch(input),
	)
	.handler(async ({ data }): Promise<DetectionPage> => {
		const filters = await detectionFilters(data);
		const [{ total }] = await db
			.select({ total: count() })
			.from(detections)
			.where(filters);
		const rows = await db
			.select({
				rowId: sql<number>`rowid`,
				Date: detections.Date,
				Time: detections.Time,
				Sci_Name: detections.Sci_Name,
				Com_Name: detections.Com_Name,
				Confidence: detections.Confidence,
				Lat: detections.Lat,
				Lon: detections.Lon,
				Cutoff: detections.Cutoff,
				Week: detections.Week,
				Sens: detections.Sens,
				Overlap: detections.Overlap,
				File_Name: detections.File_Name,
			})
			.from(detections)
			.where(filters)
			.orderBy(...detectionOrder(data))
			.limit(data.pageSize)
			.offset((data.page - 1) * data.pageSize);

		return { rows, total };
	});

type DeletionRequest = {
	rowIds: number[];
};

export type DeleteDetectionsResult = {
	deletedRecords: number;
	deletedFiles: number;
	missingFiles: number;
	failedFiles: number;
};

type SelectedDetection = DetectionClipIdentity & {
	rowId: number;
};

function validRowIds(rowIds: number[]): number[] {
	return [
		...new Set(
			rowIds.filter((rowId) => Number.isSafeInteger(rowId) && rowId > 0),
		),
	];
}

function readSelectedDetections(rowIds: number[]): SelectedDetection[] {
	const writable = openWritableDetectionsDb();
	const placeholders = rowIds.map(() => "?").join(", ");
	try {
		writable.exec("BEGIN IMMEDIATE");
		const selected = writable
			.prepare(
				`SELECT rowid AS rowId, Date AS date, Com_Name AS commonName, File_Name AS fileName FROM detections WHERE rowid IN (${placeholders})`,
			)
			.all(...rowIds) as SelectedDetection[];
		writable
			.prepare(`DELETE FROM detections WHERE rowid IN (${placeholders})`)
			.run(...rowIds);
		writable.exec("COMMIT");
		return selected;
	} catch (error) {
		try {
			writable.exec("ROLLBACK");
		} catch {
			// The transaction may not have started if opening or preparation failed.
		}
		throw error;
	} finally {
		writable.close();
	}
}

async function deleteUnreferencedClips(
	selected: SelectedDetection[],
): Promise<Omit<DeleteDetectionsResult, "deletedRecords">> {
	const uniqueClips = new Map<string, DetectionClipIdentity>();
	for (const clip of selected) {
		uniqueClips.set(
			`${clip.date}\u0000${clip.commonName}\u0000${clip.fileName}`,
			clip,
		);
	}

	let deletedFiles = 0;
	let missingFiles = 0;
	let failedFiles = 0;
	for (const clip of uniqueClips.values()) {
		const [{ references }] = await db
			.select({ references: count() })
			.from(detections)
			.where(
				and(
					sql`${detections.Date} = ${clip.date}`,
					sql`${detections.Com_Name} = ${clip.commonName}`,
					sql`${detections.File_Name} = ${clip.fileName}`,
				),
			);
		if (references > 0) continue;

		const filePath = resolveDetectionClipPath(extractedDir(), clip);
		if (!filePath) {
			failedFiles += 1;
			continue;
		}

		try {
			await rm(filePath);
			deletedFiles += 1;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				missingFiles += 1;
			} else {
				failedFiles += 1;
			}
		}
	}

	return { deletedFiles, missingFiles, failedFiles };
}

// Gated: this drops rows from the detections database and unlinks the audio
// files behind them, which is as destructive as anything in Review or Settings.
// The page it is called from is public -- browsing detections needs no password
// -- so the boundary has to sit here on the mutation rather than on the route.
export const deleteDetections = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator((input: DeletionRequest) => ({
		rowIds: validRowIds(input.rowIds),
	}))
	.handler(async ({ data }): Promise<DeleteDetectionsResult> => {
		if (data.rowIds.length === 0) {
			return {
				deletedRecords: 0,
				deletedFiles: 0,
				missingFiles: 0,
				failedFiles: 0,
			};
		}

		const selected = readSelectedDetections(data.rowIds);
		const fileResults = await deleteUnreferencedClips(selected);
		return { deletedRecords: selected.length, ...fileResults };
	});

export type LifeListCard = {
	comName: string;
	sciName: string;
	allTimeCount: number;
	// Detections bucketed by hour of day (length 24), so the species page can
	// fold these across a search result to name its most active hour.
	hourCounts: number[];
	lastDetected: string;
	audioUrl: string | null;
	imageUrl: string | null;
	ebirdUrl: string;
};

export const getLifeListCards = createServerFn({ method: "GET" }).handler(
	async (): Promise<LifeListCard[]> => {
		const totals = await db
			.select({
				comName: detections.Com_Name,
				sciName: detections.Sci_Name,
				allTimeCount: count(),
			})
			.from(detections)
			.groupBy(detections.Com_Name, detections.Sci_Name);

		// Most-recent detection per species, ordered so the first occurrence
		// of each Com_Name we see is the latest one.
		const recent = await db
			.select({
				comName: detections.Com_Name,
				date: detections.Date,
				time: detections.Time,
				fileName: detections.File_Name,
			})
			.from(detections)
			.orderBy(desc(detections.Date), desc(detections.Time));
		const latestByName = new Map<
			string,
			{ date: string; time: string; fileName: string }
		>();
		// The same pass that finds each species' latest detection also tallies its
		// detections by hour of day, so the hourly histogram is a pure fold over
		// the rows we already hold rather than a second query.
		const hourCountsByName = new Map<string, number[]>();
		for (const row of recent) {
			if (!latestByName.has(row.comName)) {
				latestByName.set(row.comName, row);
			}
			const hour = Number.parseInt(row.time.slice(0, 2), 10);
			if (Number.isNaN(hour) || hour < 0 || hour > 23) continue;
			let counts = hourCountsByName.get(row.comName);
			if (!counts) {
				counts = new Array(24).fill(0);
				hourCountsByName.set(row.comName, counts);
			}
			counts[hour] += 1;
		}

		return Promise.all(
			totals.map(async (row) => {
				const latest = latestByName.get(row.comName);
				return {
					comName: row.comName,
					sciName: row.sciName,
					allTimeCount: row.allTimeCount,
					hourCounts:
						hourCountsByName.get(row.comName) ?? new Array(24).fill(0),
					lastDetected: latest ? `${latest.date} ${latest.time}` : "",
					audioUrl: latest
						? audioUrlFor(latest.date, row.comName, latest.fileName)
						: null,
					imageUrl: illustrationUrlFor(row.sciName),
					ebirdUrl: ebirdUrlFor(row.sciName, row.comName),
				};
			}),
		);
	},
);
