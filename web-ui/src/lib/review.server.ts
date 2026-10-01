import "@tanstack/react-start/server-only";

import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { audioUrlFor } from "~/lib/audio.ts";
import { CONFIDENT_MIN } from "~/lib/confidence.ts";
import { resolveDetectionClipPath } from "~/lib/detection-file-path.server.ts";
import { ebirdUrlFor } from "~/lib/ebird.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import {
	parseSpeciesCatalog,
	REVIEW_PAGE_SIZE,
	type ReviewSearch,
	recategorizedFileName,
	type SpeciesOption,
} from "~/lib/review-data.ts";
import { DEFAULT_REVIEW_RARE_SPECIES_MAX } from "~/lib/settings-data.ts";

export type ReviewCandidate = {
	rowId: number;
	date: string;
	time: string;
	sciName: string;
	comName: string;
	confidence: number | null;
	fileName: string;
	lifetimeCount: number;
	audioUrl: string;
	audioAvailable: boolean;
	ebirdUrl: string;
	/** The bundled illustration, or null for the generic bird glyph. */
	imageUrl: string | null;
};
export type ReviewPage = {
	/** One-based; held to the pages that exist. */
	page: number;
	pageSize: number;
	/** Strict lifetime-count cutoff applied to this queue. */
	rareSpeciesMax: number;
	/** Recordings meeting the review criteria, of which `candidates` is a page. */
	total: number;
	/** How many distinct species those recordings span. */
	speciesTotal: number;
	candidates: ReviewCandidate[];
};

type ReviewFileOperations = {
	copyFile: typeof copyFile;
	mkdir: typeof mkdir;
	rename: typeof rename;
	rm: typeof rm;
};

const defaultFileOperations: ReviewFileOperations = {
	copyFile,
	mkdir,
	rename,
	rm,
};

/**
 * Our own table, not BirdNET-Pi's. It exists because `detections` cannot grow a
 * column: both writers (scripts/utils/reporting.py and scripts/seed_test_data.py)
 * INSERT positionally with no column list, so a thirteenth column would stop the
 * station recording. Keeping review state alongside instead leaves their SQL --
 * and BirdNET's own confidence scores -- exactly as they were.
 *
 * Keyed on the detection's identity rather than its rowid: SQLite hands deleted
 * rowids out to later inserts, so a rowid-keyed record could eventually attach
 * itself to an unrelated new detection and mark it reviewed before anyone
 * listened to it.
 */
const CREATE_REVIEWS_TABLE = `CREATE TABLE IF NOT EXISTS reviews (
  Date TEXT NOT NULL,
  Time TEXT NOT NULL,
  Com_Name TEXT NOT NULL,
  File_Name TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence REAL,
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY (Date, Time, Com_Name, File_Name)
)`;

/** Matches a `reviews` row to the `detections` row it describes. */
const REVIEW_MATCHES_DETECTION =
	"r.Date = d.Date AND r.Time = d.Time AND r.Com_Name = d.Com_Name AND r.File_Name = d.File_Name";

export function ensureReviewsTable(database: DatabaseSync) {
	database.exec(CREATE_REVIEWS_TABLE);
}

/**
 * Reads run against a read-only handle and must work on a station that has
 * never reviewed anything, so the table is only joined once it exists rather
 * than being created on the read path.
 */
export function reviewsTableExists(database: DatabaseSync): boolean {
	return (
		database
			.prepare(
				"SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='reviews'",
			)
			.get() !== undefined
	);
}

/**
 * The whole queue in one clause: a species the station barely hears, on a
 * recording BirdNET was not already sure about, that nobody has signed off yet.
 * Reviewing a confident call from a bird the station logs hundreds of times a
 * year tells nobody anything, so none of the three is optional.
 */
function rareAndUnsure(reviewed: boolean): string {
	const unreviewed = reviewed
		? ` AND NOT EXISTS (SELECT 1 FROM reviews r WHERE ${REVIEW_MATCHES_DETECTION})`
		: "";
	return `SELECT d.rowid rowId, d.Date date, d.Time time, d.Sci_Name sciName, d.Com_Name comName, d.Confidence confidence, d.File_Name fileName, lifetime.lifetime_count lifetimeCount FROM detections d JOIN (SELECT Sci_Name, Com_Name, COUNT(*) lifetime_count FROM detections GROUP BY Sci_Name, Com_Name) lifetime ON lifetime.Sci_Name = d.Sci_Name AND lifetime.Com_Name = d.Com_Name WHERE lifetime.lifetime_count < ? AND (d.Confidence IS NULL OR d.Confidence < ${CONFIDENT_MIN})${unreviewed}`;
}

