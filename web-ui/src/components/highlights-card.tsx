import {
	AudioLines,
	Clock,
	Gem,
	type LucideIcon,
	Sparkles,
	TrendingDown,
	TrendingUp,
	Undo2,
	VolumeX,
} from "lucide-react";
import type { ReactNode } from "react";

import { EmptyNote } from "~/components/empty-state.tsx";
import type {
	Highlight,
	HighlightBird,
	SpeciesHighlightKind,
} from "~/lib/highlights-data.ts";
import { hourLabel } from "~/lib/time-ago.ts";

/**
 * A window's highlights, as field notes: one plain sentence per highlight, led
 * by a glyph, with its figures in bold and any birds it's about named in the
 * sentence. The same card on the Live page (the last 24 hours) and the
 * timeline (the selected window) -- the lines arrive already judged by the
 * shared rules in lib/highlights-data.ts, so this only decides how they read.
 * The New, Returned, Rare and Vocal notes take the same glyphs as those
 * flags' pills on the species rows.
 *
 * Every note but the busiest hour is only written when it has something to
 * say, so a quiet window gets a visibly shorter card.
 */
export function HighlightsCard({
	highlights,
	emptyMessage,
	className = "",
}: {
	/** Empty for a window with no detections, which gets the empty note. */
	highlights: Highlight[];
	/** What a quiet window's card says -- the same line the page's other cards
	    show, so they all report an empty window alike. */
	emptyMessage: string;
	className?: string;
}) {
	return (
		<section
			aria-label="Highlights"
			className={`feature-card rounded-md p-4 ${className}`}
		>
			<div className="island-kicker">Highlights</div>

			{highlights.length === 0 ? (
				<EmptyNote>{emptyMessage}</EmptyNote>
			) : (
				<ul className="mt-2">
					{highlights.map((highlight) => (
						<HighlightNote key={highlight.kind} highlight={highlight} />
					))}
				</ul>
			)}
		</section>
	);
}

const SPECIES_NOTES: Record<
	SpeciesHighlightKind,
	{ icon: LucideIcon; lead: (total: number) => string }
> = {
	new: {
		icon: Sparkles,
		lead: (total) => `first-ever ${total === 1 ? "visitor" : "visitors"}`,
	},
	returned: { icon: Undo2, lead: () => "back after time away" },
	rare: {
		icon: Gem,
		lead: (total) => `rare ${total === 1 ? "visitor" : "visitors"}`,
	},
	vocal: { icon: AudioLines, lead: () => "heard more often than usual" },
	routine: {
		icon: VolumeX,
		lead: (total) => `${total === 1 ? "regular" : "regulars"} gone quiet`,
	},
};

function HighlightNote({ highlight }: { highlight: Highlight }) {
	switch (highlight.kind) {
		case "activity":
			return <ActivityNote highlight={highlight} />;
		case "busiest-hour":
			return (
				<Note icon={Clock}>
					Busiest at <Figure>{hourLabel(highlight.hour)}</Figure>.
				</Note>
			);
		default: {
			const { icon, lead } = SPECIES_NOTES[highlight.kind];
			return (
				<Note icon={icon}>
					<Figure>{highlight.total}</Figure> {lead(highlight.total)}:{" "}
					<BirdNames birds={highlight.birds} total={highlight.total} />.
				</Note>
			);
		}
	}
}

/**
 * "Up 42% on the four weeks before: 812 detections, 4 more species." The
 * percentage is the pace's change; the species clause says the difference
 * outright, since a species count is too small for a percentage to mean much.
 * A window still running gives its pace so far instead, and no species clause.
 */
function ActivityNote({
	highlight,
}: {
	highlight: Extract<Highlight, { kind: "activity" }>;
}) {
	const { direction, percent, baselineLabel, detections, perDay } = highlight;
	const delta = highlight.speciesDelta;

	return (
		<Note icon={direction === "up" ? TrendingUp : TrendingDown}>
			{direction === "up" ? "Up" : "Down"} <Figure>{percent}%</Figure> on{" "}
			{baselineLabel}
			{perDay ? (
				<>
					, at <Figure>{detections.toLocaleString()}</Figure> detections a day
					so far
				</>
			) : (
				<>
					: <Figure>{detections.toLocaleString()}</Figure> detections
					{delta == null ? null : delta === 0 ? (
						", the usual number of species"
					) : (
						<>
							, <Figure>{Math.abs(delta)}</Figure>{" "}
							{delta > 0 ? "more" : "fewer"} species
						</>
					)}
				</>
			)}
			.
		</Note>
	);
}

/** One highlight: its glyph, then the sentence, hairlines between notes. */
function Note({
	icon: Icon,
	children,
}: {
	icon: LucideIcon;
	children: ReactNode;
}) {
	return (
		<li className="flex items-baseline gap-2.5 border-[var(--line)] border-t py-2.5 text-[13px] leading-normal first:border-t-0 first:pt-1.5 last:pb-0 max-[400px]:gap-2">
			<Icon
				className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground"
				aria-hidden="true"
			/>
			<span className="min-w-0">{children}</span>
		</li>
	);
}

/**
 * The birds a note is about, as a sentence would list them, each with what
 * earned it its place: "Wood Thrush (23 days) and Veery (16 days)", or past
 * the named few, "... and 3 more".
 */
function BirdNames({
	birds,
	total,
}: {
	birds: HighlightBird[];
	total: number;
}) {
	const named = birds.map((bird) =>
		bird.note ? `${bird.comName} (${bird.note})` : bird.comName,
	);
	const rest = total - named.length;
	if (rest > 0) return <>{`${named.join(", ")} and ${rest} more`}</>;
	if (named.length === 1) return <>{named[0]}</>;
	return <>{`${named.slice(0, -1).join(", ")} and ${named.at(-1)}`}</>;
}

/** A figure inside a note's sentence, set as a count so it reads like the
 * page's other numbers. */
function Figure({ children }: { children: ReactNode }) {
	return <span className="count-figure">{children}</span>;
}
