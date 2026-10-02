import assert from "node:assert/strict";
import test from "node:test";

import {
	buildHighlights,
	formatAway,
	formatVocal,
	type HighlightFacts,
	MAX_NAMED_BIRDS,
	thanPhrase,
	VOCAL_MIN_DETECTIONS,
	VOLUME_BASELINE_MIN,
	vocalJump,
} from "./highlights-data.ts";

const activity: NonNullable<HighlightFacts["activity"]> = {
	baselineLabel: "your two-week average",
	windowPerDay: 100,
	baselinePerDay: 100,
	windowDetections: 100,
	inProgress: false,
	windowSpecies: 20,
	baselineSpecies: 20,
};

/** A window with nothing notable, over a station with plenty of history. */
function facts(overrides: Partial<HighlightFacts> = {}): HighlightFacts {
	const hourCounts = Array<number>(24).fill(0);
	hourCounts[6] = 60;
	hourCounts[18] = 40;
	return {
		detections: 100,
		hourCounts,
		newSpecies: [],
		returning: [],
		rare: [],
		vocal: [],
		comparedWith: "the four weeks before",
		breakingRoutine: [],
		activity,
		...overrides,
	};
}

const kinds = (input: HighlightFacts) =>
	buildHighlights(input).map((line) => line.kind);

test("a window with nothing notable still names its busiest hour", () => {
	assert.deepEqual(buildHighlights(facts()), [
		{ kind: "busiest-hour", hour: 6 },
	]);
});

test("an empty window has no highlights at all -- not even routine or volume", () => {
	assert.deepEqual(
		buildHighlights(
			facts({
				detections: 0,
				hourCounts: Array(24).fill(0),
				breakingRoutine: [{ comName: "Robin", daysSilent: 3 }],
				activity: { ...activity, windowPerDay: 0 },
			}),
		),
		[],
	);
});

test("activity speaks only past the busy and quiet thresholds", () => {
	const at = (windowPerDay: number) =>
		kinds(facts({ activity: { ...activity, windowPerDay } }));
	assert.ok(at(130).includes("activity"));
	assert.ok(at(70).includes("activity"));
	assert.ok(!at(120).includes("activity"));
	assert.ok(!at(80).includes("activity"));
});

test("activity reports the change, the detections and the species difference", () => {
	const [line] = buildHighlights(
		facts({
			activity: {
				...activity,
				windowPerDay: 142,
				windowDetections: 142,
				windowSpecies: 24,
				baselineSpecies: 19.6,
			},
		}),
	);
	assert.deepEqual(line, {
		kind: "activity",
		direction: "up",
		percent: 42,
		baselineLabel: "your two-week average",
		detections: 142,
		perDay: false,
		speciesDelta: 4,
	});
});

test("a window still running reports its pace so far, without species", () => {
	const [line] = buildHighlights(
		facts({
			activity: {
				...activity,
				windowPerDay: 58.4,
				windowDetections: 175,
				inProgress: true,
			},
		}),
	);
	assert.equal(line.kind, "activity");
	if (line.kind !== "activity") return;
	assert.equal(line.direction, "down");
	assert.equal(line.detections, 58);
	assert.equal(line.perDay, true);
	assert.equal(line.speciesDelta, null);
});

test("stays quiet about volume on a station too quiet to judge", () => {
	const quiet = VOLUME_BASELINE_MIN - 1;
	assert.ok(
		!kinds(
			facts({
				activity: {
					...activity,
					baselinePerDay: quiet,
					windowPerDay: quiet * 3,
				},
			}),
		).includes("activity"),
	);
});

test("no comparison without a baseline", () => {
	assert.deepEqual(kinds(facts({ activity: null })), ["busiest-hour"]);
});

test("orders the lines activity, hour, then the birds", () => {
	assert.deepEqual(
		kinds(
			facts({
				activity: { ...activity, windowPerDay: 200 },
				newSpecies: ["Merlin"],
				returning: [{ comName: "Redwing", daysAway: 20 }],
				rare: [{ comName: "Hoopoe", lifetimeCount: 2 }],
				vocal: [{ comName: "Blue Jay", count: 30, usual: 10, ratio: 3 }],
				breakingRoutine: [{ comName: "Robin", daysSilent: 3 }],
			}),
		),
		["activity", "busiest-hour", "new", "returned", "rare", "vocal", "routine"],
	);
});

