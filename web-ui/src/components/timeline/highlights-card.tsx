import {
	Gem,
	type LucideIcon,
	Minus,
	Moon,
	Sparkles,
	Sun,
	TrendingDown,
	TrendingUp,
	Undo2,
} from "lucide-react";
import type { ReactNode } from "react";

import { EmptyNote } from "~/components/empty-state.tsx";
import { hourLabel } from "~/lib/time-ago.ts";
import type { TimelineData, TimelineRow } from "~/lib/timeline.ts";
import type { TimelinePeriod } from "~/lib/timeline-periods.ts";
import { NIGHT_HOURS } from "~/lib/timeline-share.ts";

// How each period names the one before it, for "up 24% on the week before" and
// "back after missing the week before".
const PREVIOUS_PERIOD: Record<Exclude<TimelinePeriod, "all">, string> = {
	day: "the day before",
	week: "the week before",
	month: "the month before",
	year: "the year before",
};

// A note names at most this many birds before summing up the rest, so a
// migration week doesn't turn one line into a paragraph.
const MAX_NAMED_BIRDS = 5;

/**
 * The window's highlights, as field notes: one plain sentence per highlight,
 * led by a glyph, with its figures in bold and any birds it's about named in
 * the sentence. It sits under the detections-by-hour rose in the column beside
 * the heat map, on the timeline page's widest screens. The New, Returned and
 * Rare notes take the same glyphs as those flags' pills on the species rows.
 *
 * A note is only written when it has something to say -- no comparison on "all
 * time" or after a period the station was down for, no newcomers when nobody
 * arrived -- so a quiet window gets a visibly shorter card.
 */
export function HighlightsCard({
	rows,
	period,
	previousTotals,
	emptyMessage,
	className = "",
}: {
	/** The window's species, busiest first. Empty for a quiet window, which
	 * gets an empty note instead of the notes. */
	rows: TimelineRow[];
	period: TimelinePeriod;
	previousTotals: TimelineData["previousTotals"];
	/** What a quiet window's card says -- the same line the Activity card
	 * shows, so all three cards report an empty window alike. */
	emptyMessage: string;
	className?: string;
}) {
	const previousLabel = period === "all" ? null : PREVIOUS_PERIOD[period];

	const detections = rows.reduce((sum, row) => sum + row.totalDetections, 0);
	const byHour = Array.from({ length: 24 }, (_, hour) =>
		rows.reduce((sum, row) => sum + (row.hourCounts[hour] ?? 0), 0),
	);
	const peakHour = byHour.indexOf(Math.max(...byHour));
	const afterDark = byHour.reduce(
		(sum, count, hour) => (NIGHT_HOURS.has(hour) ? sum + count : sum),
		0,
	);
	const nightShare = Math.round((afterDark / detections) * 100);

	const newcomers = rows.filter((row) => row.isNew);
	const returned = rows.filter((row) => row.isReturned);
	const rare = rows.filter((row) => row.isRare);

	if (rows.length === 0) {
		return (
			<section
				aria-label="Highlights"
				className={`feature-card rounded-md p-4 ${className}`}
			>
				<div className="island-kicker">Highlights</div>
				<EmptyNote>{emptyMessage}</EmptyNote>
			</section>
		);
	}

	return (
		<section
			aria-label="Highlights"
			className={`feature-card rounded-md p-4 ${className}`}
		>
			<div className="island-kicker">Highlights</div>

			<ul className="mt-2">
				{previousLabel && previousTotals && previousTotals.detections > 0 ? (
					<ComparisonNote
						detections={detections}
						species={rows.length}
						previous={previousTotals}
						previousLabel={previousLabel}
					/>
				) : null}

				{nightShare > 0 ? (
					<Note icon={Moon}>
						<Figure>{nightShare}%</Figure> heard after dark, peaking at{" "}
						<Figure>{hourLabel(peakHour)}</Figure>.
					</Note>
				) : (
					<Note icon={Sun}>
						Busiest at <Figure>{hourLabel(peakHour)}</Figure>, with nothing
						heard after dark.
					</Note>
				)}

				{newcomers.length > 0 ? (
					<Note icon={Sparkles}>
						<Figure>{newcomers.length}</Figure> first-ever{" "}
						{newcomers.length === 1 ? "visitor" : "visitors"}:{" "}
						<BirdNames birds={newcomers} />.
					</Note>
				) : null}

				{returned.length > 0 && previousLabel ? (
					<Note icon={Undo2}>
						<Figure>{returned.length}</Figure> back after missing{" "}
						{previousLabel}: <BirdNames birds={returned} />.
					</Note>
				) : null}

				{rare.length > 0 ? (
					<Note icon={Gem}>
						<Figure>{rare.length}</Figure> rare{" "}
						{rare.length === 1 ? "visitor" : "visitors"}:{" "}
						<BirdNames birds={rare} />.
					</Note>
				) : null}
			</ul>
		</section>
	);
}

/**
 * "Up 24% on the week before: 117 detections, 4 more species." The percentage
 * is the detections' change; the species clause says the difference outright,
 * since a species count is too small for a percentage to mean much.
 */
function ComparisonNote({
	detections,
	species,
	previous,
	previousLabel,
}: {
	detections: number;
	species: number;
	previous: { detections: number; species: number };
	previousLabel: string;
}) {
	const change = Math.round(
		((detections - previous.detections) / previous.detections) * 100,
	);
	const speciesDelta = species - previous.species;
	const icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;

	return (
		<Note icon={icon}>
			{change === 0 ? (
				<>Level with {previousLabel}: </>
			) : (
				<>
					{change > 0 ? "Up" : "Down"} <Figure>{Math.abs(change)}%</Figure> on{" "}
					{previousLabel}:{" "}
				</>
			)}
			<Figure>{detections.toLocaleString()}</Figure> detections,{" "}
			{speciesDelta === 0 ? (
				"the same number of species"
			) : (
				<>
					<Figure>{Math.abs(speciesDelta)}</Figure>{" "}
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
 * The birds a note is about, as a sentence would list them: "Blackpoll
 * Warbler, Swainson's Thrush and Wood Thrush", or past MAX_NAMED_BIRDS, the
 * busiest few "and 3 more".
 */
function BirdNames({ birds }: { birds: TimelineRow[] }) {
	const named = birds.slice(0, MAX_NAMED_BIRDS).map((bird) => bird.comName);
	const rest = birds.length - named.length;
	if (rest > 0) return <>{`${named.join(", ")} and ${rest} more`}</>;
	if (named.length === 1) return <>{named[0]}</>;
	return <>{`${named.slice(0, -1).join(", ")} and ${named.at(-1)}`}</>;
}

/** A figure inside a note's sentence, set as a count so it reads like the
 * page's other numbers. */
function Figure({ children }: { children: ReactNode }) {
	return <span className="count-figure">{children}</span>;
}
