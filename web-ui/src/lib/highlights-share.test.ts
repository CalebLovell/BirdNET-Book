import assert from "node:assert/strict";
import test from "node:test";

import type { Highlight } from "./highlights-data.ts";
import { formatHighlightLines } from "./highlights-share.ts";

test("says how the window compared with the period before", () => {
	const lines = formatHighlightLines([
		{
			kind: "activity",
			direction: "up",
			percent: 42,
			baselineLabel: "last week",
			count: 812,
			delta: 240,
		},
	]);

	assert.deepEqual(lines, ["📈 Up 42% from last week · 240 more detections"]);
});

test("an unchanged window reads as level", () => {
	const [line] = formatHighlightLines([
		{
			kind: "activity",
			direction: "level",
			percent: 0,
			baselineLabel: "last year",
			count: 3120,
			delta: 4,
		},
	]);

	assert.equal(line, "➡️ The same as last year · 3,120 detections");
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
			birds: [{ comName: "Hooded Warbler", note: "3 total" }],
		},
		{
			kind: "vocal",
			total: 1,
			birds: [{ comName: "Blue Jay", note: "30 this week, usually 9" }],
		},
		{
			kind: "routine",
			total: 1,
			birds: [{ comName: "Carolina Wren", note: "3 days silent" }],
		},
	];

	assert.deepEqual(formatHighlightLines(highlights), [
		"🐣 New: Indigo Bunting",
		"🔁 Returned: Wood Thrush (23 days), Veery (16 days)",
		"💎 Rare: Hooded Warbler (3 total)",
		"📣 Vocal: Blue Jay (30 this week, usually 9)",
		"🤐 Gone quiet: Carolina Wren (3 days silent)",
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

	assert.equal(line, "🐣 New: A, B, C +4 more");
});
