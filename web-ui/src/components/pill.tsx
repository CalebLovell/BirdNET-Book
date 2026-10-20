import type { CSSProperties, ReactNode } from "react";

import { GlyphChip } from "~/components/glyph-chip.tsx";
import { Hint } from "~/components/ui/hint.tsx";

/**
 * One pill. Every pill -- confidence, New, Returned, Rare, Vocal -- shares this
 * size, radius and weight so a cluster reads as one family; only the tint and
 * the optional icon set them apart. A `tooltip` explains what the pill means
 * on hover. `iconOnly` draws just the glyph as a GlyphChip, the label kept
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
	tooltip?: ReactNode;
	tabular?: boolean;
	iconOnly?: boolean;
	className?: string;
}) {
	if (iconOnly && Icon) {
		return (
			<GlyphChip
				icon={Icon}
				label={label}
				style={style}
				tooltip={tooltip}
				size="sm"
				className={className}
			/>
		);
	}

	return (
		<Hint content={tooltip}>
			<span
				className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-semibold text-xs leading-none ${tabular ? "tabular-data" : ""} ${className}`}
				style={style}
			>
				{Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
				{label}
			</span>
		</Hint>
	);
}
