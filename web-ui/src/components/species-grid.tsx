import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CARD_HEADER_CLASS } from "~/components/card-header.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import { SpeciesFlagPills } from "~/components/species-flag-pills.tsx";
import {
	SpeciesHourBars,
	SpeciesHourBarsSkeleton,
} from "~/components/species-hour-bars.tsx";
import { SpeciesThumbnail } from "~/components/species-row.tsx";
import { ShellBar, ShellText } from "~/components/ui/shell.tsx";
import { TooltipProvider } from "~/components/ui/tooltip.tsx";
import { heatMaximum } from "~/lib/heatmap.ts";
import type { VocalJump } from "~/lib/highlights-data.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";

export type SpeciesGridItem = {
	comName: string;
	sciName: string;
	imageUrl: string | null;
	count: number;
	isNew: boolean;
	/** The day a New bird was first recorded. Null unless isNew. */
	firstHeard: string | null;
	isRare: boolean;
	isConsistent: boolean;
	/** How much of the window a Regular bird filled ("every day this week"). */
	regularNote: string | null;
	isReturned: boolean;
	/** How long a returning bird was away ("3 weeks"), or null unless
	    isReturned. */
	away: string | null;
	/** How many times its usual rate, when heard far more than usual. */
	vocal: VocalJump | null;
	/** 24 detection counts, midnight first, for this species in the window.
	    Absent when the caller has no hourly breakdown; the row then draws no
	    chart. */
	hourCounts?: number[];
};

/**
 * Every species heard in the window, as a responsive grid of illustrated rows.
 * The same object on every period: the picture, the name, how often it was
 * heard, how confident those calls were, and chips for what stands out about it
 * (first arrival here, rare visitor). One feature-card holding meadow-tinted
 * rows -- not a grid of nested cards.
 */
// Shared by the grid and its skeleton, so the two are one shape.
const LIST_CLASS =
	"grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3";
const TILE_CLASS =
	"flex min-h-16 min-w-0 flex-col gap-2 rounded-md bg-[var(--meadow)] px-3 py-2 max-[400px]:px-2";

export function SpeciesGrid({
	species,
	emptyMessage,
	emptyAction,
	summary,
	action,
	className = "",
}: {
	species: SpeciesGridItem[];
	emptyMessage: string;
	/** A way out of an empty window, set on its own line under the message. */
	emptyAction?: ReactNode;
	/** The window's headline figures, set beside the kicker -- the timeline
	    page's detections/species readout, kept on both bodies so the view toggle
	    doesn't drop it. Omitted by callers that show the card on its own. */
	summary?: ReactNode;
	/** A control set against the card title, top-right -- the view switcher on
	    the timeline page. Omitted by callers that show the card on its own. */
	action?: ReactNode;
	className?: string;
}) {
	// One colour scale for every tile's bars -- see heatShare.
	const heatMax = heatMaximum(
		species.map((item) => ({ hourCounts: item.hourCounts ?? [] })),
	);
	return (
		<TooltipProvider>
			<section
				aria-label="Species"
				className={`feature-card rounded-md p-4 ${className}`}
			>
				<div
					className={`${CARD_HEADER_CLASS} gap-3 py-2 max-[400px]:flex-wrap max-[400px]:gap-y-2 ${species.length === 0 && !action ? "" : "mb-(--page-gap)"}`}
				>
					{/* "Activity" -- identical to the heat-map view's kicker -- so the
					    summary beside it stays put when the view toggle swaps the cards.
					    Not "Species": the summary already says "N species" beside it. */}
					{/* Under 400px this wrapper steps aside (`contents`) so the kicker,
					    the summary and the switcher wrap as one row: the kicker and the
					    switcher on the first line, the summary on its own below them.
					    See WindowSummary on the timeline page. */}
					{/* Exactly the kicker's own line box, pinned to the top of the row, so
					    the kicker sits where every other card's title does -- the taller
					    switcher beside it can't push it down. The summary centres on it and
					    overhangs by a hair; a quiet window with none doesn't move it. */}
					<div className="flex h-[calc(0.69rem*1.5)] min-w-0 items-center gap-3 max-[400px]:contents">
						<div className="island-kicker shrink-0">Activity</div>
						{summary}
					</div>
					{/* The switcher holds the band's right end. */}
					{action ? <div className="shrink-0">{action}</div> : null}
				</div>

				{species.length === 0 ? (
					<>
						<EmptyNote>{emptyMessage}</EmptyNote>
						{emptyAction ? <div className="mt-3">{emptyAction}</div> : null}
					</>
				) : (
					<ul className={LIST_CLASS}>
						{species.map((item) => (
							<SpeciesGridRow
								key={item.comName}
								item={item}
								heatMax={heatMax}
							/>
						))}
					</ul>
				)}
			</section>
		</TooltipProvider>
	);
}

