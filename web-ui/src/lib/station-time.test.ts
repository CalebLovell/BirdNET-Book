import assert from "node:assert/strict";
import { test } from "node:test";

import { stationToday } from "~/lib/station-time.ts";

// 04:50 UTC on Oct 30th: still the 29th in Chicago, already the 30th in Paris.
const lateEvening = new Date("2026-10-30T04:50:00Z");

test("today is the station's calendar day, whatever the viewer's zone", () => {
	assert.equal(stationToday(lateEvening, "America/Chicago"), "2026-10-29");
	assert.equal(stationToday(lateEvening, "Europe/Paris"), "2026-10-30");
	assert.equal(stationToday(lateEvening, "UTC"), "2026-10-30");
});

test("an unknown zone falls back to a real day rather than throwing", () => {
	assert.match(stationToday(lateEvening, "Not/AZone"), /^\d{4}-\d{2}-\d{2}$/);
});
