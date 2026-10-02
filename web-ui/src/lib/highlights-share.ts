// The Highlights card's notes as pasteable text. Shared by the
// day card (share-card.ts) and the period card (timeline-share.ts) so the two
// say the same thing the same way -- and the same thing the Highlights card on
// the page says, since the lines arrive already judged by highlights-data.ts.

import type { Highlight, SpeciesHighlightKind } from "~/lib/highlights-data.ts";

/** Birds a pasted line names before counting the rest -- fewer than the page
    names, since a share is read in a chat bubble, not a card. */
const MAX_SHARED_NAMES = 3;

// The badges' own names, as the card leads with them.
const SPECIES_LEADS: Record<SpeciesHighlightKind, string> = {
	new: "🐣 New",
	rare: "💎 Rare",
	consistent: "📅 Regulars",
	routine: "🤐 Gone quiet",
	returned: "🔁 Returned",
	vocal: "📣 Vocal",
};

function activityLine(
	highlight: Extract<Highlight, { kind: "activity" }>,
): string {
	const { direction, percent, baselineLabel, count, delta } = highlight;
	const noun = (n: number) => (n === 1 ? "detection" : "detections");
	if (direction === "level")
		return `➡️ The same as ${baselineLabel} · ${count.toLocaleString()} ${noun(count)}`;
	const lead = `${direction === "up" ? "📈 Up" : "📉 Down"} ${percent}% from ${baselineLabel}`;
	return `${lead} · ${Math.abs(delta).toLocaleString()} ${delta > 0 ? "more" : "fewer"} ${noun(Math.abs(delta))}`;
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
