/**
 * The window's highlights -- peak hour, after-dark share, top species, the
 * change on the previous period, and the New / Returned / Rare birds -- as
 * their own card beside the heat map on the timeline page's widest screens.
 *
 * A placeholder for now: it holds the spot while the card's design is worked
 * out, so the page layout around it can settle first.
 */
export function HighlightsCard({ className = "" }: { className?: string }) {
	return (
		<section
			aria-label="Highlights"
			className={`feature-card rounded-md p-4 ${className}`}
		>
			<div className="island-kicker mb-2">Highlights</div>
			<p className="text-muted-foreground text-sm">
				Peak hour, top species and this window's new, returned and rare birds
				will go here.
			</p>
		</section>
	);
}
