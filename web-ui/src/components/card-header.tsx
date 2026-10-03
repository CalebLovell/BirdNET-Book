import type { ReactNode } from "react";

/**
 * The band across the top of a card: a 45px strip carrying the card's kicker,
 * bled to the card's edges with a full-width hairline under it. Recent
 * activity's header, made the one way every card is titled.
 *
 * For a `feature-card` with the standard `p-4` padding: the negative margins
 * cancel that padding (which follows `--page-gap` down on phones), so the
 * hairline always meets the card's border. Whatever follows sets its own gap
 * from the band, as it did from the bare kicker.
 */
export const CARD_HEADER_CLASS =
	"-mx-(--page-gap) -mt-(--page-gap) flex min-h-[45px] items-center justify-between gap-2 border-b px-(--page-gap)";

export function CardHeader({
	title,
	titleId,
	as: Title = "div",
	children,
	className = "",
}: {
	title: ReactNode;
	/** For a card that names itself by its title with `aria-labelledby`. */
	titleId?: string;
	/** `h2` where the title is the card's heading; a plain kicker otherwise. */
	as?: "div" | "h2";
	/** Held against the right edge: a count, a link, a control. */
	children?: ReactNode;
	className?: string;
}) {
	return (
		<div className={`${CARD_HEADER_CLASS} ${className}`}>
			<Title id={titleId} className="island-kicker m-0 shrink-0">
				{title}
			</Title>
			{children}
		</div>
	);
}
