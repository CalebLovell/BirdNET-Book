import assert from "node:assert/strict";
import test from "node:test";
import { illustrationUrlFor } from "./illustrations.ts";

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
