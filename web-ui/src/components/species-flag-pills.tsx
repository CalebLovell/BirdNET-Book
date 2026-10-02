import { AudioLines, Gem, House, Sparkles, Undo2 } from "lucide-react";
import type { CSSProperties } from "react";
import { Pill } from "~/components/pill.tsx";
import { formatDate } from "~/lib/date-format.ts";
import {
	formatRate,
	type SpeciesHighlightKind,
	type VocalJump,
	windowPhrase,
} from "~/lib/highlights-data.ts";

/** "First recorded here on Sep 22, 2026." -- the day itself, not the window. */
export function newTooltip(firstHeard: string | null): string {
	if (firstHeard == null) return "First recorded here.";
	return `First recorded here on ${formatDate(firstHeard)}.`;
}

/** "Heard 14 of 18 hours.", "Heard every day so far this week.", "Heard on
    93% of days." */
export function consistentTooltip(note: string | null): string {
	if (note == null) return "Heard here day in, day out.";
	return note.endsWith("of days") ? `Heard on ${note}.` : `Heard ${note}.`;
}

/** "Back after 3 weeks missing." -- in the window's own unit. */
export function returnedTooltip(away: string | null): string {
	if (away == null) return "Back after time missing.";
	return `Back after ${away} missing.`;
}

/**
 * "Heard 76 times today, usually only 4.6." -- the Highlights line's figures,
 * said plainly, in the window's own unit: "Heard 300 times this week, usually
 * only 40."
 */
export function vocalTooltip({
	count,
	usual,
	period,
}: Pick<VocalJump, "count" | "usual" | "period">): string {
	const times = count === 1 ? "time" : "times";
	return `Heard ${formatRate(count)} ${times} ${windowPhrase(period)}, usually only ${formatRate(usual)}.`;
}

// Each status pill wears its own tint over the raised paper, so a glance down a
// list sorts them by hue -- and none reuses the confidence pill's moss/sand/sage
// scale, which reads as data rather than as a flag. Blue for a first arrival,
// rose for a bird back from a long absence, heather for a rare visitor,
// teal for a bird heard day in, day out, ochre for a bird heard far more than
// usual.
const NEW_PILL_STYLE: CSSProperties = {
	backgroundColor: "color-mix(in oklab, #3f6ea6 20%, var(--paper-raised))",
	color: "#2a4d78",
};

const RETURNED_PILL_STYLE: CSSProperties = {
	backgroundColor: "color-mix(in oklab, #a8536e 20%, var(--paper-raised))",
	color: "#733a4e",
};

const RARE_PILL_STYLE: CSSProperties = {
	backgroundColor: "color-mix(in oklab, #6f5c9c 22%, var(--paper-raised))",
	color: "#463a73",
};

const CONSISTENT_PILL_STYLE: CSSProperties = {
	backgroundColor: "color-mix(in oklab, #2f7d6d 20%, var(--paper-raised))",
	color: "#1f5248",
};

const VOCAL_PILL_STYLE: CSSProperties = {
	backgroundColor: "color-mix(in oklab, #b07a1f 22%, var(--paper-raised))",
	color: "#6e4a10",
};

/** The badges' tints by the Highlights line they share a name with, so the
    card's glyphs wear the same colours as the species rows' badges. */
export const BADGE_STYLES = {
	new: NEW_PILL_STYLE,
	rare: RARE_PILL_STYLE,
	consistent: CONSISTENT_PILL_STYLE,
	returned: RETURNED_PILL_STYLE,
	vocal: VOCAL_PILL_STYLE,
} satisfies Partial<Record<SpeciesHighlightKind, CSSProperties>>;

/**
 * The flags a species can carry in a window -- New, Rare, Vocal, Returned,
 * Regular -- as pills, the same wherever a species row shows them (the
 * species grid, the heat map), in the Highlights card's order. Glyphs only,
 * so a stack of them stays small; each one's tooltip leads with its name.
 * They stack: a bird gets every pill it qualifies for.
 */
export function SpeciesFlagPills({
	isNew,
	isRare,
	isConsistent,
	regularNote,
	isReturned,
	firstHeard,
	away,
	vocal,
}: {
	isNew: boolean;
	isRare: boolean;
	isConsistent: boolean;
	/** How much of the window a Regular bird filled, for its tooltip. */
	regularNote: string | null;
	isReturned: boolean;
	/** How long a returning bird was away. Null unless isReturned. */
	away: string | null;
	/** The bird's daily rate against its usual, when that makes it Vocal.
	    Null for no Vocal pill. */
	vocal: VocalJump | null;
	/** The day a New bird was first recorded, "YYYY-MM-DD". Null unless isNew. */
	firstHeard: string | null;
}) {
	return (
		<>
			{isNew ? (
				<Pill
					icon={Sparkles}
					label="New"
					style={NEW_PILL_STYLE}
					tooltip={`New — ${newTooltip(firstHeard)}`}
					iconOnly
				/>
			) : null}
			{isRare ? (
				<Pill
					icon={Gem}
					label="Rare"
					style={RARE_PILL_STYLE}
					tooltip="Rare — Barely ever heard here."
					iconOnly
				/>
			) : null}
			{vocal != null ? (
				<Pill
					icon={AudioLines}
					label="Vocal"
					style={VOCAL_PILL_STYLE}
					tooltip={`Vocal — ${vocalTooltip(vocal)}`}
					iconOnly
				/>
			) : null}
			{isReturned ? (
				<Pill
					icon={Undo2}
					label="Returned"
					style={RETURNED_PILL_STYLE}
					tooltip={`Returned — ${returnedTooltip(away)}`}
					iconOnly
				/>
			) : null}
			{isConsistent ? (
				<Pill
					icon={House}
					label="Regular"
					style={CONSISTENT_PILL_STYLE}
					tooltip={`Regular — ${consistentTooltip(regularNote)}`}
					iconOnly
				/>
			) : null}
		</>
	);
}
