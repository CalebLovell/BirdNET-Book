// The Today page as one block of pasteable text: a Wordle-style card where the
// shape of the sparkline carries the day and the emoji lines fill in the story.
//
// Pure by design -- the caller supplies the numbers, the clock and the window.
// Every formatting rule lives here so it can be read and tested in one place.

import type { Highlight } from "~/lib/highlights-data.ts";
import { formatHighlightLines, nightShare } from "~/lib/highlights-share.ts";
import { ordinal, plural } from "~/lib/number-format.ts";
import { hourLabel } from "~/lib/time-ago.ts";

/** Species heard this often all-time are too familiar to call rare. */
const RARITY_THRESHOLD = 10;

const LEVELS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * Which stretch of time the card covers. "rolling" is the Today page's
 * trailing 24 hours, whose axis runs into "now"; "day" is one calendar day,
 * which is finished and so ends at an hour rather than at the present.
 */
export type ShareWindow = "rolling" | "day";

export type ShareCard = {
	/** Local calendar date of the snapshot, "YYYY-MM-DD". */
	date: string;
	/** Defaults to the rolling window the Today page shares. */
	window?: ShareWindow;
	/** Hour of day the oldest bucket covers, 0-23. */
	startHour: number;
	/** 24 hourly counts, oldest first, ending with the current hour. */
	hourlyCounts: number[];
	species: number;
	detections: number;
	visits: number;
	topSpecies: { comName: string; count: number }[];
	busiestHour: { hour: number; count: number } | null;
	/** Species whose all-time first detection landed inside the window. */
	firstEver: string[];
	/** The species heard in the window with the fewest all-time detections. */
	rarest: { comName: string; allTimeCount: number } | null;
	/**
	 * The page's own Highlights for the same window (lib/highlights-data.ts),
	 * when it has them. They name a first-ever bird themselves, so the card's
	 * own first-ever line steps aside for theirs.
	 */
	highlights?: Highlight[];
};

/**
 * Hourly counts as block characters. A silent hour sits on the baseline and
 * every other hour is scaled across the seven remaining heights, so an hour
 * with a single detection can never be mistaken for one with none.
 */
export function sparkline(counts: number[]): string {
	const peak = Math.max(0, ...counts);

	return counts
		.map((count) => {
			if (count <= 0 || peak <= 0) return LEVELS[0];
			return LEVELS[Math.max(1, Math.ceil((count / peak) * 7))];
		})
		.join("");
}

/** "Jul 25", read off the date parts so no timezone can shift the day. */
function dateLabel(date: string): string {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

/** The axis's compact hour: "12am", "9pm". */
export function axisHour(hour: number): string {
	return hourLabel(hour).replace(" ", "").toLowerCase();
}

/**
 * The axis under the sparkline, stretched so its right-hand label lands beneath
 * the final cell. A rolling window names its own starting hour and runs into
 * "now"; a calendar day runs from midnight to the last hour it holds.
 */
function axisLine(
	startHour: number,
	width: number,
	window: ShareWindow,
): string {
	const start = axisHour(startHour);
	const end = window === "day" ? axisHour((startHour + 23) % 24) : "now";
	const dashes = Math.max(1, width - start.length - end.length - 2);
	return `${start} ${"─".repeat(dashes)} ${end}`;
}

const MEDALS = ["🥇", "🥈", "🥉"] as const;

export function formatShareCard(card: ShareCard): string {
	const window = card.window ?? "rolling";
	const header = `🐦 BirdNET-Book · ${dateLabel(card.date)}`;

	if (card.detections === 0) {
		const quiet =
			window === "day"
				? "Nothing heard all day."
				: "Nothing heard in the last 24 hours.";
		return `${header}\n🤫 ${quiet}`;
	}

	const totals = [
		`${card.species.toLocaleString()} species`,
		plural(card.detections, "detection"),
		plural(card.visits, "visit"),
	].join(" · ");

	const chart = sparkline(card.hourlyCounts);
	const leaderboard = card.topSpecies
		.slice(0, MEDALS.length)
		.map(
			(species, index) =>
				`${MEDALS[index]} ${species.comName} ×${species.count.toLocaleString()}`,
		);

	// Highlights earn their place: a line is printed only when it has something
	// to say, so a quiet day produces a visibly shorter card than a good one.
	const highlights: string[] = [];

	if (card.busiestHour) {
		highlights.push(
			`🌅 Peak hour: ${hourLabel(card.busiestHour.hour)} · ${plural(
				card.busiestHour.count,
				"detection",
			)}`,
		);
	}

	// Only a calendar day's counts run midnight first, which is what lets the
	// night hours be read off by position.
	const night = window === "day" ? nightShare(card.hourlyCounts) : 0;
	if (night > 0) highlights.push(`🌙 ${night}% heard after dark`);

	const pageHighlights = card.highlights ?? [];
	const namedByHighlights = new Set(
		pageHighlights.flatMap((highlight) =>
			"birds" in highlight ? highlight.birds.map((bird) => bird.comName) : [],
		),
	);
	const highlightsNameNewcomers = pageHighlights.some(
		(highlight) => highlight.kind === "new",
	);

	const [newcomer, ...otherNewcomers] = card.firstEver;
	if (newcomer && !highlightsNameNewcomers) {
		const more =
			otherNewcomers.length > 0 ? ` +${otherNewcomers.length} more` : "";
		highlights.push(`🐣 First ever: ${newcomer}${more}`);
	}

	// A first-ever bird is by definition the rarest one, and saying so twice
	// wastes the line -- as does naming a bird the highlights already call out.
	const rarest = card.rarest;
	if (
		rarest &&
		rarest.allTimeCount <= RARITY_THRESHOLD &&
		!card.firstEver.includes(rarest.comName) &&
		!namedByHighlights.has(rarest.comName)
	) {
		highlights.push(
			`💎 Rarest: ${rarest.comName} (${ordinal(rarest.allTimeCount)} ever)`,
		);
	}

	highlights.push(...formatHighlightLines(pageHighlights));

	return [
		header,
		totals,
		"",
		chart,
		axisLine(card.startHour, chart.length, window),
		...(leaderboard.length > 0 ? ["", ...leaderboard] : []),
		...(highlights.length > 0 ? ["", ...highlights] : []),
	].join("\n");
}
