import { existsSync } from "node:fs";

import { createServerFn } from "@tanstack/react-start";

import { sqlite } from "~/db/index.ts";
import { extractedDir } from "~/lib/audio.server.ts";
import { resolveDetectionClipPath } from "~/lib/detection-file-path.server.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import {
	familiarityPool,
	LEARN_POOLS,
	type LearnPool,
} from "~/lib/learn-pools.ts";
import {
	buildRound,
	type LearnRound,
	type PoolSpecies,
} from "~/lib/learn-round.ts";
import { readHighlightThresholds } from "~/lib/settings-config.server.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";

// A weak detection is usually a smear of wind or traffic that happens to score
// as a bird -- unfair to quiz someone on. Only clips the analyzer felt good
// about become questions.
const MINIMUM_CLIP_CONFIDENCE = 0.65;

// Every question about a species plays its best recording -- the same
// highest-confidence clip the species page features -- so the ear learns one
// clean example rather than whatever happened to be caught last. BirdNET-Pi's
// cleanup job can take that file off disk, so a few runners-up come along in
// confidence order to stand in for it.
const CANDIDATE_CLIPS_PER_SPECIES = 10;

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
 * even slice of every species in a single pass. Drizzle's sqlite-proxy driver
 * hands back positional rows, which makes a raw statement on the shared handle
 * the clearer way to express this particular shape.
 *
 * Always the whole station: the pools are cut from the result afterwards (see
 * `inPool`), so one pass can count every pool as well as deal the round.
 */
function bestClipsPerSpecies(): ClipRow[] {
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
				-- Ties break toward the most recent, as on the species page, since
				-- that clip is likeliest to still be on disk.
				ROW_NUMBER() OVER (PARTITION BY Com_Name ORDER BY Confidence DESC, Date DESC, Time DESC) AS rn
			FROM detections
			WHERE Confidence >= ?
		)
		WHERE rn <= ?
		ORDER BY comName, rn
	`);

	return statement.all(
		MINIMUM_CLIP_CONFIDENCE,
		CANDIDATE_CLIPS_PER_SPECIES,
	) as ClipRow[];
}

/** Every species' all-time detection count, weak ones included -- what makes
    a species a regular or rare here. */
function allTimeDetections(): Map<string, number> {
	const rows = sqlite
		.prepare(
			"SELECT Com_Name AS comName, COUNT(*) AS detections FROM detections GROUP BY Com_Name",
		)
		.all() as { comName: string; detections: number }[];
	return new Map(rows.map((row) => [row.comName, row.detections]));
}

// Common, uncommon and rare split the station's species between them, so
// together they cover exactly what "all" does.
function inPool(
	pool: LearnPool,
	species: PoolSpecies,
	detections: Map<string, number>,
	rareMax: number,
): boolean {
	if (pool === "all") return true;
	return (
		familiarityPool(detections.get(species.comName) ?? 0, rareMax) === pool
	);
}

// A clip whose file has been cleaned off disk would leave a question with
// nothing to play, so it never makes it into the pool.
function clipFileExists(row: ClipRow): boolean {
	const path = resolveDetectionClipPath(extractedDir(), {
		date: row.date,
		commonName: row.comName,
		fileName: row.fileName,
	});
	return path !== null && existsSync(path);
}

/**
 * Keeps each species' best clip that is still on disk. Rows arrive best first
 * within a species, so the first survivor wins and the runners-up behind it
 * are never stat-ed -- usually one check per species.
 */
function bestPlayableClipPerSpecies(rows: ClipRow[]): PoolSpecies[] {
	const bySpecies = new Map<string, PoolSpecies>();

	for (const row of rows) {
		if (bySpecies.has(row.comName) || !clipFileExists(row)) continue;
		bySpecies.set(row.comName, {
			comName: row.comName,
			sciName: row.sciName,
			speciesSlug: comNameToSlug(row.comName),
			// The bundled illustration, or null for the generic bird glyph.
			imageUrl: illustrationUrlFor(row.sciName),
			clips: [
				{
					date: row.date,
					fileName: row.fileName,
					detectedAt: row.detectedAt,
					confidence: row.confidence,
				},
			],
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
	/** How many species each pool can quiz on: those with a clip still on
	    disk, so what the game actually picks from, not the whole life list. */
	poolCounts: Record<LearnPool, number>;
	/** Records or fewer that make a species rare, as the owner set it. */
	rareMax: number;
};

export const getLearnRound = createServerFn({ method: "GET" })
	.validator((pool: LearnPool) => pool)
	.handler(async ({ data: pool }): Promise<LearnRoundData> => {
		const playable = bestPlayableClipPerSpecies(bestClipsPerSpecies());
		const detections = allTimeDetections();
		const { rareMax } = await readHighlightThresholds();
		const poolCounts = Object.fromEntries(
			LEARN_POOLS.map((option) => [
				option,
				playable.filter((species) =>
					inPool(option, species, detections, rareMax),
				).length,
			]),
		) as Record<LearnPool, number>;

		const round = addSpeciesStats(
			buildRound(
				playable.filter((species) =>
					inPool(pool, species, detections, rareMax),
				),
			),
		);

		return {
			round,
			hasAnyDetections: detections.size > 0,
			poolCounts,
			rareMax,
		};
	});