test("each bird carries what earned it its place", () => {
	const lines = buildHighlights(
		facts({
			returning: [{ comName: "Redwing", daysAway: 23 }],
			rare: [
				{ comName: "Hoopoe", lifetimeCount: 1 },
				{ comName: "Wryneck", lifetimeCount: 4 },
			],
			breakingRoutine: [{ comName: "Robin", daysSilent: 3 }],
		}),
	);
	const birds = Object.fromEntries(
		lines.flatMap((line) =>
			"birds" in line ? [[line.kind, line.birds.map((b) => b.note)]] : [],
		),
	);
	assert.deepEqual(birds, {
		returned: ["23 days"],
		rare: ["1 record ever", "4 records ever"],
		routine: ["silent 3 days"],
	});
});

test("names only the first few birds but counts them all", () => {
	const newSpecies = Array.from(
		{ length: MAX_NAMED_BIRDS + 3 },
		(_, index) => `Bird ${index}`,
	);
	const line = buildHighlights(facts({ newSpecies })).find(
		(candidate) => candidate.kind === "new",
	);
	assert.ok(line && "birds" in line);
	assert.equal(line.birds.length, MAX_NAMED_BIRDS);
	assert.equal(line.total, MAX_NAMED_BIRDS + 3);
});

test("heard far more than usual needs three times the usual daily rate", () => {
	const base = {
		windowDays: 7,
		baselineCount: 280,
		baselineDays: 28,
		daysHeard: 28,
	};
	// Usual is 10 a day, so 70 over the week; the week heard 210.
	assert.deepEqual(vocalJump({ ...base, windowCount: 210 }), {
		count: 210,
		usual: 70,
		ratio: 3,
	});
	assert.equal(vocalJump({ ...base, windowCount: 209 }), null);
});

test("heard far more than usual ignores a handful of stray calls", () => {
	assert.equal(
		vocalJump({
			windowCount: VOCAL_MIN_DETECTIONS - 1,
			windowDays: 1,
			baselineCount: 14,
			baselineDays: 14,
			daysHeard: 14,
		}),
		null,
	);
});

test("a bird the baseline never heard is not vocal -- it has no usual", () => {
	assert.equal(
		vocalJump({
			windowCount: 50,
			windowDays: 1,
			baselineCount: 0,
			baselineDays: 14,
			daysHeard: 0,
		}),
		null,
	);
});

test("a bird barely around before is an arrival, not a regular gone loud", () => {
	// September's robins: 80 against 4 detections on 4 of August's 31 days.
	const robin = {
		windowCount: 80,
		windowDays: 30,
		baselineCount: 4,
		baselineDays: 31,
	};
	assert.equal(vocalJump({ ...robin, daysHeard: 4 }), null);
	assert.ok(vocalJump({ ...robin, daysHeard: 8 }));
});

test("the vocal note gives the count against its usual", () => {
	assert.equal(formatVocal({ count: 76, usual: 4.6 }), "76, usually about 5");
	assert.equal(
		formatVocal({ count: 1148, usual: 247 }),
		"1,148, usually about 247",
	);
	assert.equal(formatVocal({ count: 12, usual: 0.3 }), "12, usually under 1");
});

test("the vocal line names what usual is", () => {
	assert.equal(thanPhrase("the two weeks before"), "than the two weeks before");
	assert.equal(
		thanPhrase("your two-week average"),
		"than your two-week average",
	);
	assert.equal(thanPhrase("August 2026"), "than in August 2026");
	assert.equal(
		thanPhrase("the same stretch of 2025"),
		"than the same stretch of 2025",
	);
	assert.equal(thanPhrase(null), "than usual");
	const [line] = buildHighlights(
		facts({
			activity: null,
			comparedWith: "August 2026",
			vocal: [{ comName: "Blue Jay", count: 30, usual: 10, ratio: 3 }],
		}),
	).filter((l) => l.kind === "vocal");
	assert.deepEqual(line, {
		kind: "vocal",
		total: 1,
		birds: [{ comName: "Blue Jay", note: "30, usually about 10" }],
		comparedWith: "August 2026",
	});
});

test("time away reads at the scale it happened on", () => {
	assert.equal(formatAway(1), "1 day");
	assert.equal(formatAway(34), "34 days");
	assert.equal(formatAway(59), "59 days");
	assert.equal(formatAway(60), "2 months");
	assert.equal(formatAway(412), "14 months");
	assert.equal(formatAway(800), "2 years");
});
