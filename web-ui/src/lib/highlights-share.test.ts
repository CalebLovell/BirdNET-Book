import assert from "node:assert/strict";
import test from "node:test";

import type { Highlight } from "./highlights-data.ts";
import { formatHighlightLines, nightShare } from "./highlights-share.ts";

function hours(counts: Record<number, number>): number[] {
	return Array.from({ length: 24 }, (_, hour) => counts[hour] ?? 0);
}

test("says how the window compared with the period before", () => {
	const lines = formatHighlightLines([
		{
			kind: "activity",
			direction: "up",
			percent: 42,
			baselineLabel: "last week",
			detectionsDelta: 240,
			speciesDelta: 4,
		},
	]);

	assert.deepEqual(lines, [
		"📈 Up 42% from last week · 240 more detections, 4 more species",
	]);
});

test("an unchanged window reads as level", () => {
	const [line] = formatHighlightLines([
		{
			kind: "activity",
			direction: "level",
			percent: 0,
			baselineLabel: "last year",
			detectionsDelta: 0,
			speciesDelta: 0,
		},
	]);

	assert.equal(
		line,
		"➡️ The same as last year · the same number of detections, the same number of species",
	);
});

test("leaves the busiest hour to the card's own peak-hour line", () => {
	assert.deepEqual(
		formatHighlightLines([{ kind: "busiest-hour", hour: 6 }]),
		[],
	);
});

test("writes each species highlight with its notes", () => {
	const highlights: Highlight[] = [
		{
			kind: "new",
			total: 1,
			birds: [{ comName: "Indigo Bunting", note: null }],
		},
		{
			kind: "returned",
			total: 2,
			birds: [
				{ comName: "Wood Thrush", note: "23 days" },
				{ comName: "Veery", note: "16 days" },
			],
		},
		{
			kind: "rare",
			total: 1,
			birds: [{ comName: "Hooded Warbler", note: "3 records ever" }],
		},
		{
			kind: "vocal",
			total: 1,
			birds: [{ comName: "Blue Jay", note: "30 this week, usually 9" }],
			comparedWith: "the past 3 months",
		},
		{
			kind: "routine",
			total: 1,
			birds: [{ comName: "Carolina Wren", note: "silent 3 days" }],
		},
	];

	assert.deepEqual(formatHighlightLines(highlights), [
		"🐣 First ever: Indigo Bunting",
		"🔁 Back: Wood Thrush (23 days), Veery (16 days)",
		"💎 Rare: Hooded Warbler (3 records ever)",
		"📣 Heard far more than in the past 3 months: Blue Jay (30 this week, usually 9)",
		"🤐 Gone quiet: Carolina Wren (silent 3 days)",
	]);
});

test("names a few birds and counts the rest", () => {
	const [line] = formatHighlightLines([
		{
			kind: "new",
			total: 7,
			birds: ["A", "B", "C", "D", "E"].map((comName) => ({
				comName,
				note: null,
			})),
		},
	]);

	assert.equal(line, "🐣 First ever: A, B, C +4 more");
});

test("rounds the share of detections heard after dark", () => {
	assert.equal(nightShare(hours({ 2: 25, 12: 75 })), 25);
	assert.equal(nightShare(hours({ 12: 10 })), 0);
	assert.equal(nightShare(hours({})), 0);
});
