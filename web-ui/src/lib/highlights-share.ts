// The Highlights card's notes as pasteable text, plus the couple of extra
// figures both share cards draw from a window's hour profile. Shared by the
// day card (share-card.ts) and the period card (timeline-share.ts) so the two
// say the same thing the same way -- and the same thing the Highlights card on
// the page says, since the lines arrive already judged by highlights-data.ts.

import {
	type Highlight,
	type SpeciesHighlightKind,
	thanPhrase,
} from "~/lib/highlights-data.ts";

/** Hours that count as after dark for the nightlife line, 9pm through 4am. */
export const NIGHT_HOURS = new Set([21, 22, 23, 0, 1, 2, 3, 4]);

/** Birds a pasted line names before counting the rest -- fewer than the page
    names, since a share is read in a chat bubble, not a card. */
const MAX_SHARED_NAMES = 3;

const SPECIES_LEADS: Record<SpeciesHighlightKind, string> = {
	new: "🐣 First ever",
	returned: "🔁 Back",
	rare: "💎 Rare",
	// Completed with what "every day" covers: "📅 Heard every day, the past 3
	// weeks and this week".
	consistent: "📅 Heard",
	// Completed with what "usual" is: "📣 Heard far more than in 2025".
	vocal: "📣 Heard far more",
	routine: "🤐 Gone quiet",
};

function activityLine(
	highlight: Extract<Highlight, { kind: "activity" }>,
): string {
	const { direction, percent, baselineLabel, detectionsDelta } = highlight;
	const lead =
		direction === "level"
			? `➡️ The same as ${baselineLabel}`
			: `${direction === "up" ? "📈 Up" : "📉 Down"} ${percent}% from ${baselineLabel}`;

	const delta = highlight.speciesDelta;
	const species =
		delta === 0
			? ", the same number of species"
			: `, ${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} species`;
	const detections =
		detectionsDelta === 0
			? "the same number of detections"
			: `${Math.abs(detectionsDelta).toLocaleString()} ${detectionsDelta > 0 ? "more" : "fewer"} ${Math.abs(detectionsDelta) === 1 ? "detection" : "detections"}`;
	return `${lead} · ${detections}${species}`;
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
				const lead =
					highlight.kind === "vocal"
						? `${SPECIES_LEADS.vocal} ${thanPhrase(highlight.comparedWith)}`
						: highlight.kind === "consistent"
							? `${SPECIES_LEADS.consistent} ${highlight.scope ?? "every day"}`
							: SPECIES_LEADS[highlight.kind];
				return [`${lead}: ${named.join(", ")}${more}`];
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
