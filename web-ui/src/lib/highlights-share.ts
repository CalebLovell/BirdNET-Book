// The Highlights card's notes as pasteable text. Shared by the
// day card (share-card.ts) and the period card (timeline-share.ts) so the two
// say the same thing the same way -- and the same thing the Highlights card on
// the page says, since the lines arrive already judged by highlights-data.ts.

import type { Highlight, SpeciesHighlightKind } from "~/lib/highlights-data.ts";

/** Birds a pasted line names before counting the rest -- fewer than the page
    names, since a share is read in a chat bubble, not a card. */
const MAX_SHARED_NAMES = 3;

// The badges' own names, as the card leads with them. The line's count goes
// between the emoji and the name: "🔁 12 Returned". Only "Regulars" is a noun
// that changes with the count; the rest read the same for one bird or many.
const SPECIES_LEADS: Record<
	SpeciesHighlightKind,
	{ emoji: string; name: string; one?: string }
> = {
	new: { emoji: "🐣", name: "New" },
	rare: { emoji: "💎", name: "Rare" },
	consistent: { emoji: "📅", name: "Regulars", one: "Regular" },
	routine: { emoji: "🤐", name: "Gone quiet" },
	returned: { emoji: "🔁", name: "Returned" },
	vocal: { emoji: "📣", name: "Vocal" },
};

/**
 * The note as a pasted line reads it. The card's header already names the
 * window, so a vocal bird's "99 this week, usually 10" (see formatVocal) loses
 * its "this week": "99, usually 10".
 */
function sharedNote(kind: SpeciesHighlightKind, note: string): string {
	return kind === "vocal"
		? note.replace(/ (?:today|all time|this \w+), usually /, ", usually ")
		: note;
}

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
				// A regular's note only repeats what the label already says ("every
				// day this week"), so the line names the birds and stops there.
				const showNotes = highlight.kind !== "consistent";
				const named = highlight.birds
					.slice(0, MAX_SHARED_NAMES)
					.map((bird) =>
						showNotes && bird.note
							? `${bird.comName} (${sharedNote(highlight.kind, bird.note)})`
							: bird.comName,
					);
				const rest = highlight.total - named.length;
				const more = rest > 0 ? ` +${rest} more` : "";
				const { emoji, name, one } = SPECIES_LEADS[highlight.kind];
				const label = highlight.total === 1 ? (one ?? name) : name;
				return [
					`${emoji} ${highlight.total.toLocaleString()} ${label}: ${named.join(", ")}${more}`,
				];
			}
		}
	});
}
