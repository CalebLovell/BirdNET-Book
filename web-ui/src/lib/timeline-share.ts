// The Timeline page as one block of pasteable text, the period-scoped
// counterpart to share-card.ts. Where that card summarises a day, this one
// summarises whichever window the switcher is showing -- a day, a week, a
// month, a year or the whole station -- and the sparkline is the page's own
// subject: the shape of the day, hour by hour, across that window.
//
// Pure by design: every figure comes from the rows the page already has, so
// sharing costs no extra round trip.

import { plural } from "~/lib/number-format.ts";
import { axisHour, sparkline } from "~/lib/share-card.ts";
import { hourLabel } from "~/lib/time-ago.ts";
import type { TimelinePeriod } from "~/lib/timeline-periods.ts";

const HOURS = 24;

/** Hours that count as after dark for the nightlife line, 9pm through 4am. */
export const NIGHT_HOURS = new Set([21, 22, 23, 0, 1, 2, 3, 4]);

const PERIOD_EMOJI: Record<TimelinePeriod, string> = {
	day: "🕐",
	week: "📅",
	month: "🗓️",
	year: "📆",
	all: "♾️",
};

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
	/** The station had never recorded this species before the window opened. */
	isNew: boolean;
};

export type TimelineShareCard = {
	period: TimelinePeriod;
	/** The window's own label, e.g. "July 2026". Null on all time. */
	windowLabel: string | null;
	rows: TimelineShareRow[];
};

const MEDALS = ["🥇", "🥈", "🥉"] as const;

/**
 * The axis under the sparkline, stretched so its right-hand label lands beneath
 * the final cell. A timeline window always reads as a whole clock day, however
 * many calendar days are stacked into it.
 */
function axisLine(width: number): string {
	const start = axisHour(0);
	const end = axisHour(HOURS - 1);
	const dashes = Math.max(1, width - start.length - end.length - 2);
	return `${start} ${"─".repeat(dashes)} ${end}`;
}

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
	const header = "🐦 BirdNET-Book · Timeline";
	const scope = `${PERIOD_EMOJI[period]} ${card.windowLabel ?? "All time"}`;

	if (rows.length === 0) {
		return `${header}\n${scope}\n🤫 Nothing heard ${PERIOD_NOUN[period]}.`;
	}

	const detections = rows.reduce((sum, row) => sum + row.totalDetections, 0);
	const totals = [
		scope,
		`${rows.length.toLocaleString()} species`,
		plural(detections, "detection"),
	].join(" · ");

	const byHour = hourTotals(rows);
	const chart = sparkline(byHour);

	const peakHour = byHour.reduce(
		(best, count, hour) => (count > byHour[best] ? hour : best),
		0,
	);

	// Ranked by the loader already, but sorting here keeps the card correct for
	// any caller and costs nothing at these sizes.
	const leaderboard = [...rows]
		.sort((a, b) => b.totalDetections - a.totalDetections)
		.slice(0, MEDALS.length)
		.map(
			(row, index) =>
				`${MEDALS[index]} ${row.comName} ×${row.totalDetections.toLocaleString()}`,
		);

	// Highlights earn their place: a line is printed only when it has something
	// to say, so a quiet month produces a visibly shorter card than a good one.
	const highlights: string[] = [];

	if (byHour[peakHour] > 0) {
		highlights.push(
			`🌅 Peak hour: ${hourLabel(peakHour)} · ${plural(
				byHour[peakHour],
				"detection",
			)}`,
		);
	}

	// "All time" has no before to be new against, so the loader never marks a row
	// there -- the line simply doesn't appear.
	const [newcomer, ...otherNewcomers] = rows
		.filter((row) => row.isNew)
		.map((row) => row.comName);
	if (newcomer) {
		const more =
			otherNewcomers.length > 0 ? ` +${otherNewcomers.length} more` : "";
		highlights.push(`🐣 New: ${newcomer}${more}`);
	}

	const afterDark = byHour.reduce(
		(sum, count, hour) => (NIGHT_HOURS.has(hour) ? sum + count : sum),
		0,
	);
	const nightShare = Math.round((afterDark / detections) * 100);
	// Rounding to zero means the night was silent enough that saying so is noise.
	if (nightShare > 0) {
		highlights.push(`🌙 ${nightShare}% heard after dark`);
	}

	return [
		header,
		totals,
		"",
		chart,
		axisLine(chart.length),
		"",
		...leaderboard,
		...(highlights.length > 0 ? ["", ...highlights] : []),
	].join("\n");
}
