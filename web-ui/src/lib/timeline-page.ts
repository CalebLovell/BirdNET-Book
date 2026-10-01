import { createServerFn } from "@tanstack/react-start";
import { min } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import { dayIdFor } from "~/lib/day.ts";
import { classifyDay } from "~/lib/day-range.ts";
import { readStationLocation } from "~/lib/station-location.server.ts";
import { sampleDays, type WindowSun, windowSun } from "~/lib/sun-times.ts";
import {
	loadTimelineData,
	loadTimelineNav,
	type TimelineData,
	type TimelineNav,
	type TimelineRow,
} from "~/lib/timeline.ts";
import type { TimelinePeriod } from "~/lib/timeline-periods.ts";
import { type TimelineAnchor, windowFor } from "~/lib/timeline-window.ts";

export type TimelinePageRequest = {
	period: TimelinePeriod;
	/** Ignored when the period is "all". */
	anchor: TimelineAnchor;
};

/**
 * A day whose anchor names no reviewable day: still ahead, before the station
 * was listening, or not a date at all. Every other window resolves to rows.
 */
export type DayOutOfRange =
	| { status: "malformed" }
	| { status: "future" }
	| { status: "before-station"; firstRecorded: string };

/**
 * Every period now draws the same body -- species-by-hour, detections-by-hour
 * and the species grid -- all built from one set of rows. The only exception is
 * a Daily anchor that falls outside the station's history, which has no window
 * to draw and replaces the page with an explanation instead.
 */
export type TimelineBody =
	| {
			kind: "rows";
			rows: TimelineRow[];
			highlights: TimelineData["highlights"];
			/** The window's average sunrise and sunset, for the heat map's
			    sunrise start -- or why there isn't one. */
			sun: WindowSun;
	  }
	| { kind: "day-out-of-range"; result: DayOutOfRange };

export type TimelinePageData = TimelineNav & { body: TimelineBody };

export const getTimelinePage = createServerFn({ method: "GET" })
	.validator((request: TimelinePageRequest) => request)
	.handler(async ({ data: { period, anchor } }): Promise<TimelinePageData> => {
		// The Daily period keeps the range check the day review used to carry: a
		// date still ahead, or before the station's first recording, has no window
		// to resolve and gets its own message rather than an empty grid.
		if (period === "day") {
			const [range] = await db
				.select({ firstRecorded: min(detections.Date) })
				.from(detections);
			const firstRecorded = range?.firstRecorded ?? null;
			const verdict = classifyDay(anchor, dayIdFor(new Date()), firstRecorded);

			if (verdict !== "in-range") {
				const result: DayOutOfRange =
					verdict === "before-station"
						? {
								status: "before-station",
								firstRecorded: firstRecorded ?? anchor,
							}
						: { status: verdict };
				// A window still lets the toolbar draw around the message.
				const nav = await loadTimelineNav("day", windowFor("day", anchor));
				return { ...nav, body: { kind: "day-out-of-range", result } };
			}
		}

		const [{ rows, highlights, ...nav }, location] = await Promise.all([
			loadTimelineData({ period, anchor }),
			readStationLocation(),
		]);
		const sun = location
			? windowSun(
					sunDays(nav),
					location.latitude,
					location.longitude,
					location.timezone,
				)
			: ({ available: false, reason: "no-location" } as const);
		return { ...nav, body: { kind: "rows", rows, highlights, sun } };
	});

/**
 * The days whose sunrise the window averages: the window itself, stopping at
 * today so a month still running isn't pulled toward the weeks it hasn't had
 * -- unless the whole window is still ahead, when its own days are all there
 * is. All Time spans the station's history.
 */
function sunDays(nav: TimelineNav): string[] {
	if (nav.window) {
		const today = dayIdFor(new Date());
		const end = nav.window.end > today ? today : nav.window.end;
		return end >= nav.window.start
			? sampleDays(nav.window.start, end)
			: sampleDays(nav.window.start, nav.window.end);
	}
	return nav.stationRange
		? sampleDays(nav.stationRange.first, nav.stationRange.last)
		: [];
}
