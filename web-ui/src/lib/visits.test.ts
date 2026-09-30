import assert from "node:assert/strict";
import test from "node:test";

import { countVisits, countVisitsBySpecies, groupVisits } from "./visits.ts";

test("counts no visits without detections", () => {
	assert.equal(countVisits([]), 0);
});

test("counts a lone detection as one visit", () => {
	assert.equal(countVisits(["2026-07-25 06:12:03"]), 1);
});

test("collapses detections closer together than the gap into one visit", () => {
	assert.equal(
		countVisits([
			"2026-07-25 06:12:03",
			"2026-07-25 06:12:06",
			"2026-07-25 06:19:41",
		]),
		1,
	);
});

test("starts a new visit after a silence longer than the gap", () => {
	assert.equal(countVisits(["2026-07-25 06:12:03", "2026-07-25 06:40:00"]), 2);
});

test("treats a gap of exactly the threshold as the same visit", () => {
	assert.equal(countVisits(["2026-07-25 06:00:00", "2026-07-25 06:15:00"]), 1);
	assert.equal(countVisits(["2026-07-25 06:00:00", "2026-07-25 06:15:01"]), 2);
});

test("honors a custom gap threshold", () => {
	const timestamps = ["2026-07-25 06:00:00", "2026-07-25 06:04:00"];
	assert.equal(countVisits(timestamps, 5), 1);
	assert.equal(countVisits(timestamps, 3), 2);
});

test("clusters correctly regardless of input order", () => {
	assert.equal(
		countVisits([
			"2026-07-25 06:40:00",
			"2026-07-25 06:12:03",
			"2026-07-25 06:12:06",
		]),
		2,
	);
});

test("clusters across a midnight boundary", () => {
	assert.equal(countVisits(["2026-07-24 23:58:00", "2026-07-25 00:03:00"]), 1);
});

test("ignores unparseable timestamps", () => {
	assert.equal(countVisits(["not-a-timestamp", "2026-07-25 06:12:03"]), 1);
});

test("clusters each species independently", () => {
	const moments = [
		{ comName: "American Robin", timestamp: "2026-07-25 06:00:00" },
		{ comName: "Northern Cardinal", timestamp: "2026-07-25 06:00:30" },
		{ comName: "American Robin", timestamp: "2026-07-25 06:01:00" },
		{ comName: "American Robin", timestamp: "2026-07-25 09:00:00" },
	];

	// Robin: one morning visit plus a later one. Cardinal: a single visit.
	assert.equal(countVisitsBySpecies(moments), 3);
});

test("counts no visits across an empty species list", () => {
	assert.equal(countVisitsBySpecies([]), 0);
});

test("groups each species' detections into visits, newest visit first", () => {
	const visits = groupVisits([
		{ comName: "American Robin", timestamp: "2026-07-25 06:00:00" },
		{ comName: "Northern Cardinal", timestamp: "2026-07-25 06:01:00" },
		{ comName: "American Robin", timestamp: "2026-07-25 06:05:00" },
		{ comName: "American Robin", timestamp: "2026-07-25 07:00:00" },
	]);
	assert.deepEqual(
		visits.map((visit) => [
			visit.comName,
			visit.moments.map((moment) => moment.timestamp.slice(11)),
		]),
		[
			["American Robin", ["07:00:00"]],
			["American Robin", ["06:00:00", "06:05:00"]],
			["Northern Cardinal", ["06:01:00"]],
		],
	);
});

test("a visit interleaved with another species stays one visit", () => {
	const visits = groupVisits([
		{ comName: "Blue Jay", timestamp: "2026-07-25 06:00:00" },
		{ comName: "Carolina Wren", timestamp: "2026-07-25 06:00:03" },
		{ comName: "Blue Jay", timestamp: "2026-07-25 06:00:06" },
	]);
	assert.deepEqual(
		visits.map((visit) => [visit.comName, visit.moments.length]),
		[
			["Blue Jay", 2],
			["Carolina Wren", 1],
		],
	);
});

test("groups detections given in any order", () => {
	const visits = groupVisits([
		{ comName: "Blue Jay", timestamp: "2026-07-25 06:10:00" },
		{ comName: "Blue Jay", timestamp: "2026-07-25 06:00:00" },
	]);
	assert.equal(visits.length, 1);
	assert.equal(visits[0].moments[0].timestamp, "2026-07-25 06:00:00");
});

test("groups nothing into no visits", () => {
	assert.deepEqual(groupVisits([]), []);
});
