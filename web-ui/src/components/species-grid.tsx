import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { EmptyNote } from "~/components/empty-state.tsx";
import {
	Pill,
	type ReturnedUnit,
	SpeciesFlagPills,
} from "~/components/species-flag-pills.tsx";
import { SpeciesHourBars } from "~/components/species-hour-bars.tsx";
import { SpeciesThumbnail } from "~/components/species-row.tsx";
import { TooltipProvider } from "~/components/ui/tooltip.tsx";
import { confidenceStyle, formatConfidence } from "~/lib/confidence.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";

export type SpeciesGridItem = {
	comName: string;
	sciName: string;
	imageUrl: string | null;
	count: number;
	averageConfidence: number | null;
	isNew: boolean;
	isRare: boolean;
	isReturned: boolean;
	/** The selected period's unit, or null unless isReturned. Returned always means
	    absent the one period before this one, so the pill names a single unit. */
	returnedUnit: ReturnedUnit;
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
export function SpeciesGrid({
	species,
	newLabel,
	emptyMessage,
	summary,
	action,
	className = "",
}: {
	species: SpeciesGridItem[];
	/** Names the window in the "New" chip tooltip. Null hides the chip entirely,
	    which is what "all time" wants: everything is trivially first heard. */
	newLabel: string | null;
	emptyMessage: string;
	/** The window's headline figures, set beside the kicker -- the timeline
	    page's detections/species readout, kept on both bodies so the view toggle
	    doesn't drop it. Omitted by callers that show the card on its own. */
	summary?: ReactNode;
	/** A control set against the card title, top-right -- the view switcher on
	    the timeline page. Omitted by callers that show the card on its own. */
	action?: ReactNode;
	className?: string;
}) {
	return (
		<TooltipProvider>
			<section
				aria-label="Species"
				className={`feature-card rounded-md p-4 ${className}`}
			>
				<div
					className={`flex items-center justify-between gap-3 max-[400px]:flex-wrap max-[400px]:gap-y-2 ${species.length === 0 && !action ? "" : "mb-4"}`}
				>
					{/* "Activity" -- identical to the heat-map view's kicker -- so the
					    summary beside it stays put when the view toggle swaps the cards.
					    Not "Species": the summary already says "N species" beside it. */}
					{/* Under 400px this wrapper steps aside (`contents`) so the kicker,
					    the summary and the switcher wrap as one row: the kicker and the
					    switcher on the first line, the summary on its own below them.
					    See WindowSummary on the timeline page. */}
					{/* A fixed line height, the summary's own: a quiet window has no
					    summary, and without this the row would shrink by its 3px and
					    the switcher centred on it would jump. */}
					<div className="flex h-5 min-w-0 items-center gap-3 max-[400px]:contents">
						<div className="island-kicker shrink-0">Activity</div>
						{summary}
					</div>
					{/* The switcher sits inside the content box, flush with its top and
					    right edges -- never pulled out into the card's padding. The row
					    takes its height and the kicker centres against it. */}
					{action ? <div className="shrink-0">{action}</div> : null}
				</div>

				{species.length === 0 ? (
					<EmptyNote>{emptyMessage}</EmptyNote>
				) : (
					<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
						{species.map((item) => (
							<SpeciesGridRow
								key={item.comName}
								item={item}
								newLabel={newLabel}
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
	newLabel,
}: {
	item: SpeciesGridItem;
	newLabel: string | null;
}) {
	return (
		<li className="flex min-h-16 min-w-0 flex-col gap-2 rounded-md bg-[var(--meadow)] px-3 py-2">
			<div className="flex min-w-0 items-center gap-3">
				<SpeciesThumbnail imageUrl={item.imageUrl} comName={item.comName} />

				{/* LEFT: who the bird is -- common name over its scientific name. */}
				<div className="min-w-0 flex-1">
					<Link
						to="/species/$comName"
						params={{ comName: comNameToSlug(item.comName) }}
						className="block truncate font-medium no-underline hover:underline"
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
						{item.averageConfidence != null ? (
							<Pill
								label={formatConfidence(item.averageConfidence)}
								style={confidenceStyle(item.averageConfidence)}
								tabular
							/>
						) : null}
						<SpeciesFlagPills
							isNew={item.isNew}
							isReturned={item.isReturned}
							isRare={item.isRare}
							returnedUnit={item.returnedUnit}
							newLabel={newLabel}
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
					className="border-[var(--line)] border-t pt-2"
				/>
			) : null}
		</li>
	);
}
