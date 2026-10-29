// "Today" means the station's today, not the viewer's. Detections are stamped
// with the station's own wall clock, so a visitor whose computer sits in
// another zone would otherwise land on a day the station hasn't reached yet
// (or has already left) for a few hours every night.
//
// The server runs on the station, so its own zone is the station's. The
// browser learns it from a line the server writes into the page's <head>
// (see `stationTimeZoneScript`), set before any app code runs.

declare global {
	interface Window {
		__songbookStationTimeZone?: string;
	}
}

function runtimeTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The station's IANA time zone, e.g. "America/Chicago". */
export function stationTimeZone(): string {
	if (typeof window !== "undefined") {
		return window.__songbookStationTimeZone ?? runtimeTimeZone();
	}
	return runtimeTimeZone();
}

/**
 * The inline script that hands the station's zone to the browser. Rendered by
 * the server and again by the browser while hydrating; both read the same
 * zone, so the two renders match.
 */
export function stationTimeZoneScript(): string {
	// Zone names are plain ASCII, but escape `<` anyway: this lands in a
	// <script> tag.
	const zone = JSON.stringify(stationTimeZone()).replace(/</g, "\\u003c");
	return `window.__songbookStationTimeZone=${zone}`;
}

const DAY_FORMATS = new Map<string, Intl.DateTimeFormat>();

function dayFormat(zone: string): Intl.DateTimeFormat {
	let format = DAY_FORMATS.get(zone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		DAY_FORMATS.set(zone, format);
	}
	return format;
}

/** The station's calendar day at `now`, "YYYY-MM-DD". */
export function stationToday(
	now: Date = new Date(),
	zone: string = stationTimeZone(),
): string {
	let parts: Intl.DateTimeFormatPart[];
	try {
		parts = dayFormat(zone).formatToParts(now);
	} catch {
		// An unknown zone name: the runtime's own day is the best left.
		parts = dayFormat(runtimeTimeZone()).formatToParts(now);
	}
	const part = (type: string) => parts.find((p) => p.type === type)?.value;
	return `${part("year")}-${part("month")}-${part("day")}`;
}
