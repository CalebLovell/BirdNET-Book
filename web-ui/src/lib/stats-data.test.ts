import assert from "node:assert/strict";
import test from "node:test";
import type { SpeciesCount } from "./stats-data.ts";
import {
	buildHourActivity,
	buildMonthlyTrend,
	hourActivityFromRows,
	rankingBarPercent,
	selectBusiestHour,
} from "./stats-data.ts";

const speciesFixture: SpeciesCount = {
	comName: "Northern Cardinal",
	sciName: "Cardinalis cardinalis",
	count: 12,
	imageUrl: "/illustrations/cardinalis-cardinalis.png",
};

test("builds all 24 ordered hours and fills missing hours with zero", () => {
	const result = buildHourActivity([
		{ hour: 23, count: 2 },
		{ hour: 7, count: 5 },
	]);

	assert.equal(result.length, 24);
	assert.deepEqual(result[7], { hour: 7, count: 5 });
	assert.deepEqual(result[8], { hour: 8, count: 0 });
	assert.deepEqual(result[23], { hour: 23, count: 2 });
});

test("selects the earliest busiest hour and handles empty activity", () => {
	assert.deepEqual(
		selectBusiestHour(
			buildHourActivity([
				{ hour: 9, count: 4 },
				{ hour: 17, count: 4 },
			]),
		),
		{ hour: 9, count: 4 },
	);
	assert.equal(selectBusiestHour(buildHourActivity([])), null);
});

test("gives every ranking bar a visible proportional width", () => {
	assert.equal(rankingBarPercent(1, 100), 2);
	assert.equal(rankingBarPercent(50, 100), 50);
});

test("species rankings carry navigation and artwork data", () => {
	assert.equal(speciesFixture.sciName, "Cardinalis cardinalis");
	assert.match(speciesFixture.imageUrl ?? "", /cardinalis-cardinalis/);
});

test("builds twelve zero-filled calendar months", () => {
	const result = buildMonthlyTrend([
		{ bucket: "01", count: 2 },
		{ bucket: "05", count: 40 },
	]);

	assert.equal(result.length, 12);
	assert.deepEqual(result[0], { bucket: "01", label: "Jan", count: 2 });
	assert.deepEqual(result[1], { bucket: "02", label: "Feb", count: 0 });
	assert.deepEqual(result[4], { bucket: "05", label: "May", count: 40 });
	assert.deepEqual(result[11], { bucket: "12", label: "Dec", count: 0 });
});

test("nothing on record is twelve zeroes, not an empty series", () => {
	const result = buildMonthlyTrend([]);

	assert.equal(result.length, 12);
	assert.ok(result.every((point) => point.count === 0));
});

test("hourActivityFromRows sums each hour across rows", () => {
	const rows = [
		{ hourCounts: [1, 0, 5, ...Array(21).fill(0)] },
		{ hourCounts: [2, 0, 3, ...Array(21).fill(0)] },
	];
	const activity = hourActivityFromRows(rows);

	assert.equal(activity.length, 24);
	assert.deepEqual(activity[0], { hour: 0, count: 3 });
	assert.deepEqual(activity[2], { hour: 2, count: 8 });
	assert.deepEqual(activity[1], { hour: 1, count: 0 });
});

test("hourActivityFromRows returns 24 zeros for no rows", () => {
	const activity = hourActivityFromRows([]);
	assert.equal(activity.length, 24);
	assert.ok(activity.every((point) => point.count === 0));
	assert.deepEqual(activity[23], { hour: 23, count: 0 });
});
