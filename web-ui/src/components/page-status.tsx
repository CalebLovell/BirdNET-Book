import type { ReactNode } from "react";

import { CardHeader } from "~/components/card-header.tsx";

/**
 * Which kind of dead end this is.
 *
 * `unavailable` means the thing exists but the server could not produce it --
 * a configuration file it cannot read, a query that threw. Something is wrong
 * with the station and the card says so in the destructive tone.
 *
 * `missing` means the URL names something that does not exist. A mistyped
 * address is not an alarm, so it stays muted; shouting at someone for a typo
 * makes the genuine failures harder to spot.
 */
export type PageStatusTone = "missing" | "unavailable";

/**
 * The one card every broken state renders: a standard card -- `feature-card`,
 * the header band carrying the title -- with the explanation beneath it, so a
 * dead end still looks like part of the site rather than an escape from it.
 * Only a genuine failure tints its title; a missing page stays in the usual
 * kicker colour.
 */
export function PageStatus({
	tone,
	title,
	heading = "h1",
	actions,
	children,
}: {
	tone: PageStatusTone;
	title: string;
	/** `h2` when a `PageHeaderCard` above already owns the page's `h1`. */
	heading?: "h1" | "h2";
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section aria-label={title} className="feature-card rounded-md p-4">
			<CardHeader
				as={heading}
				title={
					tone === "unavailable" ? (
						<span className="text-destructive">{title}</span>
					) : (
						title
					)
				}
			/>
			{/* A div rather than a p: several callers need two paragraphs or an
			    inline <code> path, and a p cannot hold them. */}
			<div className="mt-(--page-gap) max-w-2xl text-muted-foreground text-sm leading-relaxed">
				{children}
			</div>
			{actions ? (
				<div
					data-testid="page-status-actions"
					className="mt-(--page-gap) flex flex-wrap items-center gap-2"
				>
					{actions}
				</div>
			) : null}
		</section>
	);
}
