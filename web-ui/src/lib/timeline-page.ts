import { createServerFn } from "@tanstack/react-start";
import { min } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import { dayIdFor } from "~/lib/day.ts";
import { classifyDay } from "~/lib/day-range.ts";
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
			previousTotals: TimelineData["previousTotals"];
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

		const { rows, previousTotals, ...nav } = await loadTimelineData({
			period,
			anchor,
		});
		return { ...nav, body: { kind: "rows", rows, previousTotals } };
	});
