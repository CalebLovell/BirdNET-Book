import { AudioLines, Gem, Sparkles, Undo2 } from "lucide-react";
import type { CSSProperties } from "react";
import { Pill } from "~/components/pill.tsx";
import { formatRatio } from "~/lib/highlights-data.ts";

const FIRST_HEARD = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

/** "First recorded here on Sep 22, 2026." -- the day itself, not the window. */
export function newTooltip(firstHeard: string | null): string {
	if (firstHeard == null) return "First recorded here.";
	return `First recorded here on ${FIRST_HEARD.format(new Date(`${firstHeard}T00:00:00Z`))}.`;
}

export function returnedTooltip(daysAway: number | null): string {
	if (daysAway == null) return "Back after time away.";
	return `Back after ${daysAway} days away.`;
}

/** "Heard more often than usual (3.2×)." -- the Highlights line's words. */
export function vocalTooltip(ratio: number): string {
	return `Heard more often than usual (${formatRatio(ratio)}).`;
}

// Each status pill wears its own tint over the raised paper, so a glance down a
// list sorts them by hue -- and none reuses the confidence pill's moss/sand/sage
// scale, which reads as data rather than as a flag. Blue for a first arrival,
// rose for a bird back from a long absence, heather for a rare visitor,
// ochre for a bird heard far more than usual.
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

const VOCAL_PILL_STYLE: CSSProperties = {
	backgroundColor: "color-mix(in oklab, #b07a1f 22%, var(--paper-raised))",
	color: "#6e4a10",
};

/**
 * The flags a species can carry in a window -- New, Returned, Rare, Vocal -- as
 * pills,
 * the same wherever a species row shows them (the species grid, the heat map).
 * The loader gives a species at most one of the four, so this renders one
 * pill or none.
 */
export function SpeciesFlagPills({
	isNew,
	isReturned,
	isRare,
	firstHeard,
	daysAway,
	vocalRatio,
}: {
	isNew: boolean;
	isReturned: boolean;
	isRare: boolean;
	/** How long a returning bird was away. Null unless isReturned. */
	daysAway: number | null;
	/** How many times its usual rate the bird was heard at, when that makes it
	    Vocal. Null for no Vocal pill. */
	vocalRatio: number | null;
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
					tooltip={newTooltip(firstHeard)}
				/>
			) : null}
			{isReturned ? (
				<Pill
					icon={Undo2}
					label="Returned"
					style={RETURNED_PILL_STYLE}
					tooltip={returnedTooltip(daysAway)}
				/>
			) : null}
			{vocalRatio != null ? (
				<Pill
					icon={AudioLines}
					label="Vocal"
					style={VOCAL_PILL_STYLE}
					tooltip={vocalTooltip(vocalRatio)}
				/>
			) : null}
			{isRare ? (
				<Pill
					icon={Gem}
					label="Rare"
					style={RARE_PILL_STYLE}
					tooltip="Barely ever heard here — a rare visitor."
				/>
			) : null}
		</>
	);
}
