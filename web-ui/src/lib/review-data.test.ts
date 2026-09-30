import assert from "node:assert/strict";
import test from "node:test";
import {
	normalizeReviewSearch,
	parseSpeciesCatalog,
	recategorizedFileName,
} from "./review-data.ts";

test("normalizes the review queue page", () => {
	assert.deepEqual(normalizeReviewSearch({ page: 3 }), { page: 3 });
	// Fractional, below the first page, not a number, or absent: page one.
	assert.deepEqual(normalizeReviewSearch({ page: 2.5 }), { page: 1 });
	assert.deepEqual(normalizeReviewSearch({ page: 0 }), { page: 1 });
	assert.deepEqual(normalizeReviewSearch({ page: "2" }), { page: 1 });
	assert.deepEqual(normalizeReviewSearch({}), { page: 1 });
});

test("parses and sorts the BirdNET species catalog", () => {
	assert.deepEqual(
		parseSpeciesCatalog(
			'{"Turdus migratorius":"American Robin","Cyanocitta cristata":"Blue Jay"}',
		),
		[
			{ sciName: "Turdus migratorius", comName: "American Robin" },
			{ sciName: "Cyanocitta cristata", comName: "Blue Jay" },
		],
	);
});

test("renames only the BirdNET species prefix", () => {
	assert.equal(
		recategorizedFileName(
			"American_Robin-90-2026-07-27-birdnet-06:00:00.mp3",
			"American Robin",
			"Blue Jay",
		),
		"Blue_Jay-90-2026-07-27-birdnet-06:00:00.mp3",
	);
	assert.equal(
		recategorizedFileName("other.mp3", "American Robin", "Blue Jay"),
		null,
	);
});
