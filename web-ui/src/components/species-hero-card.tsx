import { Link } from "@tanstack/react-router";
import { Bird } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { ConfidencePill } from "~/components/confidence-pill.tsx";
import {
	type PageHeaderStat,
	PageHeaderStats,
} from "~/components/page-header-card.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";

/**
 * The one masthead shape shared by the Today page's hero and the species
 * profile: portrait on the left, and a content column that always reads name,
 * scientific name, how long ago, when and how confidently, then the figures.
 * Only the data differs between the two pages -- never the shape.
 */
export const HERO_CARD_SHELL = "feature-card rounded-md p-4";

/**
 * Portrait and content sit in their own grid rather than in the card itself, so
 * anything the card unfolds below -- a share summary, say -- is a sibling of
 * that row. Centring the portrait against the whole card instead would walk the
 * bird down the page every time the panel opened.
 */
const HERO_CARD_ROW =
	"grid items-center gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]";

/**
 * Indented past the portrait column and the gap after it -- 11rem + gap-4 --
 * so what unfolds lines up with the text above it rather than starting under
 * the bird. Below `sm` the row is one column and there is nothing to clear.
 */
const HERO_CARD_FOOTER = "sm:pl-48";

export function HeroCardShell({
	label,
	portrait,
	className = HERO_CARD_SHELL,
	style,
	footer,
	children,
}: {
	label: string;
	portrait: ReactNode;
	className?: string;
	style?: CSSProperties;
	/** Unfolds beneath the portrait row, aligned with the content column. */
	footer?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section aria-label={label} className={className} style={style}>
			<div className={HERO_CARD_ROW}>
				{portrait}

				<div className="flex min-w-0 flex-col gap-2.5">{children}</div>
			</div>

			{footer ? <div className={HERO_CARD_FOOTER}>{footer}</div> : null}
		</section>
	);
}

export function HeroPortrait({
	imageUrl,
	comName,
}: {
	imageUrl: string | null;
	comName: string;
}) {
	return (
		// Centred, not left-aligned: the illustrations range from 0.81 to 1.49 in
		// aspect, so object-contain leaves up to 37px of slack in the column. Left
		// alignment pools all of it into the gutter before the text; centring
		// splits it. Sizing the column to the bird instead would move the text's
		// left edge per species, which the Today hero would jump through on every
		// poll.
		<div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden sm:h-36">
			{imageUrl ? (
				<img
					src={imageUrl}
					alt={comName}
					className="max-h-full max-w-full object-contain"
				/>
			) : (
				<Bird className="size-16 text-muted-foreground" />
			)}
		</div>
	);
}

export function SpeciesHeroCard({
	label,
	comName,
	sciName,
	speciesSlug,
	imageUrl,
	relativeTime,
	clockTime,
	confidence,
	audioUrl,
	stats,
	actions,
	footer,
	className,
	style,
}: {
	label: string;
	comName: string;
	sciName: string;
	/** Links the title to the species page. Omit on the species page itself. */
	speciesSlug?: string;
	imageUrl: string | null;
	/** The moss line: "5 minutes ago". */
	relativeTime: string;
	/** The wall-clock time that reading is of, e.g. "4:13 PM". */
	clockTime: string;
	confidence: number | null;
	audioUrl: string | null;
	/** The figures, rendered as their own row of little cards below the portrait
	    card. Omit them entirely -- as the Live hero does -- where the page's own
	    cards already carry these counts. */
	stats?: PageHeaderStat[];
	/** Top-right controls, e.g. the species page's eBird link. */
	actions?: ReactNode;
	/** Unfolds beneath the figures -- what `actions` opens, if anything. */
	footer?: ReactNode;
	className?: string;
	style?: CSSProperties;
}) {
	const hero = (
		<HeroCardShell
			label={label}
			portrait={<HeroPortrait imageUrl={imageUrl} comName={comName} />}
			className={className}
			style={style}
			footer={footer}
		>
			{/* Title and actions share a line, so the column starts level with the
			    top of the portrait. */}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					{/* Moss set on the heading, not inherited from the anchor: the title
					    reads the same whether or not it links anywhere. */}
					<h1 className="display-title font-bold text-2xl text-[var(--moss)] sm:text-3xl">
						{speciesSlug ? (
							<Link
								to="/species/$comName"
								params={{ comName: speciesSlug }}
								className="no-underline hover:underline"
							>
								{comName}
							</Link>
						) : (
							comName
						)}
					</h1>
					<p className="text-[var(--bark)] text-xs italic">{sciName}</p>
				</div>
				{actions}
			</div>

			<div>
				<p className="font-semibold text-[var(--moss)] text-lg">
					{relativeTime}
				</p>
				{/* Only the phrase is muted: set on the row, the colour leaked into
				    the outline button (which inherits its text colour), leaving it
				    greyer than the same button everywhere else. */}
				<div className="tabular-data mt-1 flex flex-wrap items-center gap-2 text-sm">
					{/* Phrased identically on both pages: the card always describes the
					    most recent detection, whether or not the page is polling. */}
					<span className="text-muted-foreground">
						last heard at {clockTime}
					</span>
					<ConfidencePill confidence={confidence} />
					<RecordingButton audioUrl={audioUrl} />
				</div>
			</div>
		</HeroCardShell>
	);

	// The figures are their own row of little cards below the portrait card, not
	// a strip inside it -- siblings, so nothing sits card-inside-card. Without
	// figures the card stands alone and needs no wrapper.
	if (!stats || stats.length === 0) return hero;

	return (
		<div className="space-y-4">
			{hero}
			<PageHeaderStats stats={stats} />
		</div>
	);
}
