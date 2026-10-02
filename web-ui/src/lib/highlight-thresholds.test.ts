import assert from "node:assert/strict";
import test from "node:test";

import { highlightGuide, lookbackFor } from "./highlight-thresholds.ts";

const meaning = (period: Parameters<typeof highlightGuide>[0], name: string) =>
	highlightGuide(period).find((entry) => entry.name === name)?.meaning;

test("each period looks back in its own unit, a year at the one before", () => {
	const lookback = { days: 14, weeks: 3, months: 2 };
	assert.equal(lookbackFor(lookback, "live"), 14);
	assert.equal(lookbackFor(lookback, "day"), 14);
	assert.equal(lookbackFor(lookback, "week"), 3);
	assert.equal(lookbackFor(lookback, "month"), 2);
	assert.equal(lookbackFor(lookback, "year"), 1);
	assert.equal(lookbackFor(lookback, "all"), 0);
});

test("the guide explains each line in the period's own terms", () => {
	assert.equal(meaning("day", "Up or down"), "Compared with yesterday.");
	assert.equal(
		meaning("live", "Up or down"),
		"Compared with the 24 hours before.",
	);
	assert.equal(meaning("day", "Regular"), "Heard 10+ days straight.");
	assert.equal(meaning("week", "Regular"), "Heard every day this week.");
	assert.equal(meaning("year", "Regular"), "Heard on over 90% of days.");
	assert.equal(
		meaning("day", "Gone quiet"),
		"Heard the past 10 days, not today.",
	);
	assert.equal(
		meaning("month", "Gone quiet"),
		"Heard the past 3 months, not this month.",
	);
	assert.equal(
		meaning("week", "Returned"),
		"Silent last week, back this week.",
	);
	assert.equal(meaning("day", "Vocal"), "3× its usual, vs. the past 10 days.");
	assert.equal(meaning("year", "Vocal"), "3× its usual, vs. last year.");
});

test("all time explains only the lines it can show", () => {
	assert.deepEqual(
		highlightGuide("all").map((entry) => entry.name),
		["Busiest hour", "Regular"],
	);
});
