// The Timeline page as one block of pasteable text, the period-scoped
// counterpart to share-card.ts. Where that card summarises a day, this one
// summarises whichever window the switcher is showing -- a day, a week, a
// month, a year or the whole station. Every line is short and stands on its
// own, so the card still reads on a phone that wraps anything wide.
//
// Pure by design: every figure comes from the rows the page already has, so
// sharing costs no extra round trip.

import type { Highlight } from "~/lib/highlights-data.ts";
import { formatHighlightLines } from "~/lib/highlights-share.ts";
import { shareHeader, shareTotals } from "~/lib/share-card.ts";
import type { TimelinePeriod } from "~/lib/timeline-periods.ts";

const HOURS = 24;

/** How each period names its own stretch of time in prose. */
const PERIOD_NOUN: Record<TimelinePeriod, string> = {
	day: "that day",
	week: "that week",
	month: "that month",
	year: "that year",
	all: "here",
};

export type TimelineShareRow = {
	comName: string;
	/** 24 counts, midnight first. */
	hourCounts: number[];
	totalDetections: number;
};

export type TimelineShareCard = {
	period: TimelinePeriod;
	/**
	 * The page header's title in pieces, e.g. ["Monthly", "October 2026"], or
	 * just ["All Time"]. See shareHeader for how the card prints them.
	 */
	heading: string[];
	rows: TimelineShareRow[];
	/** The page's own Highlights for the window -- see lib/highlights-data.ts. */
	highlights: Highlight[];
};

const MEDALS = ["🥇", "🥈", "🥉"] as const;

/** Sums the window's rows into one 24-hour profile. */
function hourTotals(rows: TimelineShareRow[]): number[] {
	const totals = Array.from({ length: HOURS }, () => 0);
	for (const row of rows) {
		for (let hour = 0; hour < HOURS; hour++) {
			totals[hour] += row.hourCounts[hour] ?? 0;
		}
	}
	return totals;
}

export function formatTimelineShareCard(card: TimelineShareCard): string {
	const { period, rows } = card;
	const header = shareHeader(card.heading);

	if (rows.length === 0) {
		return `${header}\n🤫  Nothing heard ${PERIOD_NOUN[period]}.`;
	}

	const detections = rows.reduce((sum, row) => sum + row.totalDetections, 0);
	const byHour = hourTotals(rows);

	const peakHour = byHour.reduce(
		(best, count, hour) => (count > byHour[best] ? hour : best),
		0,
	);

	const totals = shareTotals({
		species: rows.length,
		detections,
		peakHour: byHour[peakHour] > 0 ? peakHour : null,
		highlights: card.highlights,
	});

	// Ranked by the loader already, but sorting here keeps the card correct for
	// any caller and costs nothing at these sizes.
	const leaderboard = [...rows]
		.sort((a, b) => b.totalDetections - a.totalDetections)
		.slice(0, MEDALS.length)
		.map(
			(row, index) =>
				`${MEDALS[index]}  ${row.comName} · ${row.totalDetections.toLocaleString()}`,
		);

	// Highlights earn their place: a line is printed only when it has something
	// to say, so a quiet month produces a visibly shorter card than a good one.
	const highlights: string[] = [];

	// What the page's Highlights card found worth saying: the arrivals,
	// returns, rarities and absences.
	highlights.push(...formatHighlightLines(card.highlights));

	return [
		header,
		"",
		...totals,
		"",
		...leaderboard,
		...(highlights.length > 0 ? ["", ...highlights] : []),
	].join("\n");
}
