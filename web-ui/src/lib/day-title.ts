import { spelledDate } from "~/lib/timeline-window.ts";

const WEEKDAY = new Intl.DateTimeFormat("en-US", {
	weekday: "long",
	timeZone: "UTC",
});

/** The long form of a calendar day, e.g. "Tuesday, July 28th, 2026". Used by
    the timeline masthead's out-of-range messages. */
export function formatDayTitle(date: string): string {
	return `${WEEKDAY.format(new Date(`${date}T00:00:00Z`))}, ${spelledDate(date)}`;
}
