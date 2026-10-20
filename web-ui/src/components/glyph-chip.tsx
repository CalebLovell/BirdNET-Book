import type { CSSProperties, ReactNode } from "react";

import { Hint } from "~/components/ui/hint.tsx";

/** The chip's footprint at its default size, for a loading shell that stands
    in for one. */
export const GLYPH_CHIP_SIZE = "size-[26px]";

// The Highlights card's lines have room for the full chip; a species row's
// flags take the small one, since the rows are only 32px tall.
const SIZES = {
	default: { chip: GLYPH_CHIP_SIZE, glyph: "size-3.5" },
	sm: { chip: "size-5", glyph: "size-3" },
};

/**
 * A glyph in a tinted round chip -- the one mark a bird's flags (New, Rare,
 * Regular...) and the Highlights card's lines share, so a flag on a species row
 * and the line that names it on the card read as the same thing. Without a
 * `style` tint it sits in the neutral icon well.
 *
 * `interactive` makes it a button, for a chip whose tooltip is the only way to
 * read it; a plain chip stays a span, so it can sit inside a link (a species
 * row) without nesting one control in another.
 */
export function GlyphChip({
	icon: Icon,
	label,
	style,
	tooltip,
	tooltipClassName,
	interactive = false,
	size = "default",
	className = "",
}: {
	icon: React.ComponentType<{ className?: string }>;
	/** Read by screen readers in the glyph's place. Omit for pure decoration. */
	label?: string;
	style?: CSSProperties;
	tooltip?: ReactNode;
	tooltipClassName?: string;
	interactive?: boolean;
	size?: keyof typeof SIZES;
	className?: string;
}) {
	const chipClass = `inline-grid ${SIZES[size].chip} shrink-0 place-items-center rounded-full bg-[var(--icon-well)] text-muted-foreground ${className}`;
	const glyph = <Icon className={SIZES[size].glyph} aria-hidden="true" />;

	return (
		<Hint content={tooltip} className={tooltipClassName}>
			{interactive ? (
				<button
					type="button"
					aria-label={label}
					className={`${chipClass} cursor-help`}
					style={style}
				>
					{glyph}
				</button>
			) : (
				<span
					className={chipClass}
					style={style}
					aria-hidden={label ? undefined : true}
				>
					{glyph}
					{label ? <span className="sr-only">{label}</span> : null}
				</span>
			)}
		</Hint>
	);
}
