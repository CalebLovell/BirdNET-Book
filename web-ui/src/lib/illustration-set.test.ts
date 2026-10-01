import assert from "node:assert/strict";
import test from "node:test";
import { inIllustrationSet } from "./illustration-set.ts";
import { illustrationUrlFor } from "./illustrations.ts";

test("the old set leaves a bundled URL alone", () => {
	assert.equal(
		inIllustrationSet("/illustrations/cyanocitta-cristata.png", "old"),
		"/illustrations/cyanocitta-cristata.png",
	);
});

test("the new set swaps both poses for a species it has a pair of", () => {
	assert.equal(
		inIllustrationSet("/illustrations/cyanocitta-cristata.png", "new"),
		"/illustrations-new/cyanocitta-cristata.png",
	);
	assert.equal(
		inIllustrationSet("/illustrations/cyanocitta-cristata-2.png", "new"),
		"/illustrations-new/cyanocitta-cristata-2.png",
	);
});

test("a species painted perched only shows that pose in the flight slot too", () => {
	assert.equal(
		inIllustrationSet("/illustrations/turdus-migratorius-2.png", "new"),
		"/illustrations-new/turdus-migratorius.png",
	);
});

test("the new set keeps the bundled art for a species it doesn't have yet", () => {
	assert.equal(
		inIllustrationSet("/illustrations/agelaius-phoeniceus.png", "new"),
		"/illustrations/agelaius-phoeniceus.png",
	);
});

test("a species only the new set has is drawn there and nowhere else", () => {
	const url = illustrationUrlFor("Tamias striatus");
	assert.equal(
		inIllustrationSet(url, "new"),
		"/illustrations-new/tamias-striatus.png",
	);
	assert.equal(inIllustrationSet(url, "old"), null);
});

test("no illustration stays no illustration", () => {
	assert.equal(inIllustrationSet(null, "new"), null);
	assert.equal(illustrationUrlFor("Genus nowhere"), null);
});
