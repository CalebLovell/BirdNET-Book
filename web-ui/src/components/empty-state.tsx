import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A card inside an otherwise populated page that happens to have nothing in
 * it -- a filter that matched no rows, a species with no visits logged yet.
 *
 * Deliberately quiet. The page around it is doing the talking, and the reason
 * the card is empty is usually visible in the control that emptied it.
 */
export function EmptyNote({ children }: { children: ReactNode }) {
	// The page gap, like every other card-internal gap: 16px, tightening to
	// 8px on phones along with the card's own padding.
	return (
		<p className="mt-(--page-gap) text-muted-foreground text-sm">{children}</p>
	);
}

/**
 * A page with nothing on it at all -- a station that has never recorded
 * anything, a day that stayed silent.
 *
 * This one earns the weight. There is no surrounding page to carry the
 * meaning, so a lone grey line reads as a page that failed to load rather than
 * one that is genuinely empty, which is the whole reason this component
 * exists.
 */
export function EmptyState({
	icon: Icon,
	title,
	children,
}: {
	icon: LucideIcon;
	title: string;
	/** The line beneath -- what to do about it, or why it is empty. */
	children?: ReactNode;
}) {
	return (
		<section className="feature-card mt-(--page-gap) flex flex-col items-start gap-2 rounded-md p-4">
			<Icon aria-hidden="true" className="size-8 text-muted-foreground" />
			<p className="font-semibold">{title}</p>
			{children ? (
				<p className="text-muted-foreground text-sm">{children}</p>
			) : null}
		</section>
	);
}
