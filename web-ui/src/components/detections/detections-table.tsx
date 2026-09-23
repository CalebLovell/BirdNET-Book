import { Link } from "@tanstack/react-router";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	type OnChangeFn,
	type RowSelectionState,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { SpeciesThumbnail } from "~/components/species-row.tsx";
import { Button } from "~/components/ui/button.tsx";
import { Input } from "~/components/ui/input.tsx";
import { SearchInput } from "~/components/ui/search-input.tsx";
import {
	SELECT_COLUMN_WIDTH,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table.tsx";
import { audioUrlFor } from "~/lib/audio.ts";
import {
	type DetectionWorkspaceSearch,
	type DetectionWorkspaceSort,
	detectionRowKey,
} from "~/lib/detection-workspace.ts";
import type { DetectionPage, DetectionTableRow } from "~/lib/detections.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";

type DetectionsTableProps = {
	page: DetectionPage;
	search: DetectionWorkspaceSearch;
	onSearchChange: (search: DetectionWorkspaceSearch) => void;
	rowSelection: RowSelectionState;
	onRowSelectionChange: OnChangeFn<RowSelectionState>;
	/**
	 * Whether the station is unlocked. Selection exists only to feed the delete
	 * button, and deleting is gated on the server -- so a locked visitor gets no
	 * checkboxes rather than a column that leads to a refusal.
	 */
	canDelete: boolean;
};

type DetectionsFiltersProps = Pick<
	DetectionsTableProps,
	"search" | "onSearchChange"
> & {
	/**
	 * Right-aligned action rendered at the end of the filter row -- the page's
	 * Delete button, moved here now the table has no header strip of its own to
	 * carry it.
	 */
	actions?: ReactNode;
};

// Every column shows at every width -- none is dropped or restyled per width.
// Below what the row needs the scrollport scrolls sideways instead.
//
// Only the two ends are pinned: the shared selection column, and Recording,
// held to the width of the button it carries so it stays a tidy right edge
// rather than a widening gutter. Everything between them is left to the table's
// auto layout, which hands each column the full width in proportion to what it
// holds -- species and scientific name measure within a few pixels of each
// other, so they land near-equal without being told to.
//
// The pinned widths sit on the header cells rather than a <colgroup> to keep a
// column's sizing next to the header that names it.
// `pr-3` rather than `pr-0`: the body scrolls under a vertical scrollbar pinned
// to the container's right edge, and flush-right the recording button sat hard
// against it. The gap gives the column room to breathe without widening it into
// a gutter -- it eats into the fixed 8rem, it does not add to it.
const HEADER_CLASSES: Record<string, string> = {
	select: SELECT_COLUMN_WIDTH,
	confidence: "text-right",
	audio: "w-32 min-w-32 pr-3 text-right",
};
const CELL_CLASSES: Record<string, string> = {
	audio: "pr-3",
};

function recordedLabel(row: DetectionTableRow): string {
	const date = new Date(`${row.Date}T${row.Time}`);
	if (Number.isNaN(date.valueOf())) return `${row.Date} ${row.Time}`;
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}

// The list splits what the table's one `recordedLabel` string joins: a clock
// time the eye can compare down the column, over the day it belongs to. The
// year only appears when it is not the current one -- on a station's own
// recent detections it is the same digits on every row, and saying it 50 times
// says nothing.
function clockLabel(row: DetectionTableRow): string {
	const date = new Date(`${row.Date}T${row.Time}`);
	if (Number.isNaN(date.valueOf())) return row.Time;
	return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
		date,
	);
}

function dayLabel(row: DetectionTableRow): string {
	const date = new Date(`${row.Date}T${row.Time}`);
	if (Number.isNaN(date.valueOf())) return row.Date;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		...(date.getFullYear() === new Date().getFullYear()
			? {}
			: { year: "numeric" }),
	}).format(date);
}

// `iconOnly` is for the list, where the label is 90px of the row's width
// repeated down the page and the speaker glyph already says it. It takes the
// larger square rather than the matching `xs` one: this is the only real tap
// target in a list row, and a 24px box is under any sane thumb.

