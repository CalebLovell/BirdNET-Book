import { Link } from "@tanstack/react-router";
import {
	AudioLines,
	CalendarCheck,
	Clock,
	Gem,
	type LucideIcon,
	MoveRight,
	Sparkles,
	TrendingDown,
	TrendingUp,
	Undo2,
	VolumeX,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { EmptyNote } from "~/components/empty-state.tsx";
import { InfoTip } from "~/components/ui/info-tip.tsx";
import {
	type HighlightPeriod,
	highlightGuide,
} from "~/lib/highlight-thresholds.ts";
import type {
	Highlight,
	HighlightBird,
	SpeciesHighlightKind,
} from "~/lib/highlights-data.ts";
import { thanPhrase } from "~/lib/highlights-data.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import { hourLabel } from "~/lib/time-ago.ts";

/**
 * A window's highlights, as field notes: one plain sentence per highlight, led
 * by a glyph, with its figures in bold and any birds it's about named in the
 * sentence. The same card on the Live page (the last 24 hours) and the
 * timeline (the selected window) -- the lines arrive already judged by the
 * shared rules in lib/highlights-data.ts, so this only decides how they read.
 * The New, Rare, Consistent, Returned and Vocal notes take the same glyphs as
 * those flags' pills on the species rows.
 *
 * Every bird note is only written when it has something to say, so a quiet
 * window gets a visibly shorter card. The info tip in the corner says what
 * each line means for the period on screen.
 */
export function HighlightsCard({
	highlights,
	emptyMessage,
	period,
	className = "",
}: {
	/** Empty for a window with no detections, which gets the empty note. */
	highlights: Highlight[];
	/** What a quiet window's card says -- the same line the page's other cards
	    show, so they all report an empty window alike. */
	emptyMessage: string;
	/** The window the lines were judged for, so the info tip can explain them
	    in its terms. Without it the card has no info tip. */
	period?: HighlightPeriod;
	className?: string;
}) {
	return (
		<section
			aria-label="Highlights"
			className={`feature-card rounded-md p-4 ${className}`}
		>
			<div className="flex min-h-6 items-center justify-between gap-2">
				<div className="island-kicker">Highlights</div>
				{period ? <HighlightsInfo period={period} /> : null}
			</div>

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

/** What each line on the card means for this period -- the basics, from the
    same thresholds the rules use. */
function HighlightsInfo({ period }: { period: HighlightPeriod }) {
	return (
		<InfoTip label="Highlights">
			<ul className="space-y-1">
				{highlightGuide(period).map((entry) => (
					<li key={entry.name}>
						<strong>{entry.name}:</strong> {entry.meaning}
					</li>
				))}
			</ul>
			<p>
				A line only shows when a bird earns it, and a bird can earn several.
			</p>
		</InfoTip>
	);
}

type SpeciesLine = Extract<Highlight, { kind: SpeciesHighlightKind }>;

const SPECIES_NOTES: Record<
	SpeciesHighlightKind,
	{ icon: LucideIcon; lead: (line: SpeciesLine) => string }
> = {
	new: {
		icon: Sparkles,
		lead: ({ total }) => `first-ever ${total === 1 ? "visitor" : "visitors"}`,
	},
	rare: {
		icon: Gem,
		lead: ({ total }) => `rare ${total === 1 ? "visitor" : "visitors"}`,
	},
	// Says what "every day" covers, since each period has its own stretch.
	consistent: {
		icon: CalendarCheck,
		lead: ({ scope }) => `species heard ${scope ?? "every day"}`,
	},
	routine: {
		icon: VolumeX,
		lead: ({ total }) => `${total === 1 ? "regular" : "regulars"} gone quiet`,
	},
	// "species" carries the count where the lead has no noun of its own, so
	// the line never opens on a bare "1 heard ...".
	returned: { icon: Undo2, lead: () => "species back after time away" },
	// Says what "usual" is, since each period compares with its own stretch.
	vocal: {
		icon: AudioLines,
		lead: ({ comparedWith }) =>
			`species heard far more ${thanPhrase(comparedWith)}`,
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
					<Figure>{highlight.total}</Figure> {lead(highlight)}:{" "}
					<BirdNames birds={highlight.birds} total={highlight.total} />.
				</Note>
			);
		}
	}
}

/**
 * "Up 42% from last week: 240 more detections, 4 more species." Always written
 * when the period before recorded anything, whatever the size of the change.
 * The percentage is the detections' change; the species clause says the
 * difference outright, since a species count is too small for a percentage to
 * mean much.
 */
function ActivityNote({
	highlight,
}: {
	highlight: Extract<Highlight, { kind: "activity" }>;
}) {
	const { direction, percent, baselineLabel, detectionsDelta, speciesDelta } =
		highlight;

	return (
		<Note
			icon={
				direction === "up"
					? TrendingUp
					: direction === "down"
						? TrendingDown
						: MoveRight
			}
		>
			{direction === "level" ? (
				<>The same as {baselineLabel}</>
			) : (
				<>
					{direction === "up" ? "Up" : "Down"} <Figure>{percent}%</Figure> from{" "}
					{baselineLabel}
				</>
			)}
			:{" "}
			{detectionsDelta === 0 ? (
				"the same number of detections"
			) : (
				<>
					<Figure>{Math.abs(detectionsDelta).toLocaleString()}</Figure>{" "}
					{detectionsDelta > 0 ? "more" : "fewer"}{" "}
					{Math.abs(detectionsDelta) === 1 ? "detection" : "detections"}
				</>
			)}
			{speciesDelta === 0 ? (
				", the same number of species"
			) : (
				<>
					, <Figure>{Math.abs(speciesDelta)}</Figure>{" "}
					{speciesDelta > 0 ? "more" : "fewer"} species
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
	const rest = total - birds.length;
	return (
		<>
			{birds.map((bird, i) => (
				<Fragment key={bird.comName}>
					{i === 0
						? null
						: rest === 0 && i === birds.length - 1
							? " and "
							: ", "}
					<BirdName bird={bird} />
				</Fragment>
			))}
			{rest > 0 ? ` and ${rest} more` : null}
		</>
	);
}

/** A named bird, linked to its species page in the sentence's own colour --
 * underlined only on hover, like species links elsewhere -- then what earned
 * it its place. */
function BirdName({ bird }: { bird: HighlightBird }) {
	return (
		<>
			<Link
				to="/species/$comName"
				params={{ comName: comNameToSlug(bird.comName) }}
				className="text-[inherit]! no-underline hover:underline"
			>
				{bird.comName}
			</Link>
			{bird.note ? ` (${bird.note})` : null}
		</>
	);
}

/** A figure inside a note's sentence, set as a count so it reads like the
 * page's other numbers. */
function Figure({ children }: { children: ReactNode }) {
	return <span className="count-figure">{children}</span>;
}
