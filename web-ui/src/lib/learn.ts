import { existsSync } from "node:fs";

import { createServerFn } from "@tanstack/react-start";

import { sqlite } from "~/db/index.ts";
import { extractedDir } from "~/lib/audio.server.ts";
import { resolveDetectionClipPath } from "~/lib/detection-file-path.server.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import {
	FREQUENT_SPECIES_THRESHOLD,
	type LearnPool,
} from "~/lib/learn-pools.ts";
import {
	buildRound,
	type LearnRound,
	type PoolSpecies,
} from "~/lib/learn-round.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";

// A weak detection is usually a smear of wind or traffic that happens to score
// as a bird -- unfair to quiz someone on. Only clips the analyzer felt good
// about become questions.
const MINIMUM_CLIP_CONFIDENCE = 0.65;

// Taken per species, not per pool, so a bird heard twice all year is as likely
// to come up as the crow that never shuts up. Newest first, because BirdNET-Pi's
// cleanup job trims old audio: a species' recent detections are the ones whose
// files are still on disk. Which of the survivors a question uses is then
// chosen at random, so a round doesn't replay the same clip every time.
const CLIPS_PER_SPECIES = 30;

type ClipRow = {
	date: string;
	comName: string;
	sciName: string;
	fileName: string;
	confidence: number | null;
	detectedAt: string;
};

/**
 * One window-function query beats a per-species round trip here: it takes an
 * even slice of every species in the pool in a single pass. Drizzle's
 * sqlite-proxy driver hands back positional rows, which makes a raw statement on
 * the shared handle the clearer way to express this particular shape.
 */
function recentClipsPerSpecies(pool: LearnPool): ClipRow[] {
	const conditions = ["Confidence >= ?"];
	const params: (string | number)[] = [MINIMUM_CLIP_CONFIDENCE];

	// Regulars and rare split the station's species on one line, so between
	// them they cover exactly what "all" does.
	if (pool !== "all") {
		conditions.push(
			`Com_Name IN (SELECT Com_Name FROM detections GROUP BY Com_Name HAVING COUNT(*) ${pool === "regulars" ? ">=" : "<"} ?)`,
		);
		params.push(FREQUENT_SPECIES_THRESHOLD);
	}

	const statement = sqlite.prepare(`
		SELECT date, comName, sciName, fileName, confidence, detectedAt
		FROM (
			SELECT
				Date AS date,
				Com_Name AS comName,
				Sci_Name AS sciName,
				File_Name AS fileName,
				Confidence AS confidence,
				Date || ' ' || Time AS detectedAt,
				ROW_NUMBER() OVER (PARTITION BY Com_Name ORDER BY Date DESC, Time DESC) AS rn
			FROM detections
			WHERE ${conditions.join(" AND ")}
		)
		WHERE rn <= ?
	`);

	return statement.all(...params, CLIPS_PER_SPECIES) as ClipRow[];
}

// A clip whose file has been cleaned off disk would leave a question with
// nothing to play, so it never makes it into the pool. Only the sampled rows
// are checked, which keeps this to a few hundred stat calls at most.
function clipFileExists(row: ClipRow): boolean {
	const path = resolveDetectionClipPath(extractedDir(), {
		date: row.date,
		commonName: row.comName,
		fileName: row.fileName,
	});
	return path !== null && existsSync(path);
}

function groupIntoSpecies(rows: ClipRow[]): PoolSpecies[] {
	const bySpecies = new Map<string, PoolSpecies>();

	for (const row of rows) {
		let species = bySpecies.get(row.comName);
		if (!species) {
			species = {
				comName: row.comName,
				sciName: row.sciName,
				speciesSlug: comNameToSlug(row.comName),
				// The bundled illustration, or null for the generic bird glyph.
				imageUrl: illustrationUrlFor(row.sciName),
				clips: [],
			};
			bySpecies.set(row.comName, species);
		}
		species.clips.push({
			date: row.date,
			fileName: row.fileName,
			detectedAt: row.detectedAt,
			confidence: row.confidence,
		});
	}

	return [...bySpecies.values()];
}

/**
 * Fills in each choice's station totals. Scoped to the round's own species, so
 * it's one grouped query over a dozen or so names, not the whole table.
 */
function addSpeciesStats(round: LearnRound): LearnRound {
	const names = [
		...new Set(
			round.questions.flatMap((question) =>
				question.choices.map((choice) => choice.comName),
			),
		),
	];
	if (names.length === 0) return round;

	const rows = sqlite
		.prepare(
			`SELECT Com_Name AS comName, COUNT(*) AS detections, MIN(Date) AS firstHeard
			FROM detections
			WHERE Com_Name IN (${names.map(() => "?").join(", ")})
			GROUP BY Com_Name`,
		)
		.all(...names) as {
		comName: string;
		detections: number;
		firstHeard: string | null;
	}[];
	const stats = new Map(rows.map((row) => [row.comName, row]));

	return {
		...round,
		questions: round.questions.map((question) => ({
			...question,
			choices: question.choices.map((choice) => ({
				...choice,
				detections: stats.get(choice.comName)?.detections ?? 0,
				firstHeard: stats.get(choice.comName)?.firstHeard ?? null,
			})),
		})),
	};
}

export type LearnRoundData = {
	round: LearnRound;
	/**
	 * Whether the station has recorded anything at all. An empty pool is not the
	 * same as an empty station, and only the latter should drop the pool
	 * switcher -- switching pools is the fix for the former.
	 */
	hasAnyDetections: boolean;
};

export const getLearnRound = createServerFn({ method: "GET" })
	.validator((pool: LearnPool) => pool)
	.handler(async ({ data: pool }): Promise<LearnRoundData> => {
		const rows = recentClipsPerSpecies(pool).filter(clipFileExists);
		const round = addSpeciesStats(buildRound(groupIntoSpecies(rows)));

		// A playable round is proof enough; only an empty one pays for the probe.
		const hasAnyDetections =
			round.questions.length > 0 ||
			sqlite.prepare("SELECT 1 FROM detections LIMIT 1").get() !== undefined;

		return { round, hasAnyDetections };
	});
