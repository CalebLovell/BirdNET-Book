// The app's one way of writing a date: "Sep 29, 2026", and with a time,
// "Sep 29, 2026, 12:15 PM". Pinned to en-US rather than the viewer's locale so
// the server's first paint and the browser's hydration always agree.
//
// Detection timestamps are the station's local wall-clock time with no zone, so
// they are parsed and printed as local time; the digits come back out as they
// went in, whatever zone the server or the viewer is in.

const DATE = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

function parse(date: string, time = "00:00:00"): Date | null {
	const parsed = new Date(`${date}T${time}`);
	return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

/** "Sep 29, 2026" from a "YYYY-MM-DD" date. */
export function formatDate(date: string): string {
	const parsed = parse(date.slice(0, 10));
	return parsed ? DATE.format(parsed) : date;
}

/**
 * "Sep 29, 2026, 12:15 PM" from either a "YYYY-MM-DD HH:MM:SS" timestamp or the
 * detections table's separate date and time columns.
 */
export function formatDateTime(dateOrTimestamp: string, time?: string): string {
	const date = dateOrTimestamp.slice(0, 10);
	const clock = time ?? dateOrTimestamp.slice(11);
	const parsed = parse(date, clock || undefined);
	return parsed
		? DATE_TIME.format(parsed)
		: [dateOrTimestamp, time].filter(Boolean).join(" ");
}
