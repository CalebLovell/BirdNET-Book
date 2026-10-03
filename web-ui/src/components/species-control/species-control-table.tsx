import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { EmptyNote } from "~/components/empty-state.tsx";
import { IndexDot, TABLE_INDEX_FLOOR } from "~/components/index-dot.tsx";
import { Badge } from "~/components/ui/badge.tsx";
import { PageStepper } from "~/components/ui/page-stepper.tsx";
import {
	SELECT_COLUMN_WIDTH,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table.tsx";
import { SortButton, SortMenu } from "~/components/ui/table-sort.tsx";
import type {
	SpeciesControlRow,
	SpeciesStatus,
} from "~/lib/species-control-data.ts";
import {
	SPECIES_CONTROL_SORTS,
	type SpeciesControlSort,
	type SpeciesControlSortDirection,
} from "~/lib/species-control-workspace.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import { cn } from "~/lib/utils.ts";

export type SpeciesControlViewRow = SpeciesControlRow & {
	status: SpeciesStatus;
};

export type SpeciesSortKey = SpeciesControlSort;

export const SPECIES_CONTROL_PAGE_SIZE = 50;

const STATUS_RANK: Record<SpeciesStatus, number> = {
	automatic: 0,
	custom: 1,
	always: 2,
	never: 3,
};

export function sortSpeciesControlRows(
	rows: SpeciesControlViewRow[],
	sort: SpeciesSortKey,
	direction: SpeciesControlSortDirection,
): SpeciesControlViewRow[] {
	const multiplier = direction === "asc" ? 1 : -1;
	return [...rows].sort((left, right) => {
		if (sort === "count") {
			return (
				multiplier *
				(left.history.detections - right.history.detections ||
					left.comName.localeCompare(right.comName))
			);
		}
		if (sort === "status") {
			return (
				multiplier *
				(STATUS_RANK[left.status] - STATUS_RANK[right.status] ||
					left.comName.localeCompare(right.comName))
			);
		}
		const comparison =
			sort === "scientific"
				? left.sciName.localeCompare(right.sciName)
				: left.comName.localeCompare(right.comName);
		return multiplier * comparison;
	});
}

// The detections table's layout, column for column -- see the notes there. One
// grid at every width, keyed to the card rather than the viewport: narrowest, a
// row is the checkbox, its number, the species and its status, and the headings
// give way to one sort menu. From 36rem the count joins and the headings come
// back; from 54rem the scientific name joins too. Only the ends are pinned --
// the shared selection column, and Status, held to its widest badge -- and the
// columns between share the rest, never narrower than what they hold.
//
// The rows run out to both of the card's edges, so the first and last columns
// take the card's padding as their inset, and every cell keeps half the page
// gap either side so neighbours sit a full gap apart.
const FIRST_COLUMN_CLASSES = "pl-(--page-gap)";
const CELL_GAP = "px-[calc(var(--page-gap)/2)]";
const STATUS_EDGE = "pr-(--page-gap)";
// Hidden, a cell leaves the grid's flow, and the grid's own column list (on the
// <Table>) drops its track.
const COLUMN_VISIBILITY: Record<string, string> = {
	scientific: "hidden @min-[54rem]:block",
	count: "hidden @min-[36rem]:block",
};
const GRID_ROW = "col-span-full grid grid-cols-subgrid items-center";
const COLUMN_GRID = {
	"--cols-sm": "max-content max-content minmax(0, 1fr) max-content",
	"--cols-md":
		"max-content max-content minmax(0, 1fr) minmax(max-content, 1fr) max-content",
	"--cols-lg":
		"max-content max-content repeat(3, minmax(max-content, 1fr)) max-content",
} as CSSProperties;

const SORT_LABELS: Record<SpeciesSortKey, string> = {
	species: "Species",
	scientific: "Scientific name",
	count: "Count",
	status: "Status",
};

// Automatic is the state of ~5,900 of the 6,000 rows, so its badge stays muted
// and the three statuses a person chose are the ones that stand out.
const STATUS_PRESENTATION: Record<
	SpeciesStatus,
	{ label: string; className: string }
> = {
	automatic: {
		label: "Automatic",
		className: "bg-muted text-muted-foreground",
	},
	custom: {
		label: "Custom",
		className:
			"bg-[color-mix(in_oklab,var(--sage)_35%,var(--paper-raised))] text-[var(--moss)]",
	},
	always: {
		label: "Always detect",
		className:
			"bg-[color-mix(in_oklab,var(--sand)_30%,var(--paper-raised))] text-[var(--bark)]",
	},
	never: {
		label: "Never detect",
		className:
			"bg-[color-mix(in_oklab,var(--clay)_15%,var(--paper-raised))] text-destructive",
	},
};

export function SpeciesControlTable({
	rows,
	page,
	pageCount,
	selected,
	sort,
	direction,
	onSortChange,
	onSelectedChange,
	onPageChange,
	actions,
}: {
	rows: SpeciesControlViewRow[];
	page: number;
	pageCount: number;
	selected: Set<string>;
	sort: SpeciesSortKey;
	direction: SpeciesControlSortDirection;
	onSortChange: (key: SpeciesSortKey) => void;
	onSelectedChange: (next: Set<string>) => void;
	onPageChange: (page: number) => void;
	/** Held at the footer's left, opposite the pager -- where the detections
	 *  table keeps its selection bar. */
	actions?: ReactNode;
}) {
	if (rows.length === 0) {
		return <EmptyNote>No installed species match that search.</EmptyNote>;
	}

	const allSelected = rows.every((row) => selected.has(row.sciName));
	// Row numbers count on across pages rather than restarting at 1, as on the
	// detections table.
	const firstIndex = (page - 1) * SPECIES_CONTROL_PAGE_SIZE + 1;
	const lastIndex = firstIndex + rows.length - 1;

	function toggle(sciName: string, checked: boolean) {
		const next = new Set(selected);
		checked ? next.add(sciName) : next.delete(sciName);
		onSelectedChange(next);
	}

	function sortHeading(key: SpeciesSortKey, className?: string) {
		const active = sort === key;
		return (
			<TableHead
				role="columnheader"
				aria-sort={
					active ? (direction === "asc" ? "ascending" : "descending") : "none"
				}
				className={cn(
					"font-semibold",
					CELL_GAP,
					COLUMN_VISIBILITY[key] ?? "@min-[36rem]:block hidden",
					className,
				)}
			>
				<SortButton
					label={SORT_LABELS[key]}
					sort={key}
					activeSort={sort}
					direction={direction}
					onSort={onSortChange}
				/>
			</TableHead>
		);
	}

	return (
		// A column: the scrollport takes the leftover height so the rows are the
		// only thing that scrolls, and the pager below stays put.
		<div className="@container flex min-h-0 flex-1 flex-col">
			{/* Laid out as a grid with the header, body and every row as subgrids of
			    its columns, so the header can sit above the rows' scrollport and
			    still share their widths -- the detections table's arrangement. */}
			<Table
				role="table"
				className="grid h-full min-w-min @min-[36rem]:grid-cols-(--cols-md) @min-[54rem]:grid-cols-(--cols-lg) grid-cols-(--cols-sm) grid-rows-[auto_minmax(0,1fr)]"
				style={COLUMN_GRID}
				containerClassName="-ml-(--page-gap) -mr-(--card-edge) -mt-(--page-gap) min-h-0 flex-1 overflow-x-auto overflow-y-hidden pr-0 pl-0"
			>
				{/* The detections header band, run up to the card's top edge. */}
				<TableHeader
					role="rowgroup"
					className="col-span-full grid grid-cols-subgrid overflow-hidden border-b bg-[var(--surface-strong)] [scrollbar-gutter:stable] [&_th]:h-auto @min-[36rem]:[&_th]:pt-4 [&_th]:pt-[calc(var(--page-gap)/2+1px)] @min-[36rem]:[&_th]:pb-[15px] [&_th]:pb-[calc(var(--page-gap)/2)] [&_th]:leading-none [&_th_button]:leading-none [&_tr]:h-auto [&_tr]:border-none"
				>
					<TableRow role="row" className={GRID_ROW}>
						<TableHead
							role="columnheader"
							className={cn(
								SELECT_COLUMN_WIDTH,
								"w-[calc(var(--page-gap)*1.5+0.875rem)] min-w-[calc(var(--page-gap)*1.5+0.875rem)] font-semibold",
								CELL_GAP,
								FIRST_COLUMN_CLASSES,
							)}
						>
							<input
								aria-label="Select all species on this page"
								checked={allSelected}
								className="block size-3.5 accent-[var(--moss)]"
								type="checkbox"
								onChange={(event) => {
									const next = new Set(selected);
									for (const row of rows)
										event.target.checked
											? next.add(row.sciName)
											: next.delete(row.sciName);
									onSelectedChange(next);
								}}
							/>
						</TableHead>
						<TableHead
							role="columnheader"
							className={cn(
								"@min-[36rem]:block hidden text-center font-semibold",
								CELL_GAP,
							)}
						>
							<span aria-hidden="true">#</span>
							<span className="sr-only">Row</span>
						</TableHead>
						{sortHeading("species")}
						{sortHeading("scientific")}
						{sortHeading("count", "text-right")}
						{sortHeading(
							"status",
							cn(
								STATUS_EDGE,
								"text-right @min-[36rem]:w-36 @min-[36rem]:min-w-36",
							),
						)}
						{/* Narrow, the headings give way to one sort menu spanning the
						    columns after the checkbox. */}
						<TableHead
							role="columnheader"
							className={cn("col-[2/-1] @min-[36rem]:hidden", STATUS_EDGE)}
						>
							<SortMenu
								label="Sort species by"
								sorts={SPECIES_CONTROL_SORTS}
								labels={SORT_LABELS}
								sort={sort}
								direction={direction}
								onSort={onSortChange}
								onFlip={() => onSortChange(sort)}
							/>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody
					role="rowgroup"
					data-scroll-reset=""
					className="col-span-full grid min-h-0 grid-cols-subgrid content-start overflow-y-auto [scrollbar-gutter:stable]"
				>
					{rows.map((row, index) => {
						const isSelected = selected.has(row.sciName);
						const presentation = STATUS_PRESENTATION[row.status];
						return (
							<TableRow
								key={row.sciName}
								role="row"
								data-state={isSelected && "selected"}
								// Plain card-white rows split by the shared row's hairline, as
								// on the detections table.
								className={cn(
									GRID_ROW,
									isSelected ? "bg-[var(--row-selected)]" : "bg-card",
								)}
							>
								<TableCell
									role="cell"
									className={cn(CELL_GAP, FIRST_COLUMN_CLASSES)}
								>
									<input
										aria-label={`Select ${row.comName}`}
										checked={isSelected}
										className="block size-3.5 accent-[var(--moss)]"
										type="checkbox"
										onChange={(event) =>
											toggle(row.sciName, event.target.checked)
										}
									/>
								</TableCell>
								<TableCell role="cell" className={cn(CELL_GAP, "text-center")}>
									<IndexDot
										index={firstIndex + index}
										widest={Math.max(lastIndex, TABLE_INDEX_FLOOR)}
									/>
								</TableCell>
								<TableCell
									role="cell"
									className={cn(CELL_GAP, "min-w-0 truncate")}
								>
									<Link
										to="/birds/$comName"
										params={{ comName: comNameToSlug(row.comName) }}
										className="font-medium no-underline hover:underline"
									>
										{row.comName}
									</Link>
								</TableCell>
								<TableCell
									role="cell"
									className={cn(CELL_GAP, COLUMN_VISIBILITY.scientific)}
								>
									<em className="text-[var(--bark)]">{row.sciName}</em>
								</TableCell>
								{/* Most of a 6,000-row catalogue has never been heard, so a
								    zero is muted rather than competing with real counts. */}
								<TableCell
									role="cell"
									className={cn(
										CELL_GAP,
										COLUMN_VISIBILITY.count,
										"tabular-data text-right",
										!row.history.detections && "text-muted-foreground",
									)}
								>
									{row.history.detections.toLocaleString()}
								</TableCell>
								<TableCell
									role="cell"
									className={cn(CELL_GAP, STATUS_EDGE, "text-right")}
								>
									<Badge variant="ghost" className={presentation.className}>
										{presentation.label}
									</Badge>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			{/* The detections footer: a band the header's height, its rule run out
			    through the card's side padding, with the selection's actions at the
			    left and the pager held right. The card drops its bottom padding for
			    it. */}
			<div className="-mr-(--card-edge) -ml-(--page-gap) flex shrink-0 flex-wrap items-center gap-2 border-t pt-[calc(var(--page-gap)/2)] pr-(--card-edge) pb-[calc(var(--page-gap)/2+1px)] pl-(--page-gap) text-sm">
				{actions}
				<PageStepper
					className="ml-auto"
					label="Species pages"
					page={page}
					pageCount={pageCount}
					onPageChange={onPageChange}
				/>
			</div>
		</div>
	);
}
