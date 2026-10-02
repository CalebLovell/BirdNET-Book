import assert from "node:assert/strict";
import test from "node:test";

import {
	HIGHLIGHT_THRESHOLDS,
	type HighlightThresholds,
} from "./highlight-thresholds.ts";
import {
	type DayTally,
	formatAwayIn,
	formatRate,
	formatVocal,
	type Highlight,
	type HighlightEvidence,
	judgeHighlights,
	lookbackLabel,
	MAX_NAMED_BIRDS,
	thanPhrase,
} from "./highlights-data.ts";

/** A short-memory station, so the tallies below stay readable: three days
    back for Live and Day, two weeks for a week. */
const settings: HighlightThresholds = {
	...HIGHLIGHT_THRESHOLDS,
	// A run of four days (three before this one), three weeks (two before).
	consistent: { ...HIGHLIGHT_THRESHOLDS.consistent, days: 4, weeks: 3 },
	goneQuiet: { days: 3, weeks: 2, months: 3 },
	returned: { days: 3, weeks: 2, months: 3 },
	vocal: { ...HIGHLIGHT_THRESHOLDS.vocal, days: 3, weeks: 2 },
};

const day = (entries: Record<string, number>): DayTally =>
	new Map(Object.entries(entries));

/** `n` whole days before a Day window, each the same tally. */
const daysBefore = (n: number, entries: Record<string, number>) =>
	Array.from({ length: n }, () => [day(entries)]);

const hours = () => {
	const counts = Array<number>(24).fill(0);
	counts[6] = 60;
	return counts;
};

function evidence(
	overrides: Partial<HighlightEvidence> = {},
): HighlightEvidence {
	const before = overrides.before ?? [];
	return {
		period: "day",
		window: [day({ Robin: 5 })],
		before,
		// Unless a test says otherwise, the history a run is counted against is
		// just the periods it gave.
		history: before.map(
			(unit) => new Set(unit.flatMap((tally) => Array.from(tally.keys()))),
		),
		hourCounts: hours(),
		lifetime: new Map([["Robin", 500]]),
		heardBefore: new Set(["Robin"]),
		awayDays: new Map(),
		silentDays: new Map(),
		...overrides,
	};
}

const judge = (input: Partial<HighlightEvidence>, with_ = settings) =>
	judgeHighlights(evidence(input), with_);

const line = (highlights: Highlight[], kind: Highlight["kind"]) =>
	highlights.find((h) => h.kind === kind);

const named = (highlights: Highlight[], kind: Highlight["kind"]) => {
	const found = line(highlights, kind);
	return found && "birds" in found
		? found.birds.map((bird) => bird.comName)
		: [];
};

test("an empty window has no highlights at all", () => {
	const { highlights } = judge({
		window: [day({})],
		before: daysBefore(3, { Robin: 9 }),
		hourCounts: Array(24).fill(0),
	});
	assert.deepEqual(highlights, []);
});

test("up or down shows whatever the size of the change", () => {
	const up = judge({ before: daysBefore(1, { Robin: 4 }) }).highlights;
	assert.deepEqual(line(up, "activity"), {
		kind: "activity",
		direction: "up",
		percent: 25,
		baselineLabel: "yesterday",
		detectionsDelta: 1,
		speciesDelta: 0,
	});
	const tiny = judge({
		window: [day({ Robin: 201 })],
		before: daysBefore(1, { Robin: 200, Wren: 1 }),
	}).highlights;
	assert.equal(line(tiny, "activity")?.kind, "activity");
	const level = judge({ before: daysBefore(1, { Robin: 5 }) }).highlights;
	assert.equal(
		(line(level, "activity") as { direction: string }).direction,
		"level",
	);
});

test("up or down is skipped when the period before recorded nothing", () => {
	const { highlights } = judge({ before: [[day({})]] });
	assert.equal(line(highlights, "activity"), undefined);
	assert.deepEqual(line(highlights, "busiest-hour"), {
		kind: "busiest-hour",
		hour: 6,
	});
});

