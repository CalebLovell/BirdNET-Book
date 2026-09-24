import assert from "node:assert/strict";
import test from "node:test";

import {
	anchorForDay,
	currentAnchor,
	isValidAnchor,
	previousPeriodStart,
	shortAnchorLabel,
	windowFor,
} from "./timeline-window.ts";

test("a day window is the single day it names", () => {
	assert.deepEqual(windowFor("day", "2026-07-28"), {
		start: "2026-07-28",
		end: "2026-07-28",
		label: "Tue, Jul 28, 2026",
	});
});

test("a week window runs Monday through Sunday", () => {
	const week = windowFor("week", "2026-W31");
	assert.equal(week.start, "2026-07-27");
	assert.equal(week.end, "2026-08-02");
	assert.equal(week.label, "Jul 27 – Aug 2, 2026");
});

test("a month window ends on the real last day", () => {
	assert.equal(windowFor("month", "2026-02").end, "2026-02-28");
	assert.equal(windowFor("month", "2024-02").end, "2024-02-29");
	assert.equal(windowFor("month", "2026-07").end, "2026-07-31");
});

test("a year window spans the whole calendar year", () => {
	assert.deepEqual(windowFor("year", "2026"), {
		start: "2026-01-01",
		end: "2026-12-31",
		label: "2026",
	});
});

test("all time has no window to resolve", () => {
	assert.equal(windowFor("all", ""), null);
});

test("a day maps to the anchor of the period containing it", () => {
	assert.equal(anchorForDay("day", "2026-07-28"), "2026-07-28");
	assert.equal(anchorForDay("week", "2026-07-28"), "2026-W31");
	assert.equal(anchorForDay("month", "2026-07-28"), "2026-07");
	assert.equal(anchorForDay("year", "2026-07-28"), "2026");
});

test("week anchors follow the ISO year, not the calendar year", () => {
	// Dec 31 2025 is a Wednesday, so its week's Thursday lands in 2026.
	assert.equal(anchorForDay("week", "2025-12-31"), "2026-W01");
	assert.equal(windowFor("week", "2026-W01").start, "2025-12-29");
	// Jan 1 2027 is a Friday, leaving it in the last week of 2026.
	assert.equal(anchorForDay("week", "2027-01-01"), "2026-W53");
});

test("every day of a week resolves to the same anchor", () => {
	const anchors = [
		"2026-07-27",
		"2026-07-28",
		"2026-07-29",
		"2026-07-30",
		"2026-07-31",
		"2026-08-01",
		"2026-08-02",
	].map((day) => anchorForDay("week", day));
	assert.deepEqual(new Set(anchors), new Set(["2026-W31"]));
	// The next day starts a new week rather than extending this one.
	assert.equal(anchorForDay("week", "2026-08-03"), "2026-W32");
});

test("an anchor round-trips back to itself through its window", () => {
	for (const anchor of ["2026-W01", "2026-W31", "2026-W53"]) {
		const { start } = windowFor("week", anchor);
		assert.equal(anchorForDay("week", start), anchor);
	}
});

test("the current anchor uses local calendar parts", () => {
	const noon = new Date(2026, 6, 28, 12, 0, 0);
	assert.equal(currentAnchor("day", noon), "2026-07-28");
	assert.equal(currentAnchor("week", noon), "2026-W31");
	assert.equal(currentAnchor("month", noon), "2026-07");
	assert.equal(currentAnchor("year", noon), "2026");
});

test("anchors are validated against their period's shape", () => {
	assert.equal(isValidAnchor("day", "2026-07-28"), true);
	assert.equal(isValidAnchor("day", "2026-07"), false);
	assert.equal(isValidAnchor("week", "2026-W31"), true);
	assert.equal(isValidAnchor("week", "2026-31"), false);
	assert.equal(isValidAnchor("month", "2026-07"), true);
	assert.equal(isValidAnchor("month", "2026-07-28"), false);
	assert.equal(isValidAnchor("year", "2026"), true);
	assert.equal(isValidAnchor("year", "26"), false);
	assert.equal(isValidAnchor("day", "2026-13-45"), false);
	// Shapes that parse but name a day or week the calendar doesn't have.
	assert.equal(isValidAnchor("day", "2026-02-31"), false);
	assert.equal(isValidAnchor("month", "2026-13"), false);
	assert.equal(isValidAnchor("week", "2026-W53"), true);
	assert.equal(isValidAnchor("week", "2025-W53"), false);
	// "all" ignores whatever is left in the URL from another period.
	assert.equal(isValidAnchor("all", "2026-W31"), true);
});

test("the previous period starts one whole period back", () => {
	assert.equal(previousPeriodStart("day", "2026-05-25"), "2026-05-24");
	// Week of May 11 (2026-W20) sits after the week starting May 4.
	assert.equal(previousPeriodStart("week", "2026-W20"), "2026-05-04");
	assert.equal(previousPeriodStart("month", "2026-05"), "2026-04-01");
	assert.equal(previousPeriodStart("year", "2026"), "2025-01-01");
	// All time has no period before it, so nothing can have "returned".
	assert.equal(previousPeriodStart("all", ""), null);
});

test("the previous period crosses month, year and ISO-week boundaries", () => {
	// First of the month steps back into the prior month's first day.
	assert.equal(previousPeriodStart("day", "2026-03-01"), "2026-02-28");
	assert.equal(previousPeriodStart("month", "2026-01"), "2025-12-01");
	assert.equal(previousPeriodStart("year", "2025"), "2024-01-01");
	// Week 1 of 2026 (starts 2025-12-29) follows the last week of 2025.
	assert.equal(previousPeriodStart("week", "2026-W01"), "2025-12-22");
});

test("short anchor labels fit a phone's date stepper", () => {
	assert.equal(shortAnchorLabel("day", "2026-09-23"), "Sep 23, 2026");
	assert.equal(shortAnchorLabel("week", "2026-W39"), "Week 39, 2026");
	assert.equal(shortAnchorLabel("week", "2026-W01"), "Week 1, 2026");
	assert.equal(
		shortAnchorLabel("week", "2026-W39", { compact: true }),
		"Wk 39, 2026",
	);
	assert.equal(
		shortAnchorLabel("day", "2026-09-23", { compact: true }),
		"Sep 23, 2026",
	);
	assert.equal(shortAnchorLabel("month", "2026-09"), "Sep 2026");
	assert.equal(shortAnchorLabel("year", "2026"), "2026");
});
