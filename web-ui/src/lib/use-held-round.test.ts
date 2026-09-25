import assert from "node:assert/strict";
import test from "node:test";

import type { LearnRound } from "./learn-round.ts";
import { shouldAdoptRound } from "./use-held-round.ts";

function round(id: string): LearnRound {
	return { id, questions: [], speciesInPool: 0 };
}

test("keeps the round in play when the loader reruns on its own", () => {
	assert.equal(
		shouldAdoptRound(
			{ round: round("a"), pool: "frequent" },
			{ round: round("b"), pool: "frequent" },
			false,
		),
		false,
	);
});

test("adopts the new round after a pool switch", () => {
	assert.equal(
		shouldAdoptRound(
			{ round: round("a"), pool: "frequent" },
			{ round: round("b"), pool: "all" },
			false,
		),
		true,
	);
});

test("adopts the new round once play again was asked for", () => {
	assert.equal(
		shouldAdoptRound(
			{ round: round("a"), pool: "frequent" },
			{ round: round("b"), pool: "frequent" },
			true,
		),
		true,
	);
});

test("waits for play again's round to actually arrive", () => {
	assert.equal(
		shouldAdoptRound(
			{ round: round("a"), pool: "frequent" },
			{ round: round("a"), pool: "frequent" },
			true,
		),
		false,
	);
});
