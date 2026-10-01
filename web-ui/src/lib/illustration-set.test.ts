import assert from "node:assert/strict";
import test from "node:test";
import { inIllustrationSet } from "./illustration-set.ts";

test("the old set leaves every URL alone", () => {
	assert.equal(
		inIllustrationSet("/illustrations/cyanocitta-cristata.png", "old"),
		"/illustrations/cyanocitta-cristata.png",
	);
});

test("the new set swaps both poses for a species it has", () => {
	assert.equal(
		inIllustrationSet("/illustrations/cyanocitta-cristata.png", "new"),
		"/illustrations-new/cyanocitta-cristata.png",
	);
	assert.equal(
		inIllustrationSet("/illustrations/cyanocitta-cristata-2.png", "new"),
		"/illustrations-new/cyanocitta-cristata-2.png",
	);
});

test("the new set keeps the bundled art for a species it doesn't have yet", () => {
	assert.equal(
		inIllustrationSet("/illustrations/cardinalis-cardinalis.png", "new"),
		"/illustrations/cardinalis-cardinalis.png",
	);
});

test("no illustration stays no illustration", () => {
	assert.equal(inIllustrationSet(null, "new"), null);
});
