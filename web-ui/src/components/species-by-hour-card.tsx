import { Link } from "@tanstack/react-router";
import { Bird } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyNote } from "~/components/empty-state.tsx";
import {
	type ReturnedUnit,
	SpeciesFlagPills,
} from "~/components/species-flag-pills.tsx";
import { TooltipProvider } from "~/components/ui/tooltip.tsx";
import { HEAT_COLORS, heatLevel } from "~/lib/heatmap.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import { hourLabel } from "~/lib/time-ago.ts";

/**
 * One species' day, as the grid draws it. Both callers carry more than this --
 * the timeline its eBird links, the day page its recordings -- so they narrow
 * to the fields the grid actually reads.
 */
export type SpeciesHourRow = {
	comName: string;
	imageUrl: string | null;
	/** 24 counts, midnight first. */
	hourCounts: number[];
	totalDetections: number;
	/** The station had never recorded this species before the window opened. */
	isNew: boolean;
	/** Back after missing the period before this window. */
	isReturned: boolean;
	/** Heard only a handful of times ever at this station. */
	isRare: boolean;
	returnedUnit: ReturnedUnit;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// The heat map never scrolls sideways, each species is always one row -- name
// and count, then its 24 hours beside them -- and the hour squares never
// shrink: 24 fixed 1.75rem columns, each holding a square 1.5rem tile.
//
// So the names are what give way. They soak up whatever the hours leave and
// truncate to fit, down to about 8rem. A card too narrow for that beside the
// full 42rem of hours (under 56rem -- a phone, or a smaller laptop once the
// sidebar takes its share) drops the hours entirely, and the names and counts
// alone carry the ranking. Measured against the card, not the viewport, since
// the sidebar eats a varying share of the screen.
//
// Per-row flex rather than two side-by-side panels: every row shares the one
// card width, so the name and hour columns still line up down the list.
const ROW_LAYOUT = "flex items-center";

const LABEL_LAYOUT =
	"grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 @min-[56rem]/card:pr-6";

const HOURS_LAYOUT = "hidden flex-none @min-[56rem]/card:block";

const HOUR_GRID_COLUMNS = "repeat(24, 1.75rem)";

// An hour with no detections: a whisper of moss rather than an outlined box,
// so the columns still read but a quiet bird's row doesn't become a line of
// empty frames. Kept well under the 15% of the lightest heat level, so an
// empty hour never passes for a quiet one.
const EMPTY_CELL_COLOR =
	"color-mix(in oklab, var(--moss) 4%, var(--paper-raised))";

// Ink for the count sitting inside each cell, indexed the same way as
// HEAT_COLORS. The first four grounds are pale enough to take dark text; the
// busiest one is 70% moss, where only paper reads.
const HEAT_TEXT_COLORS = [
	"var(--muted-foreground)",
	"var(--foreground)",
	"var(--foreground)",
	"var(--foreground)",
	"var(--paper)",
] as const;

function hourTickParts(hour: number): { number: string; meridiem: string } {
	if (hour === 0) return { number: "12", meridiem: "a" };
	if (hour < 12) return { number: String(hour), meridiem: "a" };
	if (hour === 12) return { number: "12", meridiem: "p" };
	return { number: String(hour - 12), meridiem: "p" };
}

/**
 * The species x hour grid on the timeline page. A left panel ranks the species
 * by total detections, name and count; the heatmap to its right scales each
 * row against its own busiest hour, so a quiet species still shows the shape
 * of when it was around rather than flattening against the station's loudest
 * bird.
 *
 * It always fits the card: the hours shrink before they would scroll, and on a
 * phone they drop away. See ROW_LAYOUT.
 */
export function SpeciesByHourCard({
	rows,
	newLabel = null,
	emptyMessage,
	summary,
	action,
	className = "",
}: {
	rows: SpeciesHourRow[];
	/** Names the window in the "New" tooltip. Null hides the New pill entirely,
	 * which is what "all time" wants: everything is trivially first heard. */
	newLabel?: string | null;
	emptyMessage: string;
	/** The window's headline figures, set beside the kicker -- the timeline
	 * page's detections/species readout. Omitted by callers that show the card
	 * on its own. */
	summary?: ReactNode;
	/** A control set against the card title, top-right -- the view switcher on
	 * the timeline page. Omitted by callers that show the card on its own. */
	action?: ReactNode;
	className?: string;
}) {
	const isEmpty = rows.length === 0;
	// The count column is fixed to the widest count's character count, so every
	// count right-aligns into the same column.
	const maxTotal = Math.max(...rows.map((row) => row.totalDetections), 0);
	const countWidthCh = maxTotal.toLocaleString().length;

	return (
		<TooltipProvider>
			<section
				aria-label="Species by hour"
				className={`feature-card @container/card rounded-md p-4 ${className}`}
			>
				<div
					className={`flex items-center justify-between gap-3 max-[400px]:flex-wrap max-[400px]:gap-y-2 ${isEmpty && !action ? "" : "mb-4"}`}
				>
					{/* "Activity" -- identical to the grid view's kicker -- so the summary
					    beside it sits at the same x in both bodies and doesn't jump when
					    the view toggle swaps one card for the other. Not "Species": the
					    summary already says "N species" right beside it. The masthead
					    subtitle carries the by-hour vs. how-often distinction. */}
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

				{isEmpty ? (
					<EmptyNote>{emptyMessage}</EmptyNote>
				) : (
					// p-1/-m-1 give the row links' focus ring room against the edge.
					<div className="-m-1 p-1">
						{/* The header: the count column's label, set exactly like the hour
						    numbers, beside the hour ticks. */}
						<div className={`${ROW_LAYOUT} mb-2`}>
							<div className={`h-4 ${LABEL_LAYOUT}`}>
								<span />
								<span className="text-right font-semibold text-[10px] text-foreground leading-none">
									Total
								</span>
							</div>
							<div className={HOURS_LAYOUT}>
								<div
									className="grid h-4 items-center"
									style={{ gridTemplateColumns: HOUR_GRID_COLUMNS }}
								>
									{HOURS.map((hour) => (
										<HourTick key={`tick-${hour}`} hour={hour} />
									))}
								</div>
							</div>
						</div>

						{/* Hairlines run between rows only, name to the card's far edge:
						    the first bird sits right under the header with no rule. */}
						<div className="[&>*:first-child]:border-t-0">
							{rows.map((row) => (
								<SpeciesHourRowView
									key={row.comName}
									row={row}
									countWidthCh={countWidthCh}
									newLabel={newLabel}
								/>
							))}
						</div>
					</div>
				)}
			</section>
		</TooltipProvider>
	);
}

/**
 * One hour's tick: its number, with a small a/p.
 */
function HourTick({ hour }: { hour: number }) {
	const { number, meridiem } = hourTickParts(hour);
	return (
		<div className="flex items-baseline justify-center gap-px leading-none">
			<span className="font-semibold text-[10px] text-foreground">
				{number}
			</span>
			<span className="text-[7px] text-muted-foreground">{meridiem}</span>
		</div>
	);
}

/**
 * One species: bird, name and its detection count for the window, then its
 * hours beside it.
 */
function SpeciesHourRowView({
	row,
	countWidthCh,
	newLabel,
}: {
	row: SpeciesHourRow;
	countWidthCh: number;
	newLabel: string | null;
}) {
	return (
		<div className={`${ROW_LAYOUT} border-[var(--line)] border-t`}>
			<Link
				to="/species/$comName"
				params={{ comName: comNameToSlug(row.comName) }}
				className={`group h-8 no-underline ${LABEL_LAYOUT}`}
			>
				<div className="flex min-w-0 items-center gap-2">
					<div className="flex size-6 shrink-0 items-center justify-center">
						{row.imageUrl ? (
							<img
								src={row.imageUrl}
								alt={row.comName}
								className="max-h-full max-w-full object-contain"
								loading="lazy"
							/>
						) : (
							<Bird className="size-3.5 text-muted-foreground" />
						)}
					</div>
					<div className="min-w-0 truncate font-semibold text-sm group-hover:underline">
						{row.comName}
					</div>
					<SpeciesFlagPills
						isNew={row.isNew}
						isReturned={row.isReturned}
						isRare={row.isRare}
						returnedUnit={row.returnedUnit}
						newLabel={newLabel}
					/>
				</div>

				{/* Right-aligned into a column fixed to the widest count, so the digits
				    stack in a straight line down the list. */}
				<span
					className="count-figure text-right"
					style={{ width: `${countWidthCh}ch` }}
				>
					{row.totalDetections.toLocaleString()}
				</span>
			</Link>

			<div className={HOURS_LAYOUT}>
				<HeatRow row={row} />
			</div>
		</div>
	);
}

/**
 * The row's 24 cells, each scaled against this row's own busiest hour so the
 * shape of the day reads regardless of the bird's overall volume.
 */
function HeatRow({ row }: { row: SpeciesHourRow }) {
	const rowMax = Math.max(...row.hourCounts, 0);

	return (
		<div
			className="grid items-center"
			style={{ gridTemplateColumns: HOUR_GRID_COLUMNS }}
		>
			{/* Driven by the hour list rather than the counts, so each cell is keyed
			    by the hour it stands for instead of its position in the array. */}
			{HOURS.map((hour) => {
				const count = row.hourCounts[hour] ?? 0;
				const level = heatLevel(count, rowMax);
				return (
					<div
						key={`hour-${hour}`}
						role="img"
						aria-label={`${row.comName} — ${hourLabel(hour)}: ${count} detections`}
						className="tabular-data mx-0.5 my-1 flex h-6 items-center justify-center overflow-hidden rounded-[3px] text-[10px] leading-none"
						style={{
							backgroundColor:
								count > 0 ? HEAT_COLORS[level] : EMPTY_CELL_COLOR,
							color: HEAT_TEXT_COLORS[level],
						}}
					>
						{/* A zero reads as an empty cell: printing the digit 24 times a
						    row would bury the counts that matter under noise. */}
						{count > 0 ? count.toLocaleString() : null}
					</div>
				);
			})}
		</div>
	);
}
