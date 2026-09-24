import { Link } from "@tanstack/react-router";
import { Bird, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyNote } from "~/components/empty-state.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip.tsx";
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
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// The left panel is two tracks -- name, count. There's no bar: the heatmap
// already shows how much each bird was heard. On mobile (heatmap hidden) the
// name takes the row and the count sits at its right edge. From md up the name
// column soaks up the card's spare width, so the hours -- which never stretch
// -- always run to the card's right edge, with each count sitting right beside
// its row of hours. Its 12rem floor fits most names (the longest, like
// "Black-capped Chickadee", truncate), and leaves slack for the count column,
// which widens with the window's scale -- a year's totals run to six
// characters -- to take from the names instead of pushing the hours out of
// the card.
const LABEL_GRID_COLUMNS =
	"grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(12rem,1fr)_auto]";

// Tallest bar in the all-species totals row, in px: a tile's height, so the
// busiest hour's bar stands exactly as tall as a heatmap cell.
const TOTAL_BAR_MAX_PX = 24;

// The hour columns are a fixed 1.75rem wide so each cell stays square (its
// 1.5rem tile plus the 0.125rem margin on either side) no matter how wide the
// card gets -- the grid never stretches the tiles into rectangles, and it
// scrolls once the viewport can't afford the full 24 columns.
const HOUR_GRID_COLUMNS = "repeat(24, 1.75rem)";

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

const HEADER_HEIGHT = "mb-2 h-4";
const ROW_HEIGHT = "h-8";
// The totals row is taller than a species row: its bars grow up from the
// baseline with their count printed above, and both need to fit.
const TOTALS_ROW_HEIGHT = "h-12";
// A firmer rule than the hairline between species, marking the totals row as
// a sum of the rows above rather than one more bird.
const TOTALS_RULE =
	"border-t border-[color-mix(in_oklab,var(--moss)_35%,transparent)]";

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
 * bird. A totals row closes both panels: every species summed, per hour.
 *
 * Nothing stretches. The hour columns keep their fixed width at any card
 * size, so a card wider than its content leaves the spare width to the right
 * of the grid; the timeline page shrinks the card to fit on its widest
 * screens and sets its Highlights card beside it. The heatmap is hidden on
 * mobile, where the names and counts alone carry the ranking.
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
	/** Names the window in the "New" tooltip. Null hides the badge entirely,
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
	// Every species summed, hour by hour, for the totals row.
	const hourTotals = HOURS.map((hour) =>
		rows.reduce((sum, row) => sum + (row.hourCounts[hour] ?? 0), 0),
	);
	const grandTotal = rows.reduce((sum, row) => sum + row.totalDetections, 0);
	// The count column is fixed to the widest number's character count -- the
	// grand total, which no single row can exceed -- so every count, the total
	// included, right-aligns into the same column.
	const countWidthCh = grandTotal.toLocaleString().length;

	return (
		<TooltipProvider>
			<section
				aria-label="Species by hour"
				className={`feature-card rounded-md p-4 ${className}`}
			>
				<div
					className={`flex items-center justify-between gap-3 ${isEmpty && !action ? "" : "mb-4"}`}
				>
					{/* "Activity" -- identical to the grid view's kicker -- so the summary
					    beside it sits at the same x in both bodies and doesn't jump when
					    the view toggle swaps one card for the other. Not "Species": the
					    summary already says "N species" right beside it. The masthead
					    subtitle carries the by-hour vs. how-often distinction. */}
					<div className="flex min-w-0 items-center gap-3">
						<div className="island-kicker shrink-0">Activity</div>
						{summary}
					</div>
					{/* The switcher is taller than the kicker line; pulled out of the row's
					    height so the kicker sits at the card's top padding, level with
					    every other card's title, rather than centred lower against it. */}
					{action ? <div className="-my-1.5 shrink-0">{action}</div> : null}
				</div>

				{isEmpty ? (
					<EmptyNote>{emptyMessage}</EmptyNote>
				) : (
					<div className="flex gap-6">
						{/* LEFT: bird, name and count. Takes whatever width the hours leave,
						    down to its min-content -- the name column's 12rem floor plus
						    the counts, with longer names truncating -- and only past that
						    does the heatmap give way and scroll. Not max-content: that is
						    the longest name in full, which would push the hours out of the
						    card before any name had truncated. p-1/-m-1 give the row
						    links' focus ring room against the edge. */}
						<div className="-m-1 min-w-0 flex-1 p-1 md:min-w-min">
							{/* An empty spacer the height of the heatmap's hour-tick header,
							    so the first bar row lines up with the first heatmap row. The
							    "Detections" caption that sat here is gone -- the card's
							    summary already names the detection count. */}
							<div className={HEADER_HEIGHT} />

							{rows.map((row) => (
								<LabelRow
									key={row.comName}
									row={row}
									countWidthCh={countWidthCh}
									newLabel={newLabel}
								/>
							))}

							<div
								className={`grid items-center gap-4 ${LABEL_GRID_COLUMNS} ${TOTALS_ROW_HEIGHT} ${TOTALS_RULE}`}
							>
								<div className="min-w-0 truncate text-muted-foreground text-xs italic">
									All species
								</div>
								<span
									className="count-figure text-right"
									style={{ width: `${countWidthCh}ch` }}
								>
									{grandTotal.toLocaleString()}
								</span>
							</div>
						</div>

						{/* MIDDLE: the hour heatmap at its natural width. Its columns keep
						    their fixed square size -- never stretched -- so on a tight card
						    it scrolls rather than squeezing; on mobile it drops away. */}
						<div className="-m-1 hidden min-w-0 overflow-x-auto p-1 md:block">
							<div className="w-max">
								<div
									className={`grid items-center ${HEADER_HEIGHT}`}
									style={{ gridTemplateColumns: HOUR_GRID_COLUMNS }}
								>
									{HOURS.map((hour) => {
										const { number, meridiem } = hourTickParts(hour);
										return (
											<div
												key={`tick-${hour}`}
												className="flex items-baseline justify-center gap-px leading-none"
											>
												<span className="font-semibold text-[10px] text-foreground">
													{number}
												</span>
												<span className="text-[7px] text-muted-foreground">
													{meridiem}
												</span>
											</div>
										);
									})}
								</div>

								{rows.map((row) => (
									<HeatRow key={row.comName} row={row} />
								))}

								<TotalsRow hourTotals={hourTotals} />
							</div>
						</div>
					</div>
				)}
			</section>
		</TooltipProvider>
	);
}

