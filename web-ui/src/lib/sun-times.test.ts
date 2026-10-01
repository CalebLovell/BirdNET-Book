import assert from "node:assert/strict";
import test from "node:test";

import { formatSunClock, sampleDays, windowSun } from "~/lib/sun-times.ts";

const NEW_YORK = { latitude: 40.7128, longitude: -74.006 };

function near(actual: number, expected: number, slack = 3) {
	assert.ok(
		Math.abs(actual - expected) <= slack,
		`expected ${actual} within ${slack} of ${expected}`,
	);
}

test("New York's midsummer sunrise and sunset, in its own clock time", () => {
	const sun = windowSun(
		["2026-06-21"],
		NEW_YORK.latitude,
		NEW_YORK.longitude,
		"America/New_York",
	);
	assert.equal(sun.available, true);
	if (!sun.available) return;
	near(sun.sunriseMinutes, 5 * 60 + 25); // 5:25 AM EDT
	near(sun.sunsetMinutes, 20 * 60 + 31); // 8:31 PM EDT
	assert.equal(sun.sunriseHour, 5);
	assert.equal(sun.sunsetHour, 20);
	assert.equal(sun.days, 1);
});

test("several days average to one sunrise", () => {
	const one = windowSun(["2026-03-01"], 40.7128, -74.006, "America/New_York");
	const two = windowSun(["2026-03-31"], 40.7128, -74.006, "America/New_York");
	const both = windowSun(
		["2026-03-01", "2026-03-31"],
		40.7128,
		-74.006,
		"America/New_York",
	);
	assert.ok(one.available && two.available && both.available);
	if (!one.available || !two.available || !both.available) return;
	near(both.sunriseMinutes, (one.sunriseMinutes + two.sunriseMinutes) / 2, 1);
	assert.equal(both.days, 2);
});

test("an unset location (0, 0) has no sun to place", () => {
	assert.deepEqual(windowSun(["2026-06-21"], 0, 0, "UTC"), {
		available: false,
		reason: "no-location",
	});
});

test("a midnight-sun day has no sunrise", () => {
	assert.deepEqual(windowSun(["2026-06-21"], 69.65, 18.96, "Europe/Oslo"), {
		available: false,
		reason: "polar",
	});
});

test("no days, no sun", () => {
	assert.deepEqual(windowSun([], 40.7, -74, "America/New_York"), {
		available: false,
		reason: "no-data",
	});
});

test("long ranges are sampled, ends included; short ones kept whole", () => {
	const year = sampleDays("2026-01-01", "2026-12-31");
	assert.ok(year.length <= 60);
	assert.equal(year[0], "2026-01-01");
	assert.equal(year.at(-1), "2026-12-31");
	assert.deepEqual(sampleDays("2026-01-01", "2026-01-03"), [
		"2026-01-01",
		"2026-01-02",
		"2026-01-03",
	]);
});

test("clock minutes read as a 12-hour time", () => {
	assert.equal(formatSunClock(402), "6:42 AM");
	assert.equal(formatSunClock(19 * 60 + 5), "7:05 PM");
	assert.equal(formatSunClock(0), "12:00 AM");
});
