// When the sun rises and sets over a timeline window, at the station, in the
// station's own clock time. The heat map can start its day at sunrise rather
// than midnight; this works out which clock hour that is. Pure -- the station's
// location comes in from the server (station-location.server.ts).

import { getTimes } from "suncalc";

export type WindowSun =
	| {
			available: true;
			/** Average sunrise across the window, minutes past local midnight. */
			sunriseMinutes: number;
			sunsetMinutes: number;
			/** The clock hour each average falls in, 0-23. */
			sunriseHour: number;
			sunsetHour: number;
			/** How many days went into the average. */
			days: number;
	  }
	| {
			available: false;
			/**
			 * no-location: the station sits at (0, 0), the unset default.
			 * polar: some day in the window has no sunrise or no sunset.
			 * no-data: the window has no days to average.
			 */
			reason: "no-location" | "polar" | "no-data";
	  };

const DAY_MS = 86_400_000;

/** Enough days for a steady average; a year's worth would only cost time. */
const MAX_SAMPLES = 60;

/**
 * Up to `max` days from `start` to `end` inclusive, spread evenly and always
 * keeping both ends. A short range comes back whole.
 */
export function sampleDays(
	start: string,
	end: string,
	max = MAX_SAMPLES,
): string[] {
	const first = Date.parse(`${start}T00:00:00Z`);
	const last = Date.parse(`${end}T00:00:00Z`);
	const span = Math.round((last - first) / DAY_MS) + 1;
	if (!(span > 0)) return [];
	const count = Math.min(span, max);
	const days: string[] = [];
	for (let index = 0; index < count; index++) {
		const offset =
			count === 1 ? 0 : Math.round((index * (span - 1)) / (count - 1));
		days.push(new Date(first + offset * DAY_MS).toISOString().slice(0, 10));
	}
	return days;
}

function localMinutes(instant: Date, clock: Intl.DateTimeFormat): number {
	const parts = clock.formatToParts(instant);
	const hour = Number(parts.find((part) => part.type === "hour")?.value);
	const minute = Number(parts.find((part) => part.type === "minute")?.value);
	return hour * 60 + minute;
}

/**
 * The window's average sunrise and sunset, as local clock time in `timeZone`.
 * Clock time on purpose: the heat map's columns are clock hours, so a summer
 * sunrise under daylight saving should land an hour later than solar time.
 */
export function windowSun(
	days: string[],
	latitude: number,
	longitude: number,
	timeZone: string,
): WindowSun {
	if (latitude === 0 && longitude === 0) {
		return { available: false, reason: "no-location" };
	}
	if (days.length === 0) return { available: false, reason: "no-data" };

	const clock = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});

	let sunriseTotal = 0;
	let sunsetTotal = 0;
	for (const day of days) {
		// Asked at roughly the station's solar noon, so suncalc settles on this
		// day's sunrise and sunset rather than a neighbour's.
		const noon = new Date(
			Date.parse(`${day}T12:00:00Z`) - (longitude / 15) * 3_600_000,
		);
		// Null on a day the sun never crosses the horizon.
		const { sunrise, sunset } = getTimes(noon, latitude, longitude);
		if (
			!sunrise ||
			!sunset ||
			Number.isNaN(sunrise.getTime()) ||
			Number.isNaN(sunset.getTime())
		) {
			return { available: false, reason: "polar" };
		}
		sunriseTotal += localMinutes(sunrise, clock);
		sunsetTotal += localMinutes(sunset, clock);
	}

	const sunriseMinutes = Math.round(sunriseTotal / days.length);
	const sunsetMinutes = Math.round(sunsetTotal / days.length);
	return {
		available: true,
		sunriseMinutes,
		sunsetMinutes,
		sunriseHour: Math.floor(sunriseMinutes / 60) % 24,
		sunsetHour: Math.floor(sunsetMinutes / 60) % 24,
		days: days.length,
	};
}

/** Minutes past midnight as a 12-hour clock time, e.g. 402 -> "6:42 AM". */
export function formatSunClock(minutes: number): string {
	const hour = Math.floor(minutes / 60) % 24;
	const minute = String(minutes % 60).padStart(2, "0");
	const meridiem = hour < 12 ? "AM" : "PM";
	return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${meridiem}`;
}
