// The Highlights card's notes as pasteable text. Shared by the
// day card (share-card.ts) and the period card (timeline-share.ts) so the two
// say the same thing the same way -- and the same thing the Highlights card on
// the page says, since the lines arrive already judged by highlights-data.ts.

import type { Highlight, SpeciesHighlightKind } from "~/lib/highlights-data.ts";

/** Birds a pasted line names before counting the rest -- fewer than the page
    names, since a share is read in a chat bubble, not a card. */
const MAX_SHARED_NAMES = 3;

// The badges' own names, as the card leads with them. Regulars take a house
// rather than the page's calendar, which the share's date line already uses.
const SPECIES_LEADS: Record<
	SpeciesHighlightKind,
	{ emoji: string; name: string }
> = {
	new: { emoji: "🐣", name: "New" },
	rare: { emoji: "💎", name: "Rare" },
	consistent: { emoji: "🏠", name: "Regulars" },
	routine: { emoji: "🤐", name: "Gone quiet" },
	returned: { emoji: "🔁", name: "Returned" },
	vocal: { emoji: "📣", name: "Vocal" },
};

/**
 * The pace against the stretch before, as a line, if the highlights have one.
 * The cards print it with their totals rather than among the highlights, since
 * it reads as a comment on those numbers.
 */
export function formatActivityLines(highlights: Highlight[]): string[] {
	return highlights.flatMap((highlight) => {
		if (highlight.kind !== "activity") return [];
		const { direction, percent, baselineLabel } = highlight;
		if (direction === "level") return [`➡️  The same as ${baselineLabel}`];
		return [
			`${direction === "up" ? "📈  Up" : "📉  Down"} ${percent}% from ${baselineLabel}`,
		];
	});
}

/**
 * The highlights, stacked so nothing runs wide on a phone: each badge and its
 * count on their own line ("🔁  Returned · 4"), its birds one per line beneath
 * it with what earned each its place ("Hermit Thrush (23 days missing)"), then
 * "+N more" for the rest. A blank line sits between
 * badges. The busiest hour and the pace against the stretch before are left
 * out: the cards print both with their totals instead.
 */
export function formatHighlightLines(highlights: Highlight[]): string[] {
	const blocks = highlights.flatMap((highlight) => {
		if (!("birds" in highlight)) return [];
		const { emoji, name } = SPECIES_LEADS[highlight.kind];
		const named = highlight.birds.slice(0, MAX_SHARED_NAMES).map((bird) => {
			const note = bird.shareNote ?? bird.note;
			return note ? `${bird.comName} (${note})` : bird.comName;
		});
		const rest = highlight.total - named.length;
		return [
			[
				`${emoji}  ${name} · ${highlight.total.toLocaleString()}`,
				...named,
				...(rest > 0 ? [`+${rest} more`] : []),
			],
		];
	});
	return blocks.flatMap((block, index) => (index > 0 ? ["", ...block] : block));
}
