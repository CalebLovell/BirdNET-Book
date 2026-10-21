import assert from "node:assert/strict";
import test from "node:test";

import { familiarityPool, learnPoolMeanings } from "~/lib/learn-pools.ts";

test("rare is the app's rare cutoff, common is over 100, uncommon between", () => {
	assert.equal(familiarityPool(1, 5), "rare");
	assert.equal(familiarityPool(5, 5), "rare");
	assert.equal(familiarityPool(6, 5), "uncommon");
	assert.equal(familiarityPool(100, 5), "uncommon");
	assert.equal(familiarityPool(101, 5), "common");
});

test("a rare cutoff past 100 pushes common up rather than overlapping it", () => {
	assert.equal(familiarityPool(150, 150), "rare");
	assert.equal(familiarityPool(151, 150), "common");
});

test("the info tip states the same cutoffs", () => {
	const meanings = learnPoolMeanings(5);
	assert.equal(meanings.common, "species heard more than 100 times.");
	assert.equal(meanings.uncommon, "species heard 6 to 100 times.");
	assert.equal(meanings.rare, "species heard 5 or fewer times.");
});