function SortButton({
	label,
	sort,
	search,
	onSort,
}: {
	label: string;
	sort: DetectionWorkspaceSort;
	search: DetectionWorkspaceSearch;
	onSort: (sort: DetectionWorkspaceSort) => void;
}) {
	const isActive = search.sort === sort;
	const Icon = isActive && search.direction === "asc" ? ArrowUp : ArrowDown;
	return (
		<button
			type="button"
			className="inline-flex items-center gap-1 hover:text-foreground"
			onClick={() => onSort(sort)}
		>
			{label}
			<Icon className={isActive ? "size-3.5" : "size-3.5 opacity-35"} />
		</button>
	);
}

// Label sits inline with the field to keep the filter row one line tall. The
// clear button is always rendered — disabled and dimmed with no date set — so
// the row never shifts.
function DateFilter({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string | undefined) => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			<label className="text-muted-foreground text-xs" htmlFor={id}>
				{label}
			</label>
			{/* 8rem leaves the 14px date text (72px) clear of the native picker
			    glyph and the gap now set on it in styles.css; at 7.5rem the year ran
			    into the calendar icon. */}
			<Input
				className="!w-32 @min-[38rem]:!w-36"
				id={id}
				type="date"
				value={value}
				onChange={(event) => onChange(event.target.value || undefined)}
			/>
			{/* The station's one button rather than a bare <button>: this was a
			    borderless glyph that read as decoration, and it missed the shared
			    hover, focus-visible ring and disabled treatment. `type` is explicit
			    because a <button> defaults to `submit`. Native buttons are already
			    in the tab order, so no tabIndex belongs here -- adding one would
			    only risk overriding it. */}
			{/* `icon-lg` is the 36px square that matches the field's h-9 exactly --
			    at icon-sm it sat 8px short and read as a different control. `title`
			    gives the pointer a tooltip; the aria-label stays longer because a
			    screen reader hears it out of context. */}
			<Button
				type="button"
				aria-label={`Clear ${label.toLowerCase()} date`}
				title="Clear"
				disabled={!value}
				icon={X}
				size="icon-lg"
				variant="outline"
				onClick={() => onChange(undefined)}
			/>
		</div>
	);
}

export function DetectionsFilters({
	search,
	onSearchChange,
	actions,
}: DetectionsFiltersProps) {
	function updateSearch(change: Partial<DetectionWorkspaceSearch>) {
		onSearchChange({ ...search, ...change });
	}

	// Local state keeps typing responsive; the URL (and the Fuse search it
	// drives on the server) only updates after a short debounce.
	const [queryInput, setQueryInput] = useState(search.species ?? "");
	useEffect(() => setQueryInput(search.species ?? ""), [search.species]);

	const debouncedSetQuery = useDebouncedCallback((value: string) => {
		updateSearch({ page: 1, species: value || undefined });
	}, 200);

	return (
		// The container and the layout it drives cannot be the same element -- a
		// container query only sees descendants, so `@container` here and
		// `@min-[38rem]:flex-row` on the child.
		<div className="@container">
			{/* Stacked, the search and the dates are separate rows of the form and
			    take the page's own 4-unit rhythm; side by side they only need the
			    tighter 3 that separates neighbours in a row. */}
			<div className="flex @min-[38rem]:flex-row flex-col @min-[38rem]:items-center @min-[38rem]:justify-between @min-[38rem]:gap-3 gap-4">
				<SearchInput
					aria-label="Search detections"
					placeholder="Search detections..."
					value={queryInput}
					onChange={(event) => {
						const value = event.target.value;
						setQueryInput(value);
						debouncedSetQuery(value);
					}}
					onClear={() => {
						setQueryInput("");
						debouncedSetQuery.cancel();
						updateSearch({ page: 1, species: undefined });
					}}
				/>
				{/* `flex-wrap` is the safety net, not the plan: at the compact field
			    width the pair needs ~368px and fits one line on a 414px phone. It
			    only wraps below that, and `shrink-0` keeps them legible rather than
			    squeezing the date text out of its box. */}
				{/* Stacked, the group is a full-width flex item and would sit hard
				    left; `self-end` pulls it to the right edge so it stays where the
				    row layout puts it. `self-auto` hands alignment back to the row's
				    `items-center` above 38rem -- left as `self-end` it would align on
				    the cross axis there and drop the dates to the row's bottom.
				    `justify-end` keeps both filters right when they wrap to two
				    lines. */}
				<div className="flex shrink-0 flex-wrap items-center justify-end gap-2 @min-[38rem]:self-auto self-end">
					<DateFilter
						id="detections-from"
						label="From"
						value={search.from ?? ""}
						onChange={(from) => updateSearch({ page: 1, from })}
					/>
					<DateFilter
						id="detections-to"
						label="To"
						value={search.to ?? ""}
						onChange={(to) => updateSearch({ page: 1, to })}
					/>
					{/* The Delete button rides at the right end of the same cluster,
					    after the dates -- an action, not a filter, but this is the row
					    that spans the top now the table's own header strip is gone. */}
					{actions}
				</div>
			</div>
		</div>
	);
}