test("new is the first record only; rare is records two to five", () => {
	const { flags, highlights } = judge({
		window: [day({ Robin: 5, Merlin: 3, Hoopoe: 1 })],
		lifetime: new Map([
			["Robin", 500],
			["Merlin", 3],
			["Hoopoe", 4],
		]),
		heardBefore: new Set(["Robin", "Hoopoe"]),
	});
	assert.equal(flags.get("Merlin")?.isNew, true);
	assert.equal(flags.get("Merlin")?.isRare, false);
	assert.equal(flags.get("Hoopoe")?.isRare, true);
	assert.deepEqual(named(highlights, "new"), ["Merlin"]);
	assert.deepEqual(named(highlights, "rare"), ["Hoopoe"]);
});

test("the rare threshold is the station's own", () => {
	const input = {
		window: [day({ Robin: 5, Jay: 2 })],
		lifetime: new Map([
			["Robin", 500],
			["Jay", 12],
		]),
		heardBefore: new Set(["Robin", "Jay"]),
	};
	assert.equal(judge(input).flags.get("Jay")?.isRare, false);
	assert.equal(
		judge(input, { ...settings, rareMax: 20 }).flags.get("Jay")?.isRare,
		true,
	);
});

test("all time has no new or rare birds", () => {
	const { flags } = judge({
		period: "all",
		window: [day({ Robin: 5, Merlin: 1 })],
		lifetime: new Map([["Merlin", 1]]),
		heardBefore: new Set(),
	});
	assert.equal(flags.get("Merlin")?.isNew, false);
	assert.equal(flags.get("Merlin")?.isRare, false);
});

test("consistent means every day of the lookback and of the window", () => {
	const steady = judge({ before: daysBefore(3, { Robin: 2 }) });
	assert.equal(steady.flags.get("Robin")?.isConsistent, true);
	assert.deepEqual(line(steady.highlights, "consistent"), {
		kind: "consistent",
		total: 1,
		birds: [{ comName: "Robin", note: "4 days in a row" }],
		scope: "every day",
	});

	const missed = judge({
		before: [[day({ Robin: 2 })], [day({ Wren: 1 })], [day({ Robin: 2 })]],
	});
	assert.equal(missed.flags.get("Robin")?.isConsistent, false);
});

test("a consistent bird's run is counted to its start, past the lookback", () => {
	const { flags } = judge({
		before: daysBefore(3, { Robin: 2 }),
		history: [
			...Array.from({ length: 40 }, () => new Set(["Robin"])),
			new Set<string>(),
			new Set(["Robin"]),
			new Set(["Wren"]),
		],
	});
	// 40 days, a day the station was down, one more, then a miss: 41 heard
	// days before this one.
	assert.equal(flags.get("Robin")?.streak, "42 days in a row");
});

test("a consistent bird's run is counted in the window's own unit", () => {
	const run = judge({
		before: [
			...daysBefore(4, { Robin: 2 }),
			[day({ Wren: 1 })],
			...daysBefore(3, { Robin: 2 }),
		],
	});
	assert.equal(run.flags.get("Robin")?.streak, "5 days in a row");

	const weeks = judge({
		period: "week",
		window: [day({ Robin: 3 })],
		before: [
			Array.from({ length: 7 }, () => day({ Robin: 1 })),
			Array.from({ length: 7 }, () => day({ Robin: 1 })),
			[day({ Wren: 1 })],
		],
	});
	assert.equal(weeks.flags.get("Robin")?.streak, "3 weeks in a row");
});

test("consistent skips a day the station was down, but needs every period watched", () => {
	const gap = judge({
		before: [[day({ Robin: 2 })], [day({})], [day({ Robin: 2 })]],
	});
	assert.equal(gap.flags.get("Robin")?.isConsistent, true);
	// A station only two days old has no three-day streak to keep.
	const young = judge({ before: daysBefore(2, { Robin: 2 }) });
	assert.equal(young.flags.get("Robin")?.isConsistent, false);
});

