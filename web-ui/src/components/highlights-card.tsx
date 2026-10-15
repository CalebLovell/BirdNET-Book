import { Link } from "@tanstack/react-router";
import {
	AudioLines,
	Clock,
	Gem,
	House,
	type LucideIcon,
	MoveRight,
	Sparkles,
	TrendingDown,
	TrendingUp,
	Undo2,
	VolumeX,
} from "lucide-react";
import { type CSSProperties, Fragment, type ReactNode } from "react";
import { CardHeader } from "~/components/card-header.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import { BADGE_STYLES } from "~/components/species-flag-pills.tsx";
import { Hint } from "~/components/ui/hint.tsx";
import { InfoTip } from "~/components/ui/info-tip.tsx";
import { ShellBar, ShellText } from "~/components/ui/shell.tsx";
import {
	type HighlightGuideEntry,
	type HighlightPeriod,
	type HighlightThresholds,
	highlightGuide,
} from "~/lib/highlight-thresholds.ts";
import type {
	Highlight,
	HighlightBird,
	SpeciesHighlightKind,
} from "~/lib/highlights-data.ts";
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
 * every line means for the period on screen; each line's glyph explains just
 * its own on hover.
 */
export function HighlightsCard({
	highlights,
	emptyMessage,
	period,
	thresholds,
	className = "",
}: {
	/** Empty for a window with no detections, which gets the empty note; null
	    while they are still being judged, which holds their place with soft
	    bars until they arrive. */
	highlights: Highlight[] | null;
	/** What a quiet window's card says -- the same line the page's other cards
	    show, so they all report an empty window alike. */
	emptyMessage: string;
	/** The window the lines were judged for, so the info tip can explain them
	    in its terms. Without it the card has no info tip. */
	period?: HighlightPeriod;
	/** The station's own rules, so the info tip describes what was actually
	    applied. The defaults stand in while they load. */
	thresholds?: HighlightThresholds;
	className?: string;
}) {
	const guide = period ? highlightGuide(period, thresholds) : [];
	return (
		<section
			aria-label="Highlights"
			className={`feature-card rounded-md p-4 ${className}`}
		>
			<CardHeader title="Highlights">
				{period ? <HighlightsInfo guide={guide} /> : null}
			</CardHeader>

			{highlights === null ? (
				<PendingNotes />
			) : highlights.length === 0 ? (
				<EmptyNote>{emptyMessage}</EmptyNote>
			) : (
				<ul className="mt-2">
					{highlights.map((highlight) => (
						<HighlightNote
							key={highlight.kind}
							highlight={highlight}
							tip={guide.find((entry) => entry.kind === highlight.kind)}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

/**
 * Where the lines will land, built from the lines' own markup: the glyph's
 * circle and a bar on the line of text, in the notes' type. Four one-line
 * notes.
 */
const PENDING_NOTES = [["w-4/5"], ["w-1/3"], ["w-3/4"], ["w-3/5"]];

function PendingNotes() {
	return (
		<ul aria-busy="true" aria-label="Loading highlights" className="mt-2">
			{PENDING_NOTES.map((lines, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static decoration
				<li key={index} className={NOTE_CLASS}>
					<ShellBar className="size-5 shrink-0 rounded-full" />
					<span className="min-w-0 flex-1 pt-px">
						{lines.map((width, line) => (
							<ShellText
								// biome-ignore lint/suspicious/noArrayIndexKey: static decoration
								key={line}
								className="text-[13px] leading-normal"
								barClassName={width}
							/>
						))}
					</span>
				</li>
			))}
		</ul>
	);
}

/** What each line on the card means for this period -- the basics, from the
    same thresholds the rules use. */
function HighlightsInfo({ guide }: { guide: HighlightGuideEntry[] }) {
	return (
		<InfoTip label="Highlights">
			<ul className="space-y-1">
				{guide.map((entry) => (
					<li key={entry.name}>
						<strong>{entry.name}:</strong> {entry.meaning}
					</li>
				))}
			</ul>
		</InfoTip>
	);
}

type SpeciesLine = Extract<Highlight, { kind: SpeciesHighlightKind }>;

// Every line's glyph wears a tint: the species-row badge's own for the lines
// that share a badge's name, and for the rest -- which have no badge -- a hue
// of their own that no badge uses: olive for up, a light red for down,
// sunrise orange for the busiest hour, slate for gone quiet. An unchanged count
// keeps the neutral icon well.
const UP_TINT: CSSProperties = {
	backgroundColor: "color-mix(in oklab, #6b8a3a 22%, var(--paper-raised))",
	color: "#3d5220",
};
const DOWN_TINT: CSSProperties = {
	backgroundColor: "color-mix(in oklab, #c4524a 20%, var(--paper-raised))",
	color: "#7d2a24",
};
const LINE_TINTS: Record<
	Exclude<Highlight["kind"], "activity">,
	CSSProperties
> = {
	...BADGE_STYLES,
	"busiest-hour": {
		backgroundColor: "color-mix(in oklab, #c8703c 22%, var(--paper-raised))",
		color: "#7a3f1c",
	},
	routine: {
		backgroundColor: "color-mix(in oklab, #5f6f82 20%, var(--paper-raised))",
		color: "#3a4654",
	},
};

// Each line leads with its badge's own name, so the card and the species
// rows say the same thing: "2 rare", "1 gone quiet", "4 vocal".
const SPECIES_NOTES: Record<
	SpeciesHighlightKind,
	{ icon: LucideIcon; lead: (line: SpeciesLine) => string }
> = {
	new: { icon: Sparkles, lead: () => "new" },
	rare: { icon: Gem, lead: () => "rare" },
	consistent: {
		icon: House,
		lead: ({ total }) => (total === 1 ? "regular" : "regulars"),
	},
	routine: { icon: VolumeX, lead: () => "gone quiet" },
	returned: { icon: Undo2, lead: () => "returned" },
	vocal: { icon: AudioLines, lead: () => "vocal" },
};

function HighlightNote({
	highlight,
	tip,
}: {
	highlight: Highlight;
	/** The guide's entry for this line, shown on its glyph. */
	tip?: HighlightGuideEntry;
}) {
	switch (highlight.kind) {
		case "activity":
			return <ActivityNote highlight={highlight} tip={tip} />;
		case "busiest-hour":
			return (
				<Note icon={Clock} badge={LINE_TINTS["busiest-hour"]} tip={tip}>
					Busiest at <Figure>{hourLabel(highlight.hour)}</Figure>.
				</Note>
			);
		default: {
			const { icon, lead } = SPECIES_NOTES[highlight.kind];
			return (
				<Note icon={icon} badge={LINE_TINTS[highlight.kind]} tip={tip}>
					<Figure>{highlight.total}</Figure> {lead(highlight)}:{" "}
					<BirdNames birds={highlight.birds} total={highlight.total} />.
				</Note>
			);
		}
	}
}

/**
 * "Up 42% from last week: 240 more detections." Always written when the
 * period before recorded anything, whatever the size of the change.
 */
function ActivityNote({
	highlight,
	tip,
}: {
	highlight: Extract<Highlight, { kind: "activity" }>;
	tip?: HighlightGuideEntry;
}) {
	const { direction, percent, baselineLabel, count, delta } = highlight;
	const noun = (n: number) => (n === 1 ? "detection" : "detections");

	return (
		<Note
			tip={tip}
			icon={
				direction === "up"
					? TrendingUp
					: direction === "down"
						? TrendingDown
						: MoveRight
			}
			badge={
				direction === "up"
					? UP_TINT
					: direction === "down"
						? DOWN_TINT
						: undefined
			}
		>
			{direction === "level" ? (
				<>
					The same as {baselineLabel}: <Figure>{count.toLocaleString()}</Figure>{" "}
					{noun(count)}
				</>
			) : (
				<>
					{direction === "up" ? "Up" : "Down"} <Figure>{percent}%</Figure> from{" "}
					{baselineLabel}: <Figure>{Math.abs(delta).toLocaleString()}</Figure>{" "}
					{delta > 0 ? "more" : "fewer"} {noun(Math.abs(delta))}
				</>
			)}
			.
		</Note>
	);
}

/** One highlight: its glyph, then the sentence, hairlines between notes. */
/** A note's row, shared with the pending shell so the two are one shape. */
const NOTE_CLASS =
	"flex items-start gap-2.5 border-[var(--line)] border-t py-2.5 text-[13px] leading-normal first:border-t-0 first:pt-1.5 last:pb-0 max-[400px]:gap-2";

function Note({
	icon: Icon,
	badge,
	tip,
	children,
}: {
	icon: LucideIcon;
	/** The line's tint (see LINE_TINTS); without one the glyph sits in the
	    neutral icon well. */
	badge?: CSSProperties;
	/** What this line means, shown on hovering or focusing its glyph. Without
	    one the glyph is plain decoration. */
	tip?: HighlightGuideEntry;
	children: ReactNode;
}) {
	const glyphClass =
		"grid size-5 shrink-0 place-items-center rounded-full bg-[var(--icon-well)] text-muted-foreground";
	return (
		<li className={NOTE_CLASS}>
			{tip ? (
				<Hint
					className="max-w-80 leading-relaxed"
					content={
						<>
							<strong>{tip.name}:</strong> {tip.meaning}
						</>
					}
				>
					<button
						type="button"
						aria-label={`About ${tip.name}`}
						className={`${glyphClass} cursor-help`}
						style={badge}
					>
						<Icon className="size-3" aria-hidden="true" />
					</button>
				</Hint>
			) : (
				<span className={glyphClass} style={badge} aria-hidden="true">
					<Icon className="size-3" />
				</span>
			)}
			<span className="min-w-0 pt-px">{children}</span>
		</li>
	);
}

/**
 * The birds a note is about, by name alone, as a sentence would list them:
 * "Wood Thrush, Veery and Cedar Waxwing", or past the named few, "... and 3
 * more". The figures behind each (its run, its time away) stay in the share
 * text; the card keeps to names.
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
 * underlined only on hover, like species links elsewhere. */
function BirdName({ bird }: { bird: HighlightBird }) {
	return (
		<Link
			to="/birds/$comName"
			params={{ comName: comNameToSlug(bird.comName) }}
			className="text-[inherit]! no-underline hover:underline"
		>
			{bird.comName}
		</Link>
	);
}

/** A figure inside a note's sentence, set as a count so it reads like the
 * page's other numbers. */
function Figure({ children }: { children: ReactNode }) {
	return <span className="count-figure">{children}</span>;
}