type RawCandidate = {
	rowId: number;
	date: string;
	time: string;
	sciName: string;
	comName: string;
	confidence: number | null;
	fileName: string;
	lifetimeCount: number;
};

export function loadReviewPage(
	database: DatabaseSync,
	extractedRoot: string,
	search: ReviewSearch,
	rareSpeciesMax = DEFAULT_REVIEW_RARE_SPECIES_MAX,
	pageSize = REVIEW_PAGE_SIZE,
): ReviewPage {
	const queue = rareAndUnsure(reviewsTableExists(database));
	const totals = database
		.prepare(
			`SELECT COUNT(*) AS n, COUNT(DISTINCT comName) AS species FROM (${queue})`,
		)
		.get(rareSpeciesMax);
	const total = Number(totals?.n ?? 0);
	// Clearing the last rows of the last page leaves the URL on a page that no
	// longer exists; show the one before it rather than an empty queue.
	const page = Math.min(search.page, Math.max(1, Math.ceil(total / pageSize)));
	// Rarest species first, then weakest recording: the bird you have heard once
	// is the one where a mistake matters most.
	const rows = database
		.prepare(
			`${queue} ORDER BY lifetimeCount ASC, comName ASC, confidence IS NOT NULL, confidence ASC, date DESC, time DESC LIMIT ? OFFSET ?`,
		)
		.all(rareSpeciesMax, pageSize, (page - 1) * pageSize) as RawCandidate[];
	return {
		page,
		pageSize,
		rareSpeciesMax,
		total,
		speciesTotal: Number(totals?.species ?? 0),
		candidates: rows.map((row) => {
			const clip = {
				date: row.date,
				commonName: row.comName,
				fileName: row.fileName,
			};
			const filePath = resolveDetectionClipPath(extractedRoot, clip);
			return {
				...row,
				audioUrl: audioUrlFor(row.date, row.comName, row.fileName),
				audioAvailable: filePath !== null && existsSync(filePath),
				ebirdUrl: ebirdUrlFor(row.sciName, row.comName),
				imageUrl: illustrationUrlFor(row.sciName),
			};
		}),
	};
}

export function loadSpeciesCatalog(labelsPath?: string): SpeciesOption[] {
	const configured = labelsPath ?? process.env.BIRDNET_LABELS_PATH;
	const jsonPath = path.resolve(process.cwd(), "../model/l18n/labels_en.json");
	if (configured && existsSync(configured)) {
		const text = readFileSync(configured, "utf8");
		if (text.trimStart().startsWith("{")) return parseSpeciesCatalog(text);
		return text
			.split(/\r?\n/)
			.flatMap((line) => {
				const separator = line.indexOf("_");
				return separator > 0
					? [
							{
								sciName: line.slice(0, separator),
								comName: line.slice(separator + 1),
							},
						]
					: [];
			})
			.sort((a, b) => a.comName.localeCompare(b.comName));
	}
	return parseSpeciesCatalog(readFileSync(jsonPath, "utf8"));
}

function target(database: DatabaseSync, rowId: number) {
	if (!Number.isSafeInteger(rowId) || rowId < 1)
		throw new Error("Invalid detection");
	const row = database
		.prepare(
			"SELECT rowid rowId, Date date, Time time, Sci_Name sciName, Com_Name comName, Confidence confidence, File_Name fileName FROM detections WHERE rowid=?",
		)
		.get(rowId);
	if (!row) throw new Error("Detection not found");
	return row as {
		rowId: number;
		date: string;
		time: string;
		sciName: string;
		comName: string;
		confidence: number | null;
		fileName: string;
	};
}

type ReviewedRow = {
	date: string;
	time: string;
	comName: string;
	confidence: number | null;
	fileName: string;
};

/**
 * Signs a detection off. `INSERT OR REPLACE` rather than a plain insert so
 * confirming something twice -- two tabs, a double click -- is not an error.
 * `confidence` is BirdNET's own score, recorded as it stood at review time;
 * nothing writes back to `detections.Confidence`, which is the point of the
 * whole table.
 */
