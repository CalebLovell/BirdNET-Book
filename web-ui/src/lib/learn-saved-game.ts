// Each pool's game in progress, kept in the browser tab's sessionStorage so
// switching pools, leaving the Learn page or reloading picks the round up
// where it was. Per tab and gone when the tab closes: a half-played quiz is
// worth keeping for a while, not forever.

import type { LearnPool } from "~/lib/learn-pools.ts";
import type { LearnRound, QuestionResult } from "~/lib/learn-round.ts";

/** Where the player is in a round: everything the game needs to resume. */
export type GameProgress = {
	/** The question on screen. */
	index: number;
	/** Species already ruled out on it, in the order guessed. */
	wrongGuesses: string[];
	isSolved: boolean;
	results: QuestionResult[];
	isFinished: boolean;
};

export const FRESH_PROGRESS: GameProgress = {
	index: 0,
	wrongGuesses: [],
	isSolved: false,
	results: [],
	isFinished: false,
};

export type SavedGame = { round: LearnRound; progress: GameProgress };

// Versioned, so a later change to the round's shape can move to a new key
// instead of reading an old save it no longer understands.
const KEY_PREFIX = "learn-game:v1:";

/**
 * A save that can still drive the game: a round with questions and progress
 * that points inside it. Storage is the browser's to clear or mangle, so a
 * save that fails this is treated as no save at all.
 */
function isSavedGame(value: unknown): value is SavedGame {
	if (typeof value !== "object" || value === null) return false;
	const { round, progress } = value as Partial<SavedGame>;
	return (
		typeof round?.id === "string" &&
		Array.isArray(round.questions) &&
		round.questions.length > 0 &&
		typeof progress?.index === "number" &&
		progress.index >= 0 &&
		progress.index < round.questions.length &&
		Array.isArray(progress.wrongGuesses) &&
		Array.isArray(progress.results) &&
		typeof progress.isSolved === "boolean" &&
		typeof progress.isFinished === "boolean"
	);
}

/** This tab's game for a pool, or null when there's none to resume. Storage
    can throw (private windows, blocked site data), which also counts as none. */
export function loadSavedGame(pool: LearnPool): SavedGame | null {
	try {
		const raw = sessionStorage.getItem(KEY_PREFIX + pool);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		return isSavedGame(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/** Saving is best effort: if storage is unavailable or full, the game plays
    on and is simply not remembered. */
export function saveGame(pool: LearnPool, game: SavedGame) {
	try {
		sessionStorage.setItem(KEY_PREFIX + pool, JSON.stringify(game));
	} catch {
		// Nothing to do: the round just won't survive a reload.
	}
}