function SpeciesGridRow({
	item,
	heatMax,
}: {
	item: SpeciesGridItem;
	heatMax: number;
}) {
	return (
		<li className={TILE_CLASS}>
			<div className="flex min-w-0 items-center gap-3 max-[400px]:gap-2">
				<SpeciesThumbnail imageUrl={item.imageUrl} comName={item.comName} />

				{/* LEFT: who the bird is -- common name over its scientific name. */}
				<div className="min-w-0 flex-1">
					<Link
						to="/birds/$comName"
						params={{ comName: comNameToSlug(item.comName) }}
						className="block max-w-fit truncate font-medium no-underline hover:underline"
					>
						{item.comName}
					</Link>
					<div className="truncate text-[var(--bark)] text-xs italic">
						{item.sciName}
					</div>
				</div>

				{/* RIGHT: everything measured about it -- the count and its flags. */}
				<div className="flex shrink-0 flex-col items-end gap-1.5">
					<span className="count-figure">{item.count.toLocaleString()}</span>
					<div className="flex flex-wrap items-center justify-end gap-1.5">
						<SpeciesFlagPills
							isNew={item.isNew}
							isReturned={item.isReturned}
							isRare={item.isRare}
							isConsistent={item.isConsistent}
							regularNote={item.regularNote}
							away={item.away}
							vocal={item.vocal}
							firstHeard={item.firstHeard}
						/>
					</div>
				</div>
			</div>

			{/* The bird's day at a glance, under its name. Hairline off the meadow
			    so it reads as the same tile, not a nested card. */}
			{item.hourCounts ? (
				<SpeciesHourBars
					comName={item.comName}
					hourCounts={item.hourCounts}
					heatMax={heatMax}
					className="border-[var(--line)] border-t pt-2"
				/>
			) : null}
		</li>
	);
}

const NAME_WIDTHS = ["w-32", "w-24", "w-36", "w-28"];

/**
 * The grid before its species arrive: the header band (with whatever the
 * caller sets in it) and tiles built from the real tile's pieces -- the
 * thumbnail's square, bars on the two name lines and the count, and the
 * hour chart's skeleton under a hairline.
 */
export function SpeciesGridSkeleton({
	summary,
	action,
	tiles = 9,
	className = "",
}: {
	summary?: ReactNode;
	action?: ReactNode;
	tiles?: number;
	className?: string;
}) {
	return (
		<section
			aria-busy="true"
			aria-label="Species"
			className={`feature-card rounded-md p-4 ${className}`}
		>
			<div
				className={`${CARD_HEADER_CLASS} mb-(--page-gap) gap-3 py-2 max-[400px]:flex-wrap max-[400px]:gap-y-2`}
			>
				<div className="flex h-[calc(0.69rem*1.5)] min-w-0 items-center gap-3 max-[400px]:contents">
					<div className="island-kicker shrink-0">Activity</div>
					{summary}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			<ul aria-hidden="true" className={LIST_CLASS}>
				{Array.from({ length: tiles }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static decoration
					<li key={index} className={TILE_CLASS}>
						<div className="flex min-w-0 items-center gap-3 max-[400px]:gap-2">
							<div className="flex size-10 shrink-0 items-center justify-center">
								<ShellBar className="size-9 rounded-md" />
							</div>
							<div className="min-w-0 flex-1">
								<ShellText
									className="font-medium"
									barClassName={NAME_WIDTHS[index % NAME_WIDTHS.length]}
								/>
								<ShellText className="text-xs" barClassName="w-24" />
							</div>
							<div className="flex shrink-0 flex-col items-end gap-1.5">
								<ShellText
									className="count-figure w-10"
									barClassName="right-0 left-auto w-8"
								/>
							</div>
						</div>
						<SpeciesHourBarsSkeleton className="border-[var(--line)] border-t pt-2" />
					</li>
				))}
			</ul>
		</section>
	);
}
