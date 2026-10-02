import assert from "node:assert/strict";
import test from "node:test";

import type { Highlight } from "./highlights-data.ts";
import { formatHighlightLines, nightShare } from "./highlights-share.ts";

function hours(counts: Record<number, number>): number[] {
	return Array.from({ length: 24 }, (_, hour) => counts[hour] ?? 0);
}

test("says how the window compared with its baseline", () => {
	const lines = formatHighlightLines([
		{
			kind: "activity",
			direction: "up",
			percent: 42,
			baselineLabel: "the four weeks before",
			detections: 812,
			perDay: false,
			speciesDelta: 4,
		},
	]);

	assert.deepEqual(lines, [
		"📈 Up 42% on the four weeks before · 812 detections, 4 more species",
	]);
});

test("gives a running window's pace rather than its total", () => {
	const lines = formatHighlightLines([
		{
			kind: "activity",
			direction: "down",
			percent: 35,
			baselineLabel: "the two weeks before",
			detections: 120,
			perDay: true,
			speciesDelta: null,
		},
	]);

	assert.deepEqual(lines, [
		"📉 Down 35% on the two weeks before · 120 detections a day so far",
	]);
});

test("names the usual species count rather than a zero difference", () => {
	const [line] = formatHighlightLines([
		{
			kind: "activity",
			direction: "up",
			percent: 50,
			baselineLabel: "the year before",
			detections: 1,
			perDay: false,
			speciesDelta: 0,
		},
	]);

	assert.equal(
		line,
		"📈 Up 50% on the year before · 1 detection, the usual number of species",
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
		{ kind: "vocal", total: 1, birds: [{ comName: "Blue Jay", note: "3.2×" }] },
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
		"📣 More vocal than usual: Blue Jay (3.2×)",
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