test("a week is consistent when heard in each week, not every day", () => {
	const { flags, highlights } = judge({
		period: "week",
		window: [day({ Robin: 3 }), day({ Wren: 1 })],
		// This file's station looks back two weeks.
		before: [
			[day({ Wren: 1 }), day({ Robin: 1 }), day({ Wren: 1 })],
			[day({ Robin: 1 }), day({ Wren: 1 })],
			[day({ Wren: 1 })],
		],
	});
	assert.equal(flags.get("Robin")?.isConsistent, true);
	assert.equal(flags.get("Robin")?.streak, "3 weeks in a row");
	assert.equal(
		(line(highlights, "consistent") as { scope?: string }).scope,
		"every week",
	);
});

test("a year or all time is consistent on over a share of its days", () => {
	const yearDays = [
		...Array.from({ length: 8 }, () => day({ Robin: 1 })),
		...Array.from({ length: 2 }, () => day({ Wren: 1 })),
	];
	const { flags, highlights } = judge({
		period: "year",
		window: yearDays,
		before: [[day({})]],
	});
	assert.equal(flags.get("Robin")?.isConsistent, true);
	assert.equal(flags.get("Wren")?.isConsistent, false);
	assert.deepEqual(line(highlights, "consistent"), {
		kind: "consistent",
		total: 1,
		birds: [{ comName: "Robin", note: "80% of days" }],
		scope: "on over 75% of days this year",
	});
});

test("gone quiet is heard in each period before and not at all now", () => {
	const { highlights } = judge({
		before: daysBefore(3, { Robin: 1, Thrush: 2 }),
		silentDays: new Map([["Thrush", 1]]),
	});
	assert.deepEqual(line(highlights, "routine"), {
		kind: "routine",
		total: 1,
		birds: [{ comName: "Thrush", note: "silent 1 day" }],
	});
	const patchy = judge({
		before: [[day({ Thrush: 1 })], [day({ Robin: 1 })], [day({ Thrush: 1 })]],
	});
	assert.equal(line(patchy.highlights, "routine"), undefined);
});

test("returned is silent for the whole lookback and back now", () => {
	const { flags, highlights } = judge({
		window: [day({ Robin: 5, Veery: 2 })],
		before: daysBefore(3, { Robin: 5 }),
		lifetime: new Map([
			["Robin", 500],
			["Veery", 40],
		]),
		heardBefore: new Set(["Robin", "Veery"]),
		awayDays: new Map([["Veery", 23]]),
	});
	assert.equal(flags.get("Veery")?.isReturned, true);
	assert.equal(flags.get("Veery")?.away, "23 days");
	assert.equal(flags.get("Robin")?.isReturned, false);
	assert.deepEqual(named(highlights, "returned"), ["Veery"]);
});

test("vocal needs the ratio, the detections and the presence", () => {
	// Usual is 2 a day on every one of the three days; the window heard 30.
	const loud = judge({
		window: [day({ Robin: 30 })],
		before: daysBefore(3, { Robin: 2 }),
	});
	assert.deepEqual(loud.flags.get("Robin")?.vocal, {
		count: 30,
		usual: 2,
		ratio: 15,
		period: "day",
	});
	assert.deepEqual(line(loud.highlights, "vocal"), {
		kind: "vocal",
		total: 1,
		birds: [{ comName: "Robin", note: "30 today, usually 2" }],
		comparedWith: "the past 3 days",
	});

	const few = judge({
		window: [day({ Robin: 9 })],
		before: daysBefore(3, { Robin: 1 }),
	});
	assert.equal(few.flags.get("Robin")?.vocal, null);

	// Heard on one of three recorded days, under a 50% presence bar: an
	// arrival, not a regular gone loud.
	const arrival = judge(
		{
			window: [day({ Robin: 5, Jay: 40 })],
			before: [
				[day({ Robin: 5, Jay: 1 })],
				[day({ Robin: 5 })],
				[day({ Robin: 5 })],
			],
		},
		{ ...settings, vocal: { ...settings.vocal, presence: 50 } },
	);
	assert.equal(arrival.flags.get("Jay")?.vocal, null);
});

