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
	MAX_NAMED_BIRDS,
} from "./highlights-data.ts";

/** A short-memory station, so the tallies below stay readable: three days
    back for Live and Day, two weeks for a week. */
const settings: HighlightThresholds = {
	...HIGHLIGHT_THRESHOLDS,
	// A Day's Regular streak of four days, this one included.
	consistent: { ...HIGHLIGHT_THRESHOLDS.consistent, streakDays: 4 },
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
		inProgress: false,
		before,
		// Unless a test says otherwise, the days a streak is counted back
		// through are just the periods it gave.
		daysBefore: before.map(
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
	assert.deepEqual(
		up.filter((h) => h.kind === "activity"),
		[
			{
				kind: "activity",
				direction: "up",
				percent: 25,
				baselineLabel: "yesterday",
				count: 5,
				delta: 1,
			},
		],
	);
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

test("a day's regular is on a streak, counted to its start", () => {
	const { flags, highlights } = judge({
		window: [day({ Robin: 5, Wren: 2 })],
		daysBefore: [
			...Array.from({ length: 40 }, () => new Set(["Robin", "Wren"])),
			// A day the station recorded nothing is stepped over.
			new Set<string>(),
			new Set(["Robin"]),
			new Set(["Jay"]),
		],
	});
	assert.equal(flags.get("Robin")?.isConsistent, true);
	assert.equal(flags.get("Robin")?.regularNote, "42 days straight");
	assert.equal(flags.get("Wren")?.regularNote, "41 days straight");
	assert.deepEqual(named(highlights, "consistent"), ["Robin", "Wren"]);
});

test("a day's streak needs the minimum run", () => {
	const short = judge({
		daysBefore: [new Set(["Robin"]), new Set(["Robin"]), new Set(["Jay"])],
	});
	assert.equal(short.flags.get("Robin")?.isConsistent, false);
	const long = judge({ before: daysBefore(3, { Robin: 1 }) });
	assert.equal(long.flags.get("Robin")?.regularNote, "4 days straight");
});

test("a week's or month's regular is heard on every day it recorded", () => {
	const { flags } = judge({
		period: "week",
		window: [
			day({ Robin: 3 }),
			day({}),
			day({ Robin: 1, Wren: 1 }),
			day({ Robin: 2 }),
		],
	});
	// The day the station was down doesn't count against it.
	assert.equal(flags.get("Robin")?.isConsistent, true);
	assert.equal(flags.get("Robin")?.regularNote, "every day this week");
	assert.equal(flags.get("Wren")?.isConsistent, false);
});

test("a year or all time is regular on over 90% of its days", () => {
	// Twenty recorded days -- a Jay on each -- with the Robin on 19 and the
	// Wren on 18.
	const yearDays = Array.from({ length: 20 }, (_, i) =>
		day({
			Jay: 1,
			...(i < 19 ? { Robin: 1 } : {}),
			...(i < 18 ? { Wren: 1 } : {}),
		}),
	);
	const { flags, highlights } = judge({
		period: "year",
		window: yearDays,
		before: [[day({})]],
	});
	assert.equal(flags.get("Robin")?.isConsistent, true);
	// 18 of 20 is exactly 90%, not over it.
	assert.equal(flags.get("Wren")?.isConsistent, false);
	assert.deepEqual(line(highlights, "consistent"), {
		kind: "consistent",
		total: 2,
		birds: [
			{ comName: "Jay", note: "100% of days" },
			{ comName: "Robin", note: "95% of days" },
		],
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
		birds: [{ comName: "Thrush", note: "1 day silent" }],
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
		["activity", "busiest-hour", "vocal", "consistent"],
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
			"vocal",
			"returned",
			"consistent",
			"routine",
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
