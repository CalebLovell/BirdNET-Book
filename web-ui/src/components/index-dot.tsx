import type { CSSProperties } from "react";

/**
 * A row's number in a list that counts on across pages -- the detections table
 * and the species visit log. A dot that stretches to a capsule for longer
 * numbers, every one on the page as wide as `widest` (the largest number the
 * page shows), so the column of dots and whatever sits beside them line up.
 *
 * On the smallest phones (under 400px, where the page gap halves too) the
 * capsule stops at four characters and a longer number ends in an ellipsis,
 * so a six-digit index doesn't crowd the species name out of the row.
 */
export function IndexDot({ index, widest }: { index: number; widest: number }) {
	const digits = widest.toLocaleString().length;
	return (
		<span
			aria-hidden
			style={{ "--digits": digits } as CSSProperties}
			className="tabular-data inline-flex h-6 w-[max(1.5rem,calc(var(--digits)*1ch+0.75rem))] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 font-bold text-foreground text-xs max-[400px]:w-[max(1.5rem,calc(min(var(--digits),4)*1ch+0.75rem))]"
		>
			<span className="min-w-0 truncate">{index.toLocaleString()}</span>
		</span>
	);
}
