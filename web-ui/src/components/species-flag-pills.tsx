import { Gem, Sparkles, Undo2 } from "lucide-react";
import type { CSSProperties } from "react";

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip.tsx";

/** The unit of the period a returning bird skipped, or null. */
export type ReturnedUnit = "day" | "week" | "month" | "year" | null;

export function returnedTooltip(returnedUnit: ReturnedUnit): string {
	if (returnedUnit == null)
		return "Back after an absence, having missed the previous period.";
	return `Back after an absence — last heard a ${returnedUnit} before.`;
}

// Each status pill wears its own tint over the raised paper, so a glance down a
// list sorts them by hue -- and none reuses the confidence pill's moss/sand/sage
// scale, which reads as data rather than as a flag. Blue for a first arrival,
// rose for a bird back from a long absence, heather for a rare visitor.
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

/**
 * The flags a species can carry in a window -- New, Returned, Rare -- as pills,
 * the same wherever a species row shows them (the species grid, the heat map).
 * The loader gives a species at most one of the three, so this renders one
 * pill or none. Needs a TooltipProvider above it.
 */
export function SpeciesFlagPills({
	isNew,
	isReturned,
	isRare,
	returnedUnit,
	newLabel,
}: {
	isNew: boolean;
	isReturned: boolean;
	isRare: boolean;
	returnedUnit: ReturnedUnit;
	/** Names the window in the New tooltip. Null hides the New pill entirely,
	    which is what "all time" wants: everything is trivially first heard. */
	newLabel: string | null;
}) {
	return (
		<>
			{isNew && newLabel ? (
				<Pill
					icon={Sparkles}
					label="New"
					style={NEW_PILL_STYLE}
					tooltip={`First recorded here in ${newLabel}`}
				/>
			) : null}
			{isReturned ? (
				<Pill
					icon={Undo2}
					label="Returned"
					style={RETURNED_PILL_STYLE}
					tooltip={returnedTooltip(returnedUnit)}
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

/**
 * One pill. Every pill -- confidence, New, Returned, Rare -- shares this size,
 * radius and weight so a cluster reads as one family; only the tint and the
 * optional icon set them apart. The flag pills carry a tooltip explaining what
 * they mean; the confidence pill is a bare number, so it takes no tooltip and
 * renders without one.
 */
export function Pill({
	icon: Icon,
	label,
	style,
	tooltip,
	tabular = false,
}: {
	icon?: React.ComponentType<{ className?: string }>;
	label: string;
	style: CSSProperties;
	tooltip?: string;
	tabular?: boolean;
}) {
	const pill = (
		<span
			className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-[11px] leading-none ${tabular ? "tabular-data" : ""}`}
			style={style}
		>
			{Icon ? <Icon className="size-2.5" /> : null}
			{label}
		</span>
	);

	if (!tooltip) return pill;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{pill}</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	);
}
