import { CircleAlert, Compass } from "lucide-react";
import type { ReactNode } from "react";

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

const TONE_ICON = { missing: Compass, unavailable: CircleAlert } as const;

const TONE_COLOR = {
	missing: "text-muted-foreground",
	unavailable: "text-destructive",
} as const;

/**
 * The one card every broken state renders. Its shell is deliberately identical
 * to a settings card -- same `feature-card`, same padding -- so a dead end
 * still looks like part of the site rather than an escape from it.
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
	const Icon = TONE_ICON[tone];
	const Heading = heading;

	return (
		// 20px padding is this card's own, so the page-gap rule for `p-4` cards
		// doesn't reach it; on phones it steps down to 8px with the rest.
		<section className="feature-card rounded-md p-5 max-[400px]:p-2">
			<div className="flex items-start gap-3 max-[400px]:gap-2">
				<Icon
					aria-hidden="true"
					className={`mt-0.5 size-5 ${TONE_COLOR[tone]}`}
				/>
				<div>
					<Heading className="display-title font-semibold text-xl">
						{title}
					</Heading>
					{/* A div rather than a p: several callers need two paragraphs or an
					    inline <code> path, and a p cannot hold them. */}
					<div className="mt-2 max-w-2xl text-muted-foreground text-sm leading-relaxed">
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
				</div>
			</div>
		</section>
	);
}
