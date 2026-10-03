import type { ReactNode } from "react";

import { CardHeader } from "~/components/card-header.tsx";

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
 * Titled like every other card, with the standard header band, so an empty
 * page still looks like the site rather than a different kind of thing. The
 * page around it already spaces its children, so it adds no top margin of its
 * own.
 */
export function EmptyState({
	title,
	children,
}: {
	/** The card's kicker, as on the populated card this one stands in for. */
	title: string;
	/** What is missing, and what will fill it. */
	children: ReactNode;
}) {
	return (
		<section aria-label={title} className="feature-card rounded-md p-4">
			<CardHeader title={title} />
			<EmptyNote>{children}</EmptyNote>
		</section>
	);
}
