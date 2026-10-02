import type { CSSProperties } from "react";

import { Hint } from "~/components/ui/hint.tsx";

/**
 * One pill. Every pill -- confidence, New, Returned, Rare, Vocal -- shares this
 * size, radius and weight so a cluster reads as one family; only the tint and
 * the optional icon set them apart. A `tooltip` explains what the pill means
 * on hover. `iconOnly` draws just the glyph in a round chip, the label kept
 * for screen readers -- the tooltip then carries the name.
 */
export function Pill({
	icon: Icon,
	label,
	style,
	tooltip,
	tabular = false,
	iconOnly = false,
	className = "",
}: {
	icon?: React.ComponentType<{ className?: string }>;
	label: string;
	style: CSSProperties;
	tooltip?: string;
	tabular?: boolean;
	iconOnly?: boolean;
	className?: string;
}) {
	return (
		<Hint content={tooltip}>
			<span
				className={`inline-flex shrink-0 items-center rounded-full font-semibold text-xs leading-none ${iconOnly ? "size-5 justify-center" : "gap-1 px-2 py-1"} ${tabular ? "tabular-data" : ""} ${className}`}
				style={style}
			>
				{Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
				{iconOnly ? <span className="sr-only">{label}</span> : label}
			</span>
		</Hint>
	);
}
