import assert from "node:assert/strict";
import test from "node:test";

import {
	formatTimelineShareCard,
	type TimelineShareCard,
	type TimelineShareRow,
} from "./timeline-share.ts";

/** Counts at the given hours, zero everywhere else. */
function hours(counts: Record<number, number>): number[] {
	return Array.from({ length: 24 }, (_, hour) => counts[hour] ?? 0);
}

function rowWith(overrides: Partial<TimelineShareRow> = {}): TimelineShareRow {
	const hourCounts = overrides.hourCounts ?? hours({ 6: 10 });
	return {
		comName: "American Robin",
		hourCounts,
		totalDetections: hourCounts.reduce((a, b) => a + b, 0),
		...overrides,
	};
}

function cardWith(
	overrides: Partial<TimelineShareCard> = {},
): TimelineShareCard {
	return {
		period: "week",
		windowLabel: "Jul 21 – Jul 27, 2026",
		rows: [
			rowWith({
				comName: "American Robin",
				hourCounts: hours({ 6: 40, 7: 20 }),
			}),
			rowWith({ comName: "House Finch", hourCounts: hours({ 8: 30 }) }),
			rowWith({ comName: "Song Sparrow", hourCounts: hours({ 9: 10 }) }),
		],
		highlights: [],
		...overrides,
	};
}

test("heads the card with the window and its totals", () => {
	const lines = formatTimelineShareCard(cardWith()).split("\n");

	assert.equal(lines[0], "🐦 BirdNET-Book · Timeline");
	assert.equal(
		lines[1],
		"📅 Jul 21 – Jul 27, 2026 · 3 species · 100 detections",
	);
});

test("names all time in place of a window label", () => {
	const text = formatTimelineShareCard(
		cardWith({ period: "all", windowLabel: null }),
	);

	assert.match(text, /^♾️ All time · /m);
});

test("draws the window's hour profile under a full-day axis", () => {
	const lines = formatTimelineShareCard(
		cardWith({
			rows: [rowWith({ hourCounts: hours({ 0: 1, 6: 8 }) })],
		}),
	).split("\n");

	assert.equal(lines[3], `▂${"▁".repeat(5)}█${"▁".repeat(17)}`);
	assert.equal(lines[4], `12am ${"─".repeat(14)} 11pm`);
	assert.equal(lines[4].length, lines[3].length);
});

test("ranks the three busiest species", () => {
	const text = formatTimelineShareCard(cardWith());

	assert.match(text, /^🥇 American Robin ×60$/m);
	assert.match(text, /^🥈 House Finch ×30$/m);
	assert.match(text, /^🥉 Song Sparrow ×10$/m);
});

test("calls the peak hour across every species in the window", () => {
	const text = formatTimelineShareCard(cardWith());

	assert.match(text, /^🌅 Peak hour: 6 AM · 40 detections$/m);
});

test("counts a lone detection in the singular", () => {
	const text = formatTimelineShareCard(
		cardWith({ rows: [rowWith({ hourCounts: hours({ 6: 1 }) })] }),
	);

	assert.match(text, /· 1 species · 1 detection$/m);
	assert.match(text, /^🌅 Peak hour: 6 AM · 1 detection$/m);
});

test("carries the page's highlights after its own lines", () => {
	const lines = formatTimelineShareCard(
		cardWith({
			highlights: [
				{
					kind: "activity",
					direction: "up",
					percent: 42,
					baselineLabel: "last week",
					detectionsDelta: 30,
					speciesDelta: 2,
				},
				{ kind: "busiest-hour", hour: 6 },
				{
					kind: "new",
					total: 3,
					birds: [
						{ comName: "Indigo Bunting", note: null },
						{ comName: "Wood Thrush", note: null },
						{ comName: "Veery", note: null },
					],
				},
			],
		}),
	).split("\n");

	assert.deepEqual(lines.slice(-3), [
		"🌅 Peak hour: 6 AM · 40 detections",
		"📈 Up 42% from last week · 30 more detections, 2 more species",
		"🐣 First ever: Indigo Bunting, Wood Thrush, Veery",
	]);
});

test("reports the share of detections heard after dark", () => {
	const text = formatTimelineShareCard(
		cardWith({
			rows: [rowWith({ hourCounts: hours({ 2: 25, 12: 75 }) })],
		}),
	);

	assert.match(text, /^🌙 25% heard after dark$/m);
});

test("stays quiet about the night when nothing was heard in it", () => {
	assert.doesNotMatch(formatTimelineShareCard(cardWith()), /🌙/);
});

test("says so plainly when the window holds nothing", () => {
	const text = formatTimelineShareCard(cardWith({ rows: [] }));

	assert.equal(
		text,
		"🐦 BirdNET-Book · Timeline\n📅 Jul 21 – Jul 27, 2026\n🤫 Nothing heard that week.",
	);
});

test("names the empty period the way that period reads", () => {
	const text = formatTimelineShareCard(
		cardWith({ period: "month", windowLabel: "July 2026", rows: [] }),
	);

	assert.match(text, /🤫 Nothing heard that month\.$/);
});
