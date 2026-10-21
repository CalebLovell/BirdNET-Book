// A day as one block of pasteable text. Every line is short and stands on its
// own, so the card still reads on a phone that wraps anything wide.
//
// Pure by design -- the caller supplies the numbers, the clock and the window.
// Every formatting rule lives here so it can be read and tested in one place.

import type { Highlight } from "~/lib/highlights-data.ts";
import {
	formatActivityLines,
	formatHighlightLines,
} from "~/lib/highlights-share.ts";
import { hourLabel } from "~/lib/time-ago.ts";

/**
 * Which stretch of time the card covers: the Today page's trailing 24 hours,
 * or one calendar day.
 */
export type ShareWindow = "rolling" | "day";

export type ShareCard = {
	/** Local calendar date of the snapshot, "YYYY-MM-DD". */
	date: string;
	/** Defaults to the rolling window the Today page shares. */
	window?: ShareWindow;
	species: number;
	detections: number;
	topSpecies: { comName: string; count: number }[];
	busiestHour: { hour: number; count: number } | null;
	/**
	 * The page's own Highlights for the same window (lib/highlights-data.ts),
	 * when it has them: the source of the card's New, Returned and Rare lines.
	 */
	highlights?: Highlight[];
	/**
	 * The page header's title in pieces, its period and date, e.g. ["Daily",
	 * "Monday, October 19, 2026"]. Defaults to the past day and its short date.
	 */
	heading?: string[];
};

/** "Jul 25", read off the date parts so no timezone can shift the day. */
function dateLabel(date: string): string {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

/**
 * The card's opening lines: the app's name, what kind of summary it is
 * ("Daily Summary"), then the window's date. All time has no date, so its
 * card skips that last line.
 */
export function shareHeader([period, date]: string[]): string {
	return [
		"📖  BirdNET-Book",
		`📊  ${period} Summary`,
		...(date ? [`📅  ${date}`] : []),
	].join("\n");
}

/**
 * The headline figures, one per line, then the hour that heard the most and
 * how the window compares to the one before.
 */
export function shareTotals({
	species,
	detections,
	peakHour,
	highlights,
}: {
	species: number;
	detections: number;
	/** Null when no hour heard anything. */
	peakHour: number | null;
	highlights: Highlight[];
}): string[] {
	return [
		`🐦  Species · ${species.toLocaleString()}`,
		`🎙️  Detections · ${detections.toLocaleString()}`,
		...(peakHour === null ? [] : [`🌅  Peak hour · ${hourLabel(peakHour)}`]),
		...formatActivityLines(highlights),
	];
}

const MEDALS = ["🥇", "🥈", "🥉"] as const;

export function formatShareCard(card: ShareCard): string {
	const window = card.window ?? "rolling";
	const header = shareHeader(
		card.heading ?? ["Last 24 hours", dateLabel(card.date)],
	);

	if (card.detections === 0) {
		const quiet =
			window === "day"
				? "Nothing heard all day."
				: "Nothing heard in the last 24 hours.";
		return `${header}\n🤫  ${quiet}`;
	}

	const totals = shareTotals({
		species: card.species,
		detections: card.detections,
		peakHour: card.busiestHour?.hour ?? null,
		highlights: card.highlights ?? [],
	});

	const leaderboard = card.topSpecies
		.slice(0, MEDALS.length)
		.map(
			(species, index) =>
				`${MEDALS[index]}  ${species.comName} · ${species.count.toLocaleString()}`,
		);

	// Highlights earn their place: a line is printed only when it has something
	// to say, so a quiet day produces a visibly shorter card than a good one.
	const highlights = formatHighlightLines(card.highlights ?? []);

	return [
		header,
		"",
		...totals,
		...(leaderboard.length > 0 ? ["", ...leaderboard] : []),
		...(highlights.length > 0 ? ["", ...highlights] : []),
	].join("\n");
}
