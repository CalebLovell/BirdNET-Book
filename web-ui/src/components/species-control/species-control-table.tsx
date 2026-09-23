import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "~/components/ui/badge.tsx";
import { Button } from "~/components/ui/button.tsx";
import {
	SELECT_COLUMN_WIDTH,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table.tsx";
import type {
	SpeciesControlRow,
	SpeciesStatus,
} from "~/lib/species-control-data.ts";
import type {
	SpeciesControlSort,
	SpeciesControlSortDirection,
} from "~/lib/species-control-workspace.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";

export type SpeciesControlViewRow = SpeciesControlRow & {
	status: SpeciesStatus;
};

export type SpeciesSortKey = SpeciesControlSort;

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

// Same scheme as the detections table -- see the note there. Only the two ends
// are pinned: the shared selection column, and Status, held to the width of its
// widest badge. The columns between divide up the rest of the table under auto
// layout, in proportion to what they hold.
const HEADER_CLASSES: Record<string, string> = {
	select: SELECT_COLUMN_WIDTH,
	status: "w-36 min-w-36",
};

// `spine` is the list's own device: a 2px edge down the left of each row in the
// status's colour. Automatic gets none on purpose -- it is the state of ~5,900
// of the 6,000 rows, so marking it would colour the whole page and say nothing.
// Marking only the three statuses a person chose turns a scroll through the
// catalogue into a scan for your own edits, which is what this page is for. The
// badge still carries the words; the spine is not doing the labelling.
const STATUS_PRESENTATION: Record<
	SpeciesStatus,
	{ label: string; className: string; spine: string }
> = {
	automatic: {
		label: "Automatic",
		className: "bg-muted text-muted-foreground",
		spine: "border-transparent",
	},
	custom: {
		label: "Custom",
		className:
			"bg-[color-mix(in_oklab,var(--sage)_35%,var(--paper-raised))] text-[var(--moss)]",
		spine: "border-[color-mix(in_oklab,var(--sage)_75%,var(--moss))]",
	},
	always: {
		label: "Always detect",
		className:
			"bg-[color-mix(in_oklab,var(--sand)_30%,var(--paper-raised))] text-[var(--bark)]",
		spine: "border-[var(--sand)]",
	},
	never: {
		label: "Never detect",
		className:
			"bg-[color-mix(in_oklab,var(--clay)_15%,var(--paper-raised))] text-destructive",
		spine: "border-[var(--clay)]",
	},
};

function SortHeader({
	label,
	sortKey,
	sort,
	direction,
	onSortChange,
	align = "left",
	className = "",
}: {
	label: string;
	sortKey: SpeciesSortKey;
	sort: SpeciesSortKey;
	direction: SpeciesControlSortDirection;
	onSortChange: (key: SpeciesSortKey) => void;
	align?: "left" | "right";
	className?: string;
}) {
	const active = sort === sortKey;
	const ascending = direction === "asc";
	const Icon = active && ascending ? ArrowUp : ArrowDown;
	return (
		<TableHead
			aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
			className={`${align === "right" ? "text-right" : ""} font-semibold ${className}`}
		>
			<button
				type="button"
				className="inline-flex items-center gap-1 hover:text-foreground"
				onClick={() => onSortChange(sortKey)}
			>
				{label}
				<Icon
					className={active ? "size-3.5" : "size-3.5 opacity-35"}
					aria-hidden="true"
				/>
			</button>
		</TableHead>
	);
}

export function SpeciesControlTable({
	rows,
	page,
	pageCount,
	total,
	selected,
	sort,
	direction,
	onSortChange,
	onSelectedChange,
	onPageChange,
}: {
	rows: SpeciesControlViewRow[];
	page: number;
	pageCount: number;
	total: number;
	selected: Set<string>;
	sort: SpeciesSortKey;
	direction: SpeciesControlSortDirection;
	onSortChange: (key: SpeciesSortKey) => void;
	onSelectedChange: (next: Set<string>) => void;
	onPageChange: (page: number) => void;
}) {
	const allSelected =
		rows.length > 0 && rows.every((row) => selected.has(row.sciName));
	const rangeStart = total ? (page - 1) * 50 + 1 : 0;
	const rangeEnd = Math.min(page * 50, total);
	return (
		// No gap between the rows and the pager: the footer reads as the edge of
		// the scrollport rather than floating above it.
		<div className="@container flex min-h-0 flex-1 flex-col">
			{/* `lg:` and not a container query, here and on the two views below --
			    the same reasoning as the detections table, and the same width, so
			    the two pages now change over together as well. */}
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-3 lg:hidden">
				<label className="flex items-center gap-2 text-muted-foreground text-xs">
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
					Select page
				</label>
				<div className="flex items-center gap-1">
					<label className="flex items-center gap-2 text-muted-foreground text-xs">
						<span>Sort</span>
						<select
							aria-label="Sort species by"
							className="h-8 rounded-md border border-input bg-card px-2 text-foreground text-sm hover:bg-accent focus-visible:border-[var(--hover-line)]"
							value={sort}
							onChange={(event) =>
								onSortChange(event.target.value as SpeciesSortKey)
							}
						>
							<option value="species">Species</option>
							<option value="scientific">Scientific name</option>
							<option value="count">Count</option>
							<option value="status">Status</option>
						</select>
					</label>
					<Button
						aria-label={`Sort species ${direction === "asc" ? "descending" : "ascending"}`}
						title={direction === "asc" ? "Ascending" : "Descending"}
						icon={direction === "asc" ? ArrowUp : ArrowDown}
						size="icon"
						variant="outline"
						onClick={() => onSortChange(sort)}
					/>
				</div>
			</div>

			{/* No hairlines: the zebra fill the detections list uses groups each
			    row's two lines, and a rule every 58px down a 6,000-row catalogue was
			    the loudest thing on the page. */}
			<ul
				data-slot="species-control-list"
				className="min-h-0 flex-1 overflow-y-auto lg:hidden"
			>
				{/* The detections row's sibling: same checkbox, same name-over-binomial
				    block, same right edge. What differs is what each page is for --
				    there the moment and the clip, here the status, carried by the
				    spine on the left and named by the badge on the right.

				    No thumbnail, though the detections list has one: 27 illustrations
				    against 6,000 species would be a column of identical fallback
				    glyphs, which is worse than no column. */}
				{rows.map((row) => {
					const isSelected = selected.has(row.sciName);
					const presentation = STATUS_PRESENTATION[row.status];
					return (
						<li
							key={row.sciName}
							data-state={isSelected && "selected"}
							// Conditional rather than a `data-` variant beside `odd:`: both
							// are one class deep, so which won would come down to Tailwind's
							// ordering rather than intent.
							className={`flex items-center gap-3 rounded-md border-l-2 py-1.5 pr-2 pl-2.5 ${presentation.spine} ${
								isSelected
									? "bg-[var(--row-selected)]"
									: "odd:bg-[var(--meadow)]"
							}`}
						>
							<input
								aria-label={`Select ${row.comName}`}
								checked={isSelected}
								className="block size-3.5 shrink-0 accent-[var(--moss)]"
								type="checkbox"
								onChange={(event) => {
									const next = new Set(selected);
									event.target.checked
										? next.add(row.sciName)
										: next.delete(row.sciName);
									onSelectedChange(next);
								}}
							/>
							{/* One wrapping line rather than two fixed ones, the same as the
							    detections list: with the room, the name and the binomial sit
							    side by side and the row is a single 36px line; without it the
							    binomial drops beneath the name. No breakpoint -- the content
							    wraps when it stops fitting.

							    `min-w-0` keeps a long name inside the block rather than
							    pushing the badge off the edge. It wraps rather than
							    truncating -- a name clipped mid-word is the one thing a
							    species catalogue cannot afford. */}
							<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
								{/* No `block`: a block-level link fills the row, so its
								    underline and its click target ran the full width with
								    nothing but whitespace under the pointer. */}
								<Link
									to="/species/$comName"
									params={{ comName: comNameToSlug(row.comName) }}
									className="min-w-0 font-medium leading-tight no-underline hover:underline"
								>
									{row.comName}
								</Link>
								{/* The count rides the binomial's line instead of taking a
								    column of its own, and only when there is one: most of the
								    catalogue has never been heard, and 50 zeroes down a page
								    is a column that says nothing. Absence reads correctly --
								    the desktop table still spells the 0 out. */}
								<p className="min-w-0 text-[var(--bark)] text-xs leading-snug">
									<em>{row.sciName}</em>
									{row.history.detections > 0 ? (
										<span className="text-muted-foreground">
											{" · "}
											<span className="tabular-data">
												{row.history.detections.toLocaleString()}
											</span>{" "}
											detections
										</span>
									) : null}
								</p>
							</div>
							<Badge
								variant="ghost"
								className={`shrink-0 ${presentation.className}`}
							>
								{presentation.label}
							</Badge>
						</li>
					);
				})}
			</ul>

			{/* No `table-fixed` and no min width: auto layout already refuses to go
			    below what the row needs, since nothing in a cell wraps, and the
			    scrollport takes over from there. */}
			<Table containerClassName="hidden min-h-0 flex-1 overflow-y-auto lg:block">
				{/* Sticky per-`th`: with collapsed borders the row's own border stays
				    behind instead of travelling with the pinned header, so the rule is
				    an inset shadow and the base `[&_tr]:border-b` is switched off --
				    together they drew a double line. */}
				<TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-[var(--surface-strong)] [&_th]:shadow-[inset_0_-1px_0_var(--line)] [&_tr]:border-none">
					<TableRow>
						<TableHead
							className={`text-left font-semibold ${HEADER_CLASSES.select}`}
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
						<SortHeader
							label="Species"
							sortKey="species"
							sort={sort}
							direction={direction}
							onSortChange={onSortChange}
							className="pl-0"
						/>
						<SortHeader
							label="Scientific name"
							sortKey="scientific"
							sort={sort}
							direction={direction}
							onSortChange={onSortChange}
							className="pl-1"
						/>
						<SortHeader
							label="Count"
							sortKey="count"
							sort={sort}
							direction={direction}
							onSortChange={onSortChange}
							align="right"
						/>
						<SortHeader
							label="Status"
							sortKey="status"
							sort={sort}
							direction={direction}
							onSortChange={onSortChange}
							align="right"
							className={HEADER_CLASSES.status}
						/>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.sciName}>
							<TableCell className="text-left">
								<input
									aria-label={`Select ${row.comName}`}
									checked={selected.has(row.sciName)}
									className="block size-3.5 accent-[var(--moss)]"
									type="checkbox"
									onChange={(event) => {
										const next = new Set(selected);
										event.target.checked
											? next.add(row.sciName)
											: next.delete(row.sciName);
										onSelectedChange(next);
									}}
								/>
							</TableCell>
							<TableCell className="pl-0">
								<Link
									to="/species/$comName"
									params={{ comName: comNameToSlug(row.comName) }}
									className="font-medium no-underline hover:underline"
								>
									{row.comName}
								</Link>
							</TableCell>
							<TableCell className="pl-1">
								<em className="text-[var(--bark)]">{row.sciName}</em>
							</TableCell>
							{/* Most of a 6,000-row catalogue has never been heard, so a
							    zero is muted rather than competing with real counts. */}
							<TableCell
								className={`tabular-data text-right ${row.history.detections ? "" : "text-muted-foreground"}`}
							>
								{row.history.detections.toLocaleString()}
							</TableCell>
							<TableCell className="text-right">
								<Badge
									variant="ghost"
									className={STATUS_PRESENTATION[row.status].className}
								>
									{STATUS_PRESENTATION[row.status].label}
								</Badge>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{rows.length === 0 ? (
				<p className="shrink-0 py-8 text-center text-muted-foreground text-sm">
					No installed species match that search.
				</p>
			) : null}
			{/* 26rem is where the two halves genuinely stop fitting side by side;
			    `sm` stacked them with most of a row's width still going spare. */}
			<div className="flex shrink-0 @min-[26rem]:flex-row flex-col @min-[26rem]:items-center @min-[26rem]:justify-between gap-3 border-t pt-3 text-sm">
				<span className="tabular-data text-muted-foreground">
					Showing {rangeStart}–{rangeEnd} of {total}
				</span>
				<div className="flex items-center gap-1">
					<Button
						aria-label="Previous page"
						disabled={page <= 1}
						size="icon"
						variant="outline"
						onClick={() => onPageChange(page - 1)}
					>
						<ChevronLeft />
					</Button>
					{/* Exactly the widest string it can hold: both sides top out at
					    `pageCount`'s digit count, `tabular-data` pins each digit to 1ch,
					    and " / " measures ~0.7em. Fixed per page count, so paging never
					    reflows it. */}
					<span
						className="tabular-data text-center text-muted-foreground"
						style={{
							minWidth: `calc(${String(pageCount).length * 2}ch + 0.75em)`,
						}}
					>
						{page} / {pageCount}
					</span>
					<Button
						aria-label="Next page"
						disabled={page >= pageCount}
						size="icon"
						variant="outline"
						onClick={() => onPageChange(page + 1)}
					>
						<ChevronRight />
					</Button>
				</div>
			</div>
		</div>
	);
}
