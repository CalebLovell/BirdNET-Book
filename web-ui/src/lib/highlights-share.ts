// The Highlights card's notes as pasteable text, plus the couple of extra
// figures both share cards draw from a window's hour profile. Shared by the
// day card (share-card.ts) and the period card (timeline-share.ts) so the two
// say the same thing the same way -- and the same thing the Highlights card on
// the page says, since the lines arrive already judged by highlights-data.ts.

import type { Highlight, SpeciesHighlightKind } from "~/lib/highlights-data.ts";
import { plural } from "~/lib/number-format.ts";

/** Hours that count as after dark for the nightlife line, 9pm through 4am. */
export const NIGHT_HOURS = new Set([21, 22, 23, 0, 1, 2, 3, 4]);

/** Birds a pasted line names before counting the rest -- fewer than the page
    names, since a share is read in a chat bubble, not a card. */
const MAX_SHARED_NAMES = 3;

const SPECIES_LEADS: Record<SpeciesHighlightKind, string> = {
	new: "🐣 First ever",
	returned: "🔁 Back",
	rare: "💎 Rare",
	vocal: "📣 More vocal than usual",
	routine: "🤐 Gone quiet",
};

function activityLine(
	highlight: Extract<Highlight, { kind: "activity" }>,
): string {
	const { direction, percent, baselineLabel, detections, perDay } = highlight;
	const lead = `${direction === "up" ? "📈 Up" : "📉 Down"} ${percent}% on ${baselineLabel}`;

	if (perDay)
		return `${lead} · ${plural(detections, "detection")} a day so far`;

	const delta = highlight.speciesDelta;
	const species =
		delta == null
			? ""
			: delta === 0
				? ", the usual number of species"
				: `, ${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} species`;
	return `${lead} · ${plural(detections, "detection")}${species}`;
}

/**
 * One line per highlight, in the card's own order. The busiest hour is left
 * out: both share cards already print a peak-hour line that also carries the
 * count.
 */
export function formatHighlightLines(highlights: Highlight[]): string[] {
	return highlights.flatMap((highlight) => {
		switch (highlight.kind) {
			case "busiest-hour":
				return [];
			case "activity":
				return [activityLine(highlight)];
			default: {
				const named = highlight.birds
					.slice(0, MAX_SHARED_NAMES)
					.map((bird) =>
						bird.note ? `${bird.comName} (${bird.note})` : bird.comName,
					);
				const rest = highlight.total - named.length;
				const more = rest > 0 ? ` +${rest} more` : "";
				return [`${SPECIES_LEADS[highlight.kind]}: ${named.join(", ")}${more}`];
			}
		}
	});
}

/** Percent of a midnight-first hour profile heard after dark, rounded. */
export function nightShare(hourCounts: number[]): number {
	const total = hourCounts.reduce((sum, count) => sum + count, 0);
	if (total === 0) return 0;
	const afterDark = hourCounts.reduce(
		(sum, count, hour) => (NIGHT_HOURS.has(hour) ? sum + count : sum),
		0,
	);
	return Math.round((afterDark / total) * 100);
}
