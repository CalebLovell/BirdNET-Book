import assert from "node:assert/strict";
import test from "node:test";
import { illustrationUrlFor, paintedBoundsFor } from "./illustrations.ts";

test("a species with a new painting gets it in both poses", () => {
	assert.equal(
		illustrationUrlFor("Cyanocitta cristata"),
		"/illustrations-new/cyanocitta-cristata.png",
	);
	assert.equal(
		illustrationUrlFor("Cyanocitta cristata", "flight"),
		"/illustrations-new/cyanocitta-cristata-2.png",
	);
});

test("a species painted perched only shows that pose in the flight slot too", () => {
	assert.equal(
		illustrationUrlFor("Turdus migratorius", "flight"),
		"/illustrations-new/turdus-migratorius.png",
	);
});

test("a species not painted yet has no illustration", () => {
	assert.equal(illustrationUrlFor("Agelaius phoeniceus"), null);
	assert.equal(illustrationUrlFor("Genus nowhere"), null);
});

test("an illustration's painted bounds are found from its URL", () => {
	const url = illustrationUrlFor("Cyanocitta cristata", "flight");
	assert.ok(url);
	const bounds = paintedBoundsFor(url);
	assert.ok(bounds);
	const [x, y, width, height] = bounds;
	// Inside the 800px canvas, and smaller than it: the margin is what gets cut.
	assert.ok(x >= 0 && y >= 0 && x + width <= 800 && y + height <= 800);
	assert.ok(width * height < 800 * 800);
});

test("an image that isn't one of ours has no painted bounds", () => {
	assert.equal(paintedBoundsFor("/illustrations-new/genus-nowhere.png"), null);
	assert.equal(paintedBoundsFor("https://example.com/bird.png"), null);
});
