import { createServerFn } from "@tanstack/react-start";

import { isDayId } from "~/lib/day.ts";
import type { HighlightThresholds } from "~/lib/highlight-thresholds.ts";
import { readHighlightThresholds } from "~/lib/settings-config.server.ts";
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
 * Every period now draws the same body -- species-by-hour, detections-by-hour
 * and the species grid -- all built from one set of rows. A day still ahead,
 * or before the station was listening, is just a quiet window like any other.
 * The only exception is a Daily anchor that isn't a date at all, which has no
 * window to draw and replaces the page with an explanation instead.
 */
export type TimelineBody =
	| {
			kind: "rows";
			rows: TimelineRow[];
			highlights: TimelineData["highlights"];
			/** The rules they were judged by, for the card's info tip. */
			thresholds: HighlightThresholds;
	  }
	| { kind: "not-a-date" };

export type TimelinePageData = TimelineNav & {
	/** The period this page was loaded for. A switch keeps the old page up for a
	    moment while the new one loads, so its cards read their period here,
	    never from the URL, which has already moved on. */
	period: TimelinePeriod;
	body: TimelineBody;
};

export const getTimelinePage = createServerFn({ method: "GET" })
	.validator((request: TimelinePageRequest) => request)
	.handler(async ({ data: { period, anchor } }): Promise<TimelinePageData> => {
		// Any real day loads, future and pre-station ones included, so the
		// picker can go anywhere; only a Daily anchor that isn't a date has no
		// window to resolve and gets its own message.
		if (period === "day" && !isDayId(anchor)) {
			const nav = await loadTimelineNav("day", windowFor("day", anchor));
			return { ...nav, period, body: { kind: "not-a-date" } };
		}

		const thresholds = await readHighlightThresholds();
		const { rows, highlights, ...nav } = await loadTimelineData({
			period,
			anchor,
			settings: thresholds,
		});
		return {
			...nav,
			period,
			body: { kind: "rows", rows, highlights, thresholds },
		};
	});
