import { AudioLines, Gem, Sparkles, Undo2 } from "lucide-react";
import type { CSSProperties } from "react";
import { Pill } from "~/components/pill.tsx";
import { formatDate } from "~/lib/date-format.ts";
import { formatAway, type VocalJump } from "~/lib/highlights-data.ts";

/** "First recorded here on Sep 22, 2026." -- the day itself, not the window. */
export function newTooltip(firstHeard: string | null): string {
	if (firstHeard == null) return "First recorded here.";
	return `First recorded here on ${formatDate(firstHeard)}.`;
}

export function returnedTooltip(daysAway: number | null): string {
	if (daysAway == null) return "Back after time away.";
	return `Back after ${formatAway(daysAway)} away.`;
}

/** "Heard 76 times here; usually about 5." -- the Highlights line's figures. */
export function vocalTooltip({ count, usual }: VocalJump): string {
	const usually =
		usual < 0.5 ? "under 1" : `about ${Math.round(usual).toLocaleString()}`;
	return `Heard ${count.toLocaleString()} times here; usually ${usually}.`;
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
	vocal,
}: {
	isNew: boolean;
	isReturned: boolean;
	isRare: boolean;
	/** How long a returning bird was away. Null unless isReturned. */
	daysAway: number | null;
	/** The bird's count against its usual, when that makes it Vocal. Null for
	    no Vocal pill. */
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
			{vocal != null ? (
				<Pill
					icon={AudioLines}
					label="Vocal"
					style={VOCAL_PILL_STYLE}
					tooltip={vocalTooltip(vocal)}
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
