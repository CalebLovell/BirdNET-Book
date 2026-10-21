import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { LearnRound } from "~/lib/learn-round.ts";
import {
	FRESH_PROGRESS,
	loadSavedGame,
	type SavedGame,
	saveGame,
} from "~/lib/learn-saved-game.ts";

// Node has no sessionStorage, so each test gets a fresh in-memory stand-in.
function memoryStorage(): Storage {
	const items = new Map<string, string>();
	return {
		get length() {
			return items.size;
		},
		clear: () => items.clear(),
		getItem: (key) => items.get(key) ?? null,
		key: (index) => [...items.keys()][index] ?? null,
		removeItem: (key) => {
			items.delete(key);
		},
		setItem: (key, value) => {
			items.set(key, value);
		},
	};
}

beforeEach(() => {
	globalThis.sessionStorage = memoryStorage();
});

const round = {
	id: "round-1",
	questions: [{}, {}],
	speciesInPool: 4,
} as unknown as LearnRound;

const game: SavedGame = {
	round,
	progress: {
		...FRESH_PROGRESS,
		index: 1,
		wrongGuesses: ["Turdus migratorius"],
		results: [{ attempts: 1 }],
	},
};

test("a saved game comes back as it was, for its own pool only", () => {
	saveGame("rare", game);
	assert.deepEqual(loadSavedGame("rare"), game);
	assert.equal(loadSavedGame("common"), null);
});

test("a save that can't drive the game reads as none", () => {
	sessionStorage.setItem("learn-game:v1:rare", "{not json");
	assert.equal(loadSavedGame("rare"), null);

	saveGame("rare", { round, progress: { ...game.progress, index: 2 } });
	assert.equal(loadSavedGame("rare"), null);
});

test("storage that throws is treated as empty, and saving doesn't throw", () => {
	globalThis.sessionStorage = {
		...memoryStorage(),
		getItem: () => {
			throw new Error("blocked");
		},
		setItem: () => {
			throw new Error("blocked");
		},
	};
	assert.equal(loadSavedGame("rare"), null);
	assert.doesNotThrow(() => saveGame("rare", game));
});
