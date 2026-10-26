import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { commonNameSafe } from "~/lib/audio.ts";
import { resolveDetectionClipPath } from "~/lib/detection-file-path.server.ts";

// A species' best recording is the one rule every page plays it by -- the bird
// page's feature, the life list's play button, every Learn question: its
// highest-confidence clip, ties broken toward the most recent. BirdNET-Pi's
// cleanup job can take that file off disk, so a few runners-up come along in
// the same order to stand in for it, and the first one still on disk wins.
const CANDIDATE_CLIPS_PER_SPECIES = 10;

export type BestRecording = {
	comName: string;
	sciName: string;
	date: string;
	time: string;
	confidence: number | null;
	fileName: string;
};

/**
 * One window-function query takes every species' candidates in a single pass,
 * best first within each species. `comName` narrows it to one species, for the
 * bird page.
 */
function candidateClips(
	database: DatabaseSync,
	comName?: string,
): BestRecording[] {
	const statement = database.prepare(`
		SELECT comName, sciName, date, time, confidence, fileName
		FROM (
			SELECT
				Com_Name AS comName,
				Sci_Name AS sciName,
				Date AS date,
				Time AS time,
				Confidence AS confidence,
				File_Name AS fileName,
				ROW_NUMBER() OVER (PARTITION BY Com_Name ORDER BY Confidence DESC, Date DESC, Time DESC) AS rn
			FROM detections
			${comName === undefined ? "" : "WHERE Com_Name = ?"}
		)
		WHERE rn <= ?
		ORDER BY comName, rn
	`);
	const rows =
		comName === undefined
			? statement.all(CANDIDATE_CLIPS_PER_SPECIES)
			: statement.all(comName, CANDIDATE_CLIPS_PER_SPECIES);
	return rows as BestRecording[];
}

/**
 * Each species' best recording still on disk, keyed by common name. Rows
 * arrive best first within a species, so the first survivor wins and the
 * runners-up behind it are never stat-ed -- usually one check per species. A
 * species whose candidates are all gone has no entry.
 */
export function bestRecordings(
	database: DatabaseSync,
	extractedRoot: string,
	comName?: string,
): Map<string, BestRecording> {
	const best = new Map<string, BestRecording>();
	for (const clip of candidateClips(database, comName)) {
		if (best.has(clip.comName)) continue;
		const filePath = resolveDetectionClipPath(extractedRoot, {
			date: clip.date,
			commonName: clip.comName,
			fileName: clip.fileName,
		});
		if (filePath !== null && existsSync(filePath)) best.set(clip.comName, clip);
	}
	return best;
}

/**
 * Whether the clip at By_Date/<date>/<speciesDir>/<fileName> is its species'
 * best recording right now -- the only clips a signed-out visitor may hear.
 * The folder is the common name made path-safe, so the detection is looked up
 * by date and file and its species' best compared against it.
 */
export function isBestRecording(
	database: DatabaseSync,
	extractedRoot: string,
	clip: { date: string; speciesDir: string; fileName: string },
): boolean {
	const rows = database
		.prepare(
			"SELECT DISTINCT Com_Name AS comName FROM detections WHERE Date = ? AND File_Name = ?",
		)
		.all(clip.date, clip.fileName) as { comName: string }[];
	return rows.some(({ comName }) => {
		if (commonNameSafe(comName) !== clip.speciesDir) return false;
		const best = bestRecordings(database, extractedRoot, comName).get(comName);
		return best?.date === clip.date && best.fileName === clip.fileName;
	});
}