function recordReview(
	database: DatabaseSync,
	row: ReviewedRow,
	action: "confirmed" | "recategorized",
) {
	ensureReviewsTable(database);
	database
		.prepare(
			"INSERT OR REPLACE INTO reviews (Date, Time, Com_Name, File_Name, action, confidence, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		)
		.run(
			row.date,
			row.time,
			row.comName,
			row.fileName,
			action,
			row.confidence,
			new Date().toISOString(),
		);
}

/** Drops any sign-off for a detection that no longer exists under that identity. */
function forgetReview(database: DatabaseSync, row: ReviewedRow) {
	if (!reviewsTableExists(database)) return;
	database
		.prepare(
			"DELETE FROM reviews WHERE Date=? AND Time=? AND Com_Name=? AND File_Name=?",
		)
		.run(row.date, row.time, row.comName, row.fileName);
}

export function correctDetection(database: DatabaseSync, rowId: number) {
	recordReview(database, target(database, rowId), "confirmed");
}

export async function recategorizeDetection(
	database: DatabaseSync,
	extractedRoot: string,
	rowId: number,
	species: SpeciesOption,
	catalog: SpeciesOption[],
	files: ReviewFileOperations = defaultFileOperations,
) {
	if (
		!catalog.some(
			(item) =>
				item.sciName === species.sciName && item.comName === species.comName,
		)
	)
		throw new Error("Unsupported species");
	const row = target(database, rowId);
	const fileName = recategorizedFileName(
		row.fileName,
		row.comName,
		species.comName,
	);
	if (!fileName)
		throw new Error("Recording filename cannot be recategorized safely");
	const oldPath = resolveDetectionClipPath(extractedRoot, {
		date: row.date,
		commonName: row.comName,
		fileName: row.fileName,
	});
	const newPath = resolveDetectionClipPath(extractedRoot, {
		date: row.date,
		commonName: species.comName,
		fileName,
	});
	if (!oldPath || !newPath || !existsSync(oldPath))
		throw new Error("Recording audio is unavailable");
	if (existsSync(newPath) || existsSync(`${newPath}.png`))
		throw new Error("Replacement recording already exists");
	const references = Number(
		database
			.prepare(
				"SELECT COUNT(*) n FROM detections WHERE Date=? AND Com_Name=? AND File_Name=?",
			)
			.get(row.date, row.comName, row.fileName)?.n ?? 0,
	);
	const shared = references > 1;
	const hasImage = existsSync(`${oldPath}.png`);
	let audioPlaced = false;
	let imagePlaced = false;
	await files.mkdir(path.dirname(newPath), { recursive: true });
	try {
		if (shared) await files.copyFile(oldPath, newPath);
		else await files.rename(oldPath, newPath);
		audioPlaced = true;
		if (hasImage) {
			if (shared) await files.copyFile(`${oldPath}.png`, `${newPath}.png`);
			else await files.rename(`${oldPath}.png`, `${newPath}.png`);
			imagePlaced = true;
		}
		const result = database
			.prepare(
				"UPDATE detections SET Sci_Name=?, Com_Name=?, File_Name=? WHERE rowid=?",
			)
			.run(species.sciName, species.comName, fileName, rowId);
		if (result.changes !== 1) throw new Error("Detection was not updated");
		// Signed off under the identity it now has, and any sign-off filed under
		// the old name dropped, so re-identifying twice leaves one record.
		forgetReview(database, row);
		recordReview(
			database,
			{ ...row, comName: species.comName, fileName },
			"recategorized",
		);
	} catch (error) {
		const rollbackErrors: unknown[] = [];
		if (imagePlaced)
			try {
				if (shared) await files.rm(`${newPath}.png`, { force: true });
				else await files.rename(`${newPath}.png`, `${oldPath}.png`);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		if (audioPlaced)
			try {
				if (shared) await files.rm(newPath, { force: true });
				else await files.rename(newPath, oldPath);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		if (rollbackErrors.length > 0)
			throw new AggregateError(
				[error, ...rollbackErrors],
				"Recategorization failed and assets could not be fully restored",
			);
		throw error;
	}
}

export async function deleteDetectionDirectly(
	database: DatabaseSync,
	extractedRoot: string,
	rowId: number,
) {
	const row = target(database, rowId);
	const result = database
		.prepare("DELETE FROM detections WHERE rowid=?")
		.run(rowId);
	// Otherwise the sign-off outlives the detection, and a future recording that
	// lands on the same date, time, species and filename inherits it.
	forgetReview(database, row);
	const references = Number(
		database
			.prepare(
				"SELECT COUNT(*) n FROM detections WHERE Date=? AND Com_Name=? AND File_Name=?",
			)
			.get(row.date, row.comName, row.fileName)?.n ?? 0,
	);
	let deletedFiles = 0,
		missingFiles = 0,
		failedFiles = 0;
	if (references === 0) {
		const filePath = resolveDetectionClipPath(extractedRoot, {
			date: row.date,
			commonName: row.comName,
			fileName: row.fileName,
		});
		if (!filePath) failedFiles++;
		else
			for (const asset of [filePath, `${filePath}.png`])
				try {
					await rm(asset);
					deletedFiles++;
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT")
						missingFiles++;
					else failedFiles++;
				}
	}
	return {
		deletedRecords: Number(result.changes),
		deletedFiles,
		missingFiles,
		failedFiles,
	};
}