test("tags stack: a regular can be consistent and vocal at once", () => {
	const { flags, highlights } = judge({
		window: [day({ Robin: 30 })],
		before: daysBefore(3, { Robin: 2 }),
	});
	const robin = flags.get("Robin");
	assert.equal(robin?.isConsistent, true);
	assert.notEqual(robin?.vocal, null);
	assert.deepEqual(
		highlights.map((h) => h.kind),
		["activity", "busiest-hour", "consistent", "vocal"],
	);
});

test("lines read in the card's order", () => {
	const { highlights } = judge({
		window: [day({ Robin: 30, Merlin: 1, Hoopoe: 1, Veery: 1 })],
		before: daysBefore(3, { Robin: 2, Thrush: 1 }),
		lifetime: new Map([
			["Robin", 500],
			["Merlin", 1],
			["Hoopoe", 3],
			["Veery", 50],
		]),
		heardBefore: new Set(["Robin", "Hoopoe", "Veery", "Thrush"]),
	});
	assert.deepEqual(
		highlights.map((h) => h.kind),
		[
			"activity",
			"busiest-hour",
			"new",
			"rare",
			"consistent",
			"routine",
			"returned",
			"vocal",
		],
	);
});

test("a line names a few birds and counts the rest", () => {
	const names = Array.from({ length: MAX_NAMED_BIRDS + 3 }, (_, i) => `B${i}`);
	const { highlights } = judge({
		window: [day(Object.fromEntries(names.map((name) => [name, 1])))],
		heardBefore: new Set(),
	});
	const found = line(highlights, "new");
	assert.ok(found && "birds" in found);
	assert.equal(found.total, MAX_NAMED_BIRDS + 3);
	assert.equal(found.birds.length, MAX_NAMED_BIRDS);
});

test("time away and time silent count in the window's own unit", () => {
	assert.equal(formatAwayIn(12, "day"), "12 days");
	assert.equal(formatAwayIn(12, "live"), "12 days");
	assert.equal(formatAwayIn(8, "week"), "1 week");
	assert.equal(formatAwayIn(23, "week"), "3 weeks");
	assert.equal(formatAwayIn(150, "month"), "5 months");
	assert.equal(formatAwayIn(40, "year"), "1 year");
	assert.equal(formatAwayIn(800, "year"), "2 years");
});

test("the vocal note counts in the window's own unit", () => {
	assert.equal(
		formatVocal({ count: 76, usual: 4.57, period: "day" }),
		"76 today, usually 5",
	);
	assert.equal(
		formatVocal({ count: 300, usual: 40, period: "week" }),
		"300 this week, usually 40",
	);
	assert.equal(formatRate(0.4), "under 1");
	assert.equal(formatRate(9.8), "10");
	assert.equal(formatRate(1234.4), "1,234");
});

test("lookbacks and comparisons read as plain phrases", () => {
	assert.equal(lookbackLabel(14, "day"), "the past 14 days");
	assert.equal(lookbackLabel(1, "week"), "last week");
	assert.equal(lookbackLabel(1, "day"), "yesterday");
	assert.equal(lookbackLabel(3, "month"), "the past 3 months");
	assert.equal(lookbackLabel(1, "year"), "last year");
	assert.equal(thanPhrase("the past 3 weeks"), "than in the past 3 weeks");
	assert.equal(thanPhrase("last year"), "than last year");
	assert.equal(thanPhrase("yesterday"), "than yesterday");
	assert.equal(thanPhrase(null), "than usual");
});
