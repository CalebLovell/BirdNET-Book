import assert from "node:assert/strict";
import test from "node:test";

import { formatShareCard, type ShareCard, sparkline } from "./share-card.ts";

function cardWith(overrides: Partial<ShareCard> = {}): ShareCard {
	return {
		date: "2026-07-25",
		startHour: 21,
		hourlyCounts: Array.from({ length: 24 }, () => 1),
		species: 23,
		detections: 412,
		visits: 96,
		topSpecies: [
			{ comName: "American Robin", count: 88 },
			{ comName: "House Finch", count: 54 },
			{ comName: "Black-capped Chickadee", count: 41 },
		],
		busiestHour: { hour: 6, count: 74 },
		firstEver: [],
		rarest: null,
		...overrides,
	};
}

test("draws an empty hour lower than a merely quiet one", () => {
	assert.equal(sparkline([0, 1, 100]), "▁▂█");
});

test("scales a single spike against the rest", () => {
	assert.equal(sparkline([0, 0, 8, 0]), "▁▁█▁");
});

test("draws an all-silent window as a flat baseline", () => {
	assert.equal(sparkline([0, 0, 0]), "▁▁▁");
});

test("draws equal hours at equal height", () => {
	assert.equal(sparkline([5, 5, 5]), "███");
});

test("spans the full range between the quietest and busiest hour", () => {
	assert.equal(sparkline([1, 2, 3, 4, 5, 6, 7]), "▂▃▄▅▆▇█");
});

test("heads the card with the date and the day's totals", () => {
	const lines = formatShareCard(cardWith()).split("\n");

	assert.equal(lines[0], "🐦 BirdNET-Book · Jul 25");
	assert.equal(lines[1], "23 species · 412 detections · 96 visits");
});

test("counts a lone detection and visit in the singular", () => {
	const text = formatShareCard(
		cardWith({ species: 1, detections: 1, visits: 1 }),
	);

	assert.match(text, /^1 species · 1 detection · 1 visit$/m);
});

test("labels the sparkline from its starting hour to now", () => {
	const text = formatShareCard(cardWith({ startHour: 21 }));

	assert.match(text, /^9pm ─+ now$/m);
});

test("names midnight and noon on the axis without ambiguity", () => {
	assert.match(formatShareCard(cardWith({ startHour: 0 })), /^12am ─/m);
	assert.match(formatShareCard(cardWith({ startHour: 12 })), /^12pm ─/m);
});

test("ranks the top three species with medals", () => {
	const text = formatShareCard(cardWith());

	assert.match(text, /^🥇 American Robin ×88$/m);
	assert.match(text, /^🥈 House Finch ×54$/m);
	assert.match(text, /^🥉 Black-capped Chickadee ×41$/m);
});

test("ranks only the species that exist", () => {
	const text = formatShareCard(
		cardWith({ topSpecies: [{ comName: "American Robin", count: 88 }] }),
	);

	assert.match(text, /^🥇 American Robin ×88$/m);
	assert.doesNotMatch(text, /🥈/);
});

test("reports the busiest hour and its count", () => {
	assert.match(
		formatShareCard(cardWith()),
		/^🌅 Peak hour: 6 AM · 74 detections$/m,
	);
});

test("omits the peak hour when no hour stands out", () => {
	assert.doesNotMatch(formatShareCard(cardWith({ busiestHour: null })), /🌅/);
});

test("announces a species heard for the first time ever", () => {
	assert.match(
		formatShareCard(cardWith({ firstEver: ["Cedar Waxwing"] })),
		/^🐣 First ever: Cedar Waxwing$/m,
	);
});

test("counts the remaining newcomers after naming the first", () => {
	assert.match(
		formatShareCard(
			cardWith({ firstEver: ["Cedar Waxwing", "Merlin", "Sora"] }),
		),
		/^🐣 First ever: Cedar Waxwing \+2 more$/m,
	);
});

test("omits the newcomer line when nothing was new", () => {
	assert.doesNotMatch(formatShareCard(cardWith({ firstEver: [] })), /🐣/);
});

test("names the least-heard bird with its all-time tally", () => {
	assert.match(
		formatShareCard(
			cardWith({
				rarest: { comName: "Pileated Woodpecker", allTimeCount: 2 },
			}),
		),
		/^💎 Rarest: Pileated Woodpecker \(2nd ever\)$/m,
	);
});