export function DetectionsTable({
	page,
	search,
	onSearchChange,
	rowSelection,
	onRowSelectionChange,
	canDelete,
}: DetectionsTableProps) {
	function updateSearch(change: Partial<DetectionWorkspaceSearch>) {
		onSearchChange({ ...search, ...change });
		onRowSelectionChange({});
	}

	function sortBy(sort: DetectionWorkspaceSort) {
		updateSearch({
			page: 1,
			sort,
			direction:
				search.sort === sort && search.direction === "desc" ? "asc" : "desc",
		});
	}

	const selectColumn: ColumnDef<DetectionTableRow> = {
		id: "select",
		header: ({ table }) => (
			<input
				aria-label="Select all detections on this page"
				checked={table.getIsAllPageRowsSelected()}
				className="block size-3.5 accent-[var(--moss)]"
				type="checkbox"
				onChange={table.getToggleAllPageRowsSelectedHandler()}
			/>
		),
		cell: ({ row }) => (
			<input
				aria-label={`Select ${row.original.Com_Name}`}
				checked={row.getIsSelected()}
				className="block size-3.5 accent-[var(--moss)]"
				type="checkbox"
				onChange={row.getToggleSelectedHandler()}
			/>
		),
		enableHiding: false,
	};

	const columns: ColumnDef<DetectionTableRow>[] = [
		...(canDelete ? [selectColumn] : []),
		{
			accessorKey: "Com_Name",
			id: "species",
			header: () => (
				<SortButton
					label="Species"
					sort="species"
					search={search}
					onSort={sortBy}
				/>
			),
			// Styled to match the species name in the stats page's top-species rows,
			// hover underline included, so a species link reads the same everywhere.
			cell: ({ row }) => (
				<Link
					to="/species/$comName"
					params={{ comName: comNameToSlug(row.original.Com_Name) }}
					className="font-medium no-underline hover:underline"
				>
					{row.original.Com_Name}
				</Link>
			),
		},
		{
			accessorKey: "Sci_Name",
			id: "scientificName",
			header: () => (
				<SortButton
					label="Scientific name"
					sort="scientific"
					search={search}
					onSort={sortBy}
				/>
			),
			// Not a link: the common name in the row already goes to the species
			// page, and two links to the same place in one row is just noise.
			cell: ({ row }) => (
				<em className="text-[var(--bark)]">{row.original.Sci_Name}</em>
			),
		},
		{
			id: "recorded",
			header: () => (
				<SortButton
					label="Recorded"
					sort="recorded"
					search={search}
					onSort={sortBy}
				/>
			),
			cell: ({ row }) => (
				<Link
					to="/timeline"
					search={{ period: "day", date: row.original.Date }}
					className="tabular-data text-sm no-underline hover:underline"
				>
					{recordedLabel(row.original)}
				</Link>
			),
		},
		{
			accessorKey: "Confidence",
			id: "confidence",
			header: () => (
				<div className="text-right">
					<SortButton
						label="Confidence"
						sort="confidence"
						search={search}
						onSort={sortBy}
					/>
				</div>
			),
			cell: ({ row }) => (
				<div className="flex justify-end">
					{row.original.Confidence === null ? (
						<span className="tabular-data text-[var(--bark)]">—</span>
					) : (
						<ConfidencePill confidence={row.original.Confidence} />
					)}
				</div>
			),
		},
		{
			id: "audio",
			header: () => "Recording",
			cell: ({ row }) => (
				<div className="flex justify-end">
					<RecordingButton
						audioUrl={audioUrlFor(
							row.original.Date,
							row.original.Com_Name,
							row.original.File_Name,
						)}
						label="Recording"
						speciesName={row.original.Com_Name}
					/>
				</div>
			),
			enableHiding: false,
		},
	];

	const table = useReactTable({
		columns,
		data: page.rows,
		getCoreRowModel: getCoreRowModel(),
		getRowId: detectionRowKey,
		manualPagination: true,
		manualSorting: true,
		enableRowSelection: true,
		pageCount: Math.max(1, Math.ceil(page.total / search.pageSize)),
		onRowSelectionChange,
		state: { rowSelection },
	});

	const pageCount = Math.max(1, Math.ceil(page.total / search.pageSize));
	const rangeStart =
		page.total === 0 ? 0 : (search.page - 1) * search.pageSize + 1;
	const rangeEnd = Math.min(search.page * search.pageSize, page.total);
	return (
		// A column, not a stack: the scrollport takes the leftover height so the
		// rows are the only thing that scrolls, and the pager below stays put.
		// `min-h-0` is what lets it shrink -- a flex child defaults to
		// `min-height: auto` and would otherwise push the pager off the page.
		// No gap: the rows scroll directly beneath the pager's top rule, so the
		// footer reads as the edge of the scrollport rather than floating over it.
		<div className="@container flex min-h-0 flex-1 flex-col">
			{/* `lg:` and not a container query, here and on the two views below: the
			    sidebar leaves at exactly this width, and a container query measured
			    the card instead -- which the departing sidebar makes 272px *wider*.
			    The two thresholds could never coincide, so narrowing the window
			    reflowed the page twice. Tied to the viewport they fire together, at
			    the cost of showing the list on a wide-but-sidebar-less window. */}
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-3 lg:hidden">
				{canDelete ? (
					<label className="flex items-center gap-2 text-muted-foreground text-xs">
						<input
							aria-label="Select all detections on this page"
							checked={table.getIsAllPageRowsSelected()}
							className="block size-3.5 accent-[var(--moss)]"
							type="checkbox"
							onChange={table.getToggleAllPageRowsSelectedHandler()}
						/>
						Select page
					</label>
				) : null}
				<div className="flex items-center gap-1">
					<label className="flex items-center gap-2 text-muted-foreground text-xs">
						<span>Sort</span>
						<select
							aria-label="Sort detections by"
							className="h-8 rounded-md border border-input bg-card px-2 text-foreground text-sm hover:bg-accent focus-visible:border-[var(--hover-line)]"
							value={search.sort}
							onChange={(event) =>
								sortBy(event.target.value as DetectionWorkspaceSort)
							}
						>
							<option value="recorded">Recorded</option>
							<option value="species">Species</option>
							<option value="scientific">Scientific name</option>
							<option value="confidence">Confidence</option>
						</select>
					</label>
					<Button
						aria-label={`Sort detections ${search.direction === "asc" ? "descending" : "ascending"}`}
						title={search.direction === "asc" ? "Ascending" : "Descending"}
						icon={search.direction === "asc" ? ArrowUp : ArrowDown}
						size="icon"
						variant="outline"
						onClick={() =>
							updateSearch({
								page: 1,
								direction: search.direction === "asc" ? "desc" : "asc",
							})
						}
					/>
				</div>
			</div>

			{/* No hairlines between rows: each row is two lines of its own, so a rule
			    every 88px reads as a grid the content never asked for. The zebra fill
			    the Now page uses groups a row's lines instead and leaves the page
			    quieter. */}
			<ul
				data-slot="detections-list"
				className="min-h-0 flex-1 overflow-y-auto lg:hidden"
			>
				{/* This is the station's species row -- the same illustration, name and
				    binomial the Now page shows -- with what the detections page adds:
				    a checkbox, the moment, and the clip. Text-only rows made the one
				    page that lists individual birds the one page that never shows one.
				    The illustration is a synchronous local lookup, so it costs a path
				    string per row and nothing else.

				    No labels: an italic binomial, a clock time and a percentage each
				    announce what they are. */}
				{table.getRowModel().rows.map((row) => {
					const isSelected = row.getIsSelected();
					return (
						<li
							key={row.id}
							data-state={isSelected && "selected"}
							// Selection is a conditional class rather than a `data-` variant
							// alongside `odd:`: both are one class deep, so which one won
							// would come down to Tailwind's own ordering rather than intent.
							className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${
								isSelected
									? "bg-[var(--row-selected)]"
									: "odd:bg-[var(--meadow)]"
							}`}
						>
							{canDelete ? (
								<input
									aria-label={`Select ${row.original.Com_Name}`}
									checked={isSelected}
									className="block size-3.5 shrink-0 accent-[var(--moss)]"
									type="checkbox"
									onChange={row.getToggleSelectedHandler()}
								/>
							) : null}
							<SpeciesThumbnail
								imageUrl={illustrationUrlFor(row.original.Sci_Name)}
								comName={row.original.Com_Name}
							/>
							{/* One wrapping line rather than three fixed ones. Given the room
							    -- a tablet, or a phone turned sideways -- the name, the
							    binomial and the moment sit on a single line and the row is
							    36px tall; as the width closes each group drops to its own
							    line in turn. Nothing is hidden or restyled per width, and
							    there is no breakpoint to keep in step with anything: the
							    content wraps when it stops fitting, which is the only
							    threshold that was ever true.

							    `min-w-0` keeps a long name inside the block rather than
							    pushing the play button off the right edge. It wraps rather
							    than truncating: the name is the row, and clipping it mid-word
							    to hold a uniform row height trades the content for the grid. */}
							<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
								{/* No `block`: a block-level link fills the row, so its
								    underline and its click target ran the full width with
								    nothing but whitespace under the pointer. As a flex item it
								    is exactly as wide as the name. */}
								<Link
									to="/species/$comName"
									params={{ comName: comNameToSlug(row.original.Com_Name) }}
									className="min-w-0 font-medium leading-tight no-underline hover:underline"
								>
									{row.original.Com_Name}
								</Link>
								<em className="min-w-0 text-[var(--bark)] text-xs leading-snug">
									{row.original.Sci_Name}
								</em>
								{/* `ml-auto` holds the moment against the right edge of
								    whichever line it lands on. Clock and day stay on one line
								    -- the Now page stacks them because its second line is a
								    different datum ("12m ago"), and here it would only be more
								    of the same date. The confidence rides along: "how sure,
								    and when" belong together, and beside the name it took the
								    width that made long names wrap. */}
								<div className="ml-auto flex items-center gap-2">
									<Link
										to="/timeline"
										search={{ period: "day", date: row.original.Date }}
										className="no-underline hover:underline"
									>
										<span className="tabular-data text-sm leading-tight">
											{clockLabel(row.original)}
										</span>
										<span className="text-muted-foreground text-xs">
											{" · "}
											{dayLabel(row.original)}
										</span>
									</Link>
									{row.original.Confidence === null ? (
										<span className="tabular-data text-[var(--bark)] text-xs">
											—
										</span>
									) : (
										<ConfidencePill confidence={row.original.Confidence} />
									)}
								</div>
							</div>
							{/* The clip's button is a rail of its own down the right edge
							    rather than a fourth thing on the last line: at a thumb-sized
							    36px it set that line's height, so every row paid 12px for it.
							    Beside the block it costs nothing -- the illustration and the
							    text are already taller. */}
							<RecordingButton
								audioUrl={audioUrlFor(
									row.original.Date,
									row.original.Com_Name,
									row.original.File_Name,
								)}
								speciesName={row.original.Com_Name}
								iconOnly
								iconSize="icon-lg"
							/>
						</li>
					);
				})}
			</ul>

			{/* No `table-fixed` and no min width: auto layout already refuses to go
			    below what the row needs, since nothing in a cell wraps, and the
			    scrollport takes over from there. */}
			<Table containerClassName="hidden min-h-0 flex-1 overflow-y-auto lg:block">
				{/* Sticky per-`th` rather than on the `thead`: the pinned cells carry
				    their own fill so scrolled rows never show through beneath them.
				    No rule under the header -- the fill alone sets it off, matching
				    the borderless rows. The base `[&_tr]:border-b` is switched off. */}
				<TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-[var(--surface-strong)] [&_tr]:border-none">
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<TableHead
									key={header.id}
									className={`font-semibold ${HEADER_CLASSES[header.column.id] ?? ""}`}
								>
									{header.isPlaceholder
										? null
										: flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				{/* No empty row here: the page renders its own empty card instead of
				    this table, so the header, footer and pager come off with it. */}
				<TableBody>
					{table.getRowModel().rows.map((row) => (
						<TableRow
							key={row.id}
							data-state={row.getIsSelected() && "selected"}
							// Zebra fill in place of the shared row's hairline -- the same
							// idiom the list above and the Now page use. `border-none` drops
							// that rule; selection is a conditional class rather than stacking
							// `data-[state=selected]:` over `odd:`, so intent wins over
							// Tailwind's own ordering, matching the list's choice.
							className={
								row.getIsSelected()
									? "border-none bg-[var(--row-selected)]"
									: "border-none odd:bg-[var(--meadow)]"
							}
						>
							{row.getVisibleCells().map((cell) => (
								<TableCell
									key={cell.id}
									className={CELL_CLASSES[cell.column.id]}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>

			{/* The two halves measure ~364px side by side, so 26rem is the real
			    point where they stop fitting -- the old 38rem stacked them while
			    there was still most of a row's worth of space going spare. */}
			<div className="flex shrink-0 @min-[26rem]:flex-row flex-col @min-[26rem]:items-center @min-[26rem]:justify-between gap-3 pt-3 text-sm">
				<span className="tabular-data text-muted-foreground">
					Showing {rangeStart}–{rangeEnd} of {page.total}
				</span>
				<div className="flex items-center gap-1">
					<label className="flex items-center gap-2 text-muted-foreground">
						<span className="sr-only">Detections per page</span>
						<select
							className="h-8 rounded-md border border-input bg-card px-2 text-sm hover:bg-accent focus-visible:border-[var(--hover-line)]"
							value={search.pageSize}
							onChange={(event) =>
								updateSearch({
									page: 1,
									pageSize: Number(event.target.value) as 25 | 50 | 100,
								})
							}
						>
							<option value={25}>25 / page</option>
							<option value={50}>50 / page</option>
							<option value={100}>100 / page</option>
						</select>
					</label>
					<Button
						aria-label="Previous page"
						disabled={search.page <= 1}
						size="icon"
						variant="outline"
						onClick={() => updateSearch({ page: search.page - 1 })}
					>
						<ChevronLeft />
					</Button>
					{/* Exactly the widest string it can hold: both sides top out at
					    `pageCount`'s digit count, `tabular-data` pins every digit to
					    1ch, and " / " measures ~0.7em. Counting the separator as three
					    characters instead over-reserved by 15px, which is what left the
					    arrows looking stranded. Fixed per page count, so paging never
					    reflows it. */}
					<span
						className="tabular-data text-center text-muted-foreground"
						style={{
							minWidth: `calc(${String(pageCount).length * 2}ch + 0.75em)`,
						}}
					>
						{search.page} / {pageCount}
					</span>
					<Button
						aria-label="Next page"
						disabled={search.page >= pageCount}
						size="icon"
						variant="outline"
						onClick={() => updateSearch({ page: search.page + 1 })}
					>
						<ChevronRight />
					</Button>
				</div>
			</div>
		</div>
	);
}
