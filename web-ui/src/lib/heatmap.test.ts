import assert from "node:assert/strict";
import test from "node:test";

import { heatColor, heatInk, heatMaximum, heatShare } from "~/lib/heatmap.ts";

test("the scale's top is the busiest hour of any row", () => {
	assert.equal(
		heatMaximum([{ hourCounts: [1, 4, 2] }, { hourCounts: [0, 90, 3] }]),
		90,
	);
	assert.equal(heatMaximum([]), 0);
});

test("the ends of the ramp: floor at one detection, full moss at the busiest", () => {
	assert.equal(heatShare(1, 1_200), 0);
	assert.equal(heatShare(1_200, 1_200), 1);
	assert.equal(heatColor(1_200, 1_200), "var(--moss)");
	assert.equal(heatColor(0, 1_200), "var(--paper)");
});

test("small counts spread out instead of sharing the palest shade", () => {
	// On a linear scale 5, 50 and 500 of 1,200 would be 0.4%, 4% and 42%: the
	// first two indistinguishable. The log scale spaces them evenly.
	const shares = [5, 50, 500].map((count) => heatShare(count, 1_200));
	assert.ok(shares[0] > 0.2);
	assert.ok(shares[1] - shares[0] > 0.3);
	assert.ok(shares[2] - shares[1] > 0.3);
	// Every distinct count gets a distinct colour.
	assert.notEqual(heatColor(2, 1_200), heatColor(3, 1_200));
});

test("a quiet bird stays pale on the shared scale", () => {
	assert.ok(heatShare(2, 200) < 0.2);
	assert.equal(heatInk(2, 200), "var(--foreground)");
	assert.equal(heatInk(200, 200), "var(--paper)");
});
