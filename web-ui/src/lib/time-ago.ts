// Elapsed-time labels for the Today page. Pure and isomorphic: the caller
// supplies the elapsed time, so nothing here reads the clock on its own (see
// use-age-offset.ts for why that matters to SSR).

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Nominal lengths: these labels are a sense of scale, not a calendar.
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function plural(value: number, unit: string): string {
	return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

/**
 * A human elapsed-time label. Anything under ten seconds -- including a
 * negative elapsed time, which happens when the station's clock runs slightly
 * ahead of the viewer's -- reads as "just now" rather than exposing the skew.
 */
export function formatTimeAgo(elapsedMs: number): string {
	if (elapsedMs < 10 * SECOND) return "just now";
	if (elapsedMs < MINUTE)
		return plural(Math.floor(elapsedMs / SECOND), "second");
	if (elapsedMs < HOUR) return plural(Math.floor(elapsedMs / MINUTE), "minute");
	if (elapsedMs < DAY) return plural(Math.floor(elapsedMs / HOUR), "hour");
	if (elapsedMs < MONTH) return plural(Math.floor(elapsedMs / DAY), "day");
	if (elapsedMs < YEAR) return plural(Math.floor(elapsedMs / MONTH), "month");
	return plural(Math.floor(elapsedMs / YEAR), "year");
}

/** Clock time for a "YYYY-MM-DD HH:MM:SS" detection timestamp, e.g. "3:47 PM". */
export function formatClockTime(timestamp: string): string {
	const time = timestamp.slice(11);
	return new Date(`1970-01-01T${time}`).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

/** An hour of the day on a 12-hour clock, e.g. "5 PM". */
export function hourLabel(hour: number): string {
	if (hour === 0) return "12 AM";
	if (hour < 12) return `${hour} AM`;
	if (hour === 12) return "12 PM";
	return `${hour - 12} PM`;
}

/**
 * The span of a visit, e.g. "6:02–6:24 AM", or one clock time when it all fell
 * inside a minute. The meridiem is said once when both ends share it.
 */
export function formatClockRange(first: string, last: string): string {
	const start = formatClockTime(first);
	const end = formatClockTime(last);
	if (start === end) return end;
	const meridiem = /\s?[AaPp]\.?[Mm]\.?$/.exec(end)?.[0];
	if (meridiem && start.endsWith(meridiem)) {
		return `${start.slice(0, -meridiem.length)}–${end}`;
	}
	return `${start}–${end}`;
}