/**
 * Marks a species the station had never recorded before the window opened, so
 * an arrival stands out from the residents it's stacked against. Matches the
 * day page's "First ever" badge, trimmed to fit a 2rem grid row.
 */
function NewBadge({ newLabel }: { newLabel: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] leading-none"
					style={{
						backgroundColor:
							"color-mix(in oklab, var(--sand) 22%, var(--paper-raised))",
						color: "var(--bark)",
					}}
				>
					<Sparkles className="size-2.5" />
					New
				</span>
			</TooltipTrigger>
			<TooltipContent>First recorded here in {newLabel}</TooltipContent>
		</Tooltip>
	);
}

/**
 * The left panel's row: bird, name and its detection count for the window.
 */
function LabelRow({
	row,
	countWidthCh,
	newLabel,
}: {
	row: SpeciesHourRow;
	countWidthCh: number;
	newLabel: string | null;
}) {
	return (
		<Link
			to="/species/$comName"
			params={{ comName: comNameToSlug(row.comName) }}
			className={`group grid items-center gap-4 border-[var(--line)] border-t no-underline ${LABEL_GRID_COLUMNS} ${ROW_HEIGHT}`}
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
				{row.isNew && newLabel && <NewBadge newLabel={newLabel} />}
			</div>

			{/* Right-aligned into a column fixed to the widest count, so the digits
			    stack in a straight line down the panel. */}
			<span
				className="count-figure text-right"
				style={{ width: `${countWidthCh}ch` }}
			>
				{row.totalDetections.toLocaleString()}
			</span>
		</Link>
	);
}

/**
 * The heatmap panel's row: 24 cells, each scaled against this row's own busiest
 * hour so the shape of the day reads regardless of the bird's overall volume.
 */
function HeatRow({ row }: { row: SpeciesHourRow }) {
	const rowMax = Math.max(...row.hourCounts, 0);

	return (
		<div
			className={`grid items-center border-[var(--line)] border-t ${ROW_HEIGHT}`}
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
						className="tabular-data mx-0.5 my-1 flex h-6 items-center justify-center overflow-hidden rounded-[3px] border border-[var(--line)] text-[10px] leading-none"
						style={{
							backgroundColor: HEAT_COLORS[level],
							color: HEAT_TEXT_COLORS[level],
						}}
					>
						{/* A zero reads as an empty cell: printing the digit 24 times a
						    row would bury the counts that matter under noise. */}
						{count > 0 ? count.toLocaleString() : ""}
					</div>
				);
			})}
		</div>
	);
}

/**
 * The heatmap's closing row: every species summed per hour, as a bar standing
 * in each hour's column with its count above. Scaled against the busiest hour
 * across all species -- unlike the rows above, which each scale to themselves
 * -- so this is the one row that shows when the station as a whole was busiest.
 */
function TotalsRow({ hourTotals }: { hourTotals: number[] }) {
	const maxTotal = Math.max(...hourTotals, 0);

	return (
		<div
			className={`grid items-end pb-1 ${TOTALS_ROW_HEIGHT} ${TOTALS_RULE}`}
			style={{ gridTemplateColumns: HOUR_GRID_COLUMNS }}
		>
			{HOURS.map((hour) => {
				const total = hourTotals[hour] ?? 0;
				return (
					<div
						key={`total-${hour}`}
						role="img"
						aria-label={`All species — ${hourLabel(hour)}: ${total} detections`}
						className="mx-0.5 flex flex-col items-center justify-end gap-0.5"
					>
						{total > 0 ? (
							<>
								<span className="tabular-data text-[10px] text-muted-foreground leading-none">
									{total.toLocaleString()}
								</span>
								{/* A non-zero hour always shows a sliver, so a quiet one doesn't
								    vanish next to the busiest. */}
								<div
									className="w-full rounded-t-[2px]"
									style={{
										height: `${Math.max((total / maxTotal) * TOTAL_BAR_MAX_PX, 2)}px`,
										backgroundColor: HEAT_COLORS[3],
									}}
								/>
							</>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
