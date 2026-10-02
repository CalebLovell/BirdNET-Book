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
	assert.equal(
		meaning("day", "Up or down"),
		"Detections and species this day against the day before.",
	);
	assert.equal(
		meaning("week", "Regular"),
		"Heard every week for at least 10 weeks in a row.",
	);
	assert.equal(
		meaning("month", "Gone quiet"),
		"Heard last month, but not this month.",
	);
	assert.equal(
		meaning("live", "Gone quiet"),
		"Heard every day of the past 10 days, but not today.",
	);
	assert.equal(
		meaning("week", "Returned"),
		"Heard before, silent all last week, and back this week.",
	);
	assert.equal(
		meaning("year", "Vocal"),
		"Heard at least 3× as much as usual, compared with last year.",
	);
	assert.equal(
		meaning("year", "Regular"),
		"Heard on over 75% of days this year.",
	);
});

test("all time explains only the lines it can show", () => {
	assert.deepEqual(
		highlightGuide("all").map((entry) => entry.name),
		["Busiest hour", "Regular"],
	);
});