test("spells the ordinal for tallies that break the usual pattern", () => {
	const ordinalFor = (allTimeCount: number) =>
		formatShareCard(cardWith({ rarest: { comName: "Sora", allTimeCount } }));

	assert.match(ordinalFor(3), /\(3rd ever\)/);
	assert.match(ordinalFor(4), /\(4th ever\)/);
	assert.match(ordinalFor(2), /\(2nd ever\)/);
});

test("stays quiet about a bird that is heard all the time", () => {
	assert.doesNotMatch(
		formatShareCard(
			cardWith({ rarest: { comName: "House Finch", allTimeCount: 11 } }),
		),
		/💎/,
	);
});

test("does not name the same bird as both newest and rarest", () => {
	const text = formatShareCard(
		cardWith({
			firstEver: ["Cedar Waxwing"],
			rarest: { comName: "Cedar Waxwing", allTimeCount: 1 },
		}),
	);

	assert.match(text, /🐣 First ever: Cedar Waxwing/);
	assert.doesNotMatch(text, /💎/);
});

test("collapses a silent window to a single quiet line", () => {
	const text = formatShareCard(
		cardWith({
			species: 0,
			detections: 0,
			visits: 0,
			hourlyCounts: Array.from({ length: 24 }, () => 0),
			topSpecies: [],
			busiestHour: null,
		}),
	);

	assert.equal(
		text,
		"🐦 BirdNET-Book · Jul 25\n🤫 Nothing heard in the last 24 hours.",
	);
});

test("runs a calendar day's axis from midnight to the last hour", () => {
	const text = formatShareCard(cardWith({ window: "day", startHour: 0 }));

	assert.match(text, /^12am ─+ 11pm$/m);
	assert.doesNotMatch(text, /now/);
});

test("keeps the axis the same width as the sparkline it labels", () => {
	const lines = formatShareCard(
		cardWith({ window: "day", startHour: 0 }),
	).split("\n");
	const chart = lines.find(
		(line) => line.startsWith("▂") || line.includes("█"),
	);
	const axis = lines.find((line) => line.includes("─"));

	assert.ok(chart && axis);
	assert.equal(axis.length, chart.length);
});

test("says a whole day was silent rather than the last 24 hours", () => {
	const text = formatShareCard(
		cardWith({
			window: "day",
			species: 0,
			detections: 0,
			visits: 0,
			hourlyCounts: Array.from({ length: 24 }, () => 0),
			topSpecies: [],
			busiestHour: null,
		}),
	);

	assert.equal(text, "🐦 BirdNET-Book · Jul 25\n🤫 Nothing heard all day.");
});

test("leaves no trailing blank line to paste", () => {
	assert.doesNotMatch(formatShareCard(cardWith()), /\n$/);
});

test("adds the page's highlights in place of its own first-ever line", () => {
	const text = formatShareCard(
		cardWith({
			window: "day",
			startHour: 0,
			firstEver: ["Indigo Bunting"],
			rarest: { comName: "Hooded Warbler", allTimeCount: 3 },
			highlights: [
				{
					kind: "new",
					total: 1,
					birds: [{ comName: "Indigo Bunting", note: null }],
				},
				{
					kind: "rare",
					total: 1,
					birds: [{ comName: "Hooded Warbler", note: "3 records ever" }],
				},
				{
					kind: "returned",
					total: 1,
					birds: [{ comName: "Wood Thrush", note: "23 days" }],
				},
			],
		}),
	);

	assert.equal(text.match(/Indigo Bunting/g)?.length, 1);
	assert.equal(text.match(/Hooded Warbler/g)?.length, 1);
	assert.match(text, /^🐣 First ever: Indigo Bunting$/m);
	assert.match(text, /^💎 Rare: Hooded Warbler \(3 records ever\)$/m);
	assert.match(text, /^🔁 Back: Wood Thrush \(23 days\)$/m);
});

test("reports a calendar day's share heard after dark", () => {
	const hourlyCounts = Array.from({ length: 24 }, (_, hour) =>
		hour === 2 ? 25 : hour === 12 ? 75 : 0,
	);
	const text = formatShareCard(
		cardWith({ window: "day", startHour: 0, hourlyCounts }),
	);

	assert.match(text, /^🌙 25% heard after dark$/m);
});

test("does not read night hours off a rolling window", () => {
	assert.doesNotMatch(formatShareCard(cardWith({ startHour: 21 })), /🌙/);
});
