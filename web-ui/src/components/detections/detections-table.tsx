import { Link } from "@tanstack/react-router";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	type OnChangeFn,
	type RowSelectionState,
	useReactTable,
} from "@tanstack/react-table";
import {
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Calendar,
	ChevronDown,
	Trash2,
	X,
} from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { PageStepper } from "~/components/ui/page-stepper.tsx";
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
	DETECTION_SORTS,
	type DetectionWorkspaceSearch,
	type DetectionWorkspaceSort,
	detectionRowKey,
} from "~/lib/detection-workspace.ts";
import type { DetectionPage, DetectionTableRow } from "~/lib/detections.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import { shortAnchorLabel } from "~/lib/timeline-window.ts";
import { cn } from "~/lib/utils.ts";

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
	/** Opens the page's delete confirmation for the selected rows. */
	onDeleteSelected: () => void;
};

type DetectionsFiltersProps = Pick<
	DetectionsTableProps,
	"search" | "onSearchChange"
>;

// Three widths of the one table, keyed to the card rather than the viewport
// (the sidebar changes how much of the viewport the card gets). Narrowest, a
// row is only what a detection *is*: the bird, when, and its clip -- a long
// species name ends in an ellipsis, the moment stacks its time over its day,
// and the clip's button drops its label. From 36rem the confidence joins and those three go
// back to one line; from 54rem the scientific name joins too. Past what a row
// needs the scrollport still scrolls sideways rather than squeeze anything.
//
// Only the two ends are pinned: the shared selection column, and Recording,
// held to the width of the button it carries so it stays a tidy right edge
// rather than a widening gutter. Everything between them shares the rest of
// the width equally (see the grid on the <Table> below), never narrower than
// what it holds.
//
// The pinned widths sit on the header cells rather than a <colgroup> to keep a
// column's sizing next to the header that names it.
// `pr-3` rather than `pr-0`: the body scrolls under a vertical scrollbar pinned
// to the container's right edge, and flush-right the recording button sat hard
// against it. The gap gives the column room to breathe without widening it into
// a gutter -- it eats into the fixed 8rem, it does not add to it.
//
// The rows run out to the card's left edge (see the <Table> below), so the
// card's inset moves into the first column: it replaces the cell's own 8px, so
// the first column's content sits exactly the card's padding in. That padding
// is the page gap -- 16px, or 8px on the smallest phones -- so every offset
// here reads the variable rather than a number.
//
// The space between columns follows it too: each cell keeps half the gap
// either side, so neighbours sit a full gap apart -- 16px, or 8px on the
// smallest phones. The select column is the padding, the 14px box and half a
// gap, so the box sits that same full gap from the species name.
const FIRST_COLUMN_CLASSES = "pl-(--page-gap)";
const CELL_GAP = "px-[calc(var(--page-gap)/2)]";
// The rows run out to the card's right edge as well, so the last column takes
// the card's padding as its own inset -- the mirror of the first column.
const AUDIO_EDGE = "pr-(--page-gap)";
// Which columns sit out at which width. Hidden, a cell leaves the grid's flow
// entirely, and the grid's own column list (on the <Table>) drops its track.
const COLUMN_VISIBILITY: Record<string, string> = {
	scientificName: "hidden @min-[54rem]:block",
	confidence: "hidden @min-[36rem]:block",
};
const HEADER_CLASSES: Record<string, string> = {
	select: `${SELECT_COLUMN_WIDTH} w-[calc(var(--page-gap)*1.5+0.875rem)] min-w-[calc(var(--page-gap)*1.5+0.875rem)]`,
	confidence: "text-right",
	audio: `${AUDIO_EDGE} text-right @min-[36rem]:w-32 @min-[36rem]:min-w-32`,
};
const CELL_CLASSES: Record<string, string> = {
	species: "min-w-0 truncate",
	// Narrow, the stacked time and day sit against the play button, under the
	// right-aligned sort menu; one line again, they read left to right.
	recorded: "text-right @min-[36rem]:text-left",
	audio: AUDIO_EDGE,
};

// A row spans every column of the table's grid and takes its tracks as its own,
// so its fill runs the full width and its cells centre on its height the way
// `align-middle` did in a real table row.
const GRID_ROW = "col-span-full grid grid-cols-subgrid items-center";

// The grid's column list at each width, as custom properties the <Table>'s
// container-query classes pick between -- one list per width, since a hidden
// column has to leave the list as well as the row. Species may shrink below its
// name at the narrow widths, where it truncates; at the widest every column
// holds its content on one line and the four between the ends share the rest.
function gridColumns(canDelete: boolean): CSSProperties {
	const select = canDelete ? "max-content " : "";
	const fill = "minmax(max-content, 1fr)";
	return {
		"--cols-sm": `${select}minmax(0, 1fr) max-content max-content`,
		"--cols-md": `${select}minmax(0, 1fr) ${fill} ${fill} max-content`,
		"--cols-lg": `${select}repeat(4, ${fill}) max-content`,
	} as CSSProperties;
}

function recordedLabel(row: DetectionTableRow): string {
	const date = new Date(`${row.Date}T${row.Time}`);
	if (Number.isNaN(date.valueOf())) return `${row.Date} ${row.Time}`;
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}

// The narrow row splits `recordedLabel` in two -- a clock time the eye can
// compare down the column, over the day it belongs to. The year only appears
// when it is not the current one: on a station's recent detections it is the
// same digits on every row.
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

const SORT_LABELS: Record<DetectionWorkspaceSort, string> = {
	recorded: "Recorded",
	species: "Species",
	scientific: "Scientific name",
	confidence: "Confidence",
};

/**
 * The narrow table's header: which column orders the rows and which way, as
 * one joined control in the family of the pager and the date range -- a native
 * menu (so a phone opens its own picker) and the direction beside it.
 */
function SortMenu({
	search,
	onSort,
	onFlip,
}: {
	search: DetectionWorkspaceSearch;
	onSort: (sort: DetectionWorkspaceSort) => void;
	onFlip: () => void;
}) {
	const DirectionIcon = search.direction === "asc" ? ArrowUp : ArrowDown;
	return (
		// Held to the right edge, over the column of times and the play buttons
		// it orders, rather than hard against the checkbox.
		<div className="ml-auto flex h-7 w-fit overflow-hidden rounded-md border border-input bg-card font-normal text-sm">
			<div className="relative flex">
				<select
					aria-label="Sort detections by"
					value={search.sort}
					// Picking a column sorts by it newest/highest first, as clicking its
					// heading does; the arrow beside it is for turning that around.
					onChange={(event) =>
						search.sort !== event.target.value &&
						onSort(event.target.value as DetectionWorkspaceSort)
					}
					className="h-full cursor-pointer appearance-none bg-transparent pr-7 pl-2.5 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"
				>
					{DETECTION_SORTS.map((sort) => (
						<option key={sort} value={sort}>
							{SORT_LABELS[sort]}
						</option>
					))}
				</select>
				<ChevronDown
					className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
			<button
				type="button"
				aria-label={`Sort ${search.direction === "asc" ? "descending" : "ascending"}`}
				title={search.direction === "asc" ? "Ascending" : "Descending"}
				onClick={onFlip}
				className="flex w-7 shrink-0 items-center justify-center border-input border-l text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
			>
				<DirectionIcon className="size-4" aria-hidden="true" />
			</button>
		</div>
	);
}

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

// One bordered control for the whole range, built like the timeline's window
// stepper: segments joined by hairlines, each showing the date in the station's
// short form ("Sep 24, 2026") rather than the browser's own `mm/dd/yyyy` field
// text. The arrow between the ends stands in for "From" and "To", which the
// inputs still carry as their accessible names.
function DateRangeFilter({
	from,
	to,
	onChange,
}: {
	from: string | undefined;
	to: string | undefined;
	onChange: (range: {
		from: string | undefined;
		to: string | undefined;
	}) => void;
}) {
	return (
		<fieldset
			aria-label="Date range"
			className="flex h-9 @min-[38rem]:w-auto w-full shrink-0 overflow-hidden rounded-md border border-input bg-card focus-within:border-[var(--focus-ring)]"
		>
			<DateSegment
				label="From date"
				value={from}
				max={to}
				showIcon
				onChange={(value) => onChange({ from: value, to })}
			/>
			<span
				aria-hidden="true"
				className="flex items-center border-input border-x px-2 text-muted-foreground"
			>
				<ArrowRight className="size-4" />
			</span>
			<DateSegment
				label="To date"
				value={to}
				min={from}
				showIcon
				onChange={(value) => onChange({ from, to: value })}
			/>
			{/* One clear for the pair. Always rendered, and dimmed while there is
			    nothing to clear, so setting a date never shifts the row. */}
			<button
				type="button"
				aria-label="Clear date range"
				title="Clear dates"
				disabled={!from && !to}
				onClick={() => onChange({ from: undefined, to: undefined })}
				className="flex w-9 shrink-0 items-center justify-center border-input border-l text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
			>
				<X className="size-4" aria-hidden="true" />
			</button>
		</fieldset>
	);
}

/**
 * One end of the range: the date as text, with the native date input laid
 * invisibly over it so a phone still opens its own picker and `min`/`max` still
 * hold the ends in order. The label's floor fits the longest date, so picking
 * one never resizes the control.
 */
function DateSegment({
	label,
	value,
	min,
	max,
	showIcon = false,
	onChange,
}: {
	label: string;
	value: string | undefined;
	min?: string;
	max?: string;
	showIcon?: boolean;
	onChange: (value: string | undefined) => void;
}) {
	return (
		// Stacked, each date takes half the row and centres in it, and a long
		// date truncates rather than pushing the clear button out of the box.
		<div className="relative flex min-w-0 @min-[38rem]:flex-none flex-1 items-center @min-[38rem]:justify-start justify-center gap-2 @min-[38rem]:px-3 px-2 pointer-coarse:text-base text-sm transition-colors hover:bg-accent">
			{/* Under 400px the calendar mark goes, as on the timeline's stepper --
			    the row needs its width for the dates themselves. */}
			{showIcon ? (
				<Calendar
					className="size-4 shrink-0 text-muted-foreground max-[400px]:hidden"
					aria-hidden="true"
				/>
			) : null}
			<span
				className={`@min-[38rem]:min-w-[6.5rem] truncate whitespace-nowrap ${value ? "" : "text-muted-foreground"}`}
			>
				{value ? shortAnchorLabel("day", value) : "Any date"}
			</span>
			<input
				aria-label={label}
				className="absolute inset-0 size-full cursor-pointer text-base opacity-0"
				type="date"
				value={value ?? ""}
				min={min}
				max={max}
				// A desktop browser only opens its calendar from the field's own
				// little button, which is invisible here -- so a click anywhere on
				// the segment asks for the picker outright.
				onClick={(event) => {
					try {
						event.currentTarget.showPicker?.();
					} catch {
						// Not allowed here (e.g. not a user gesture); nothing to do.
					}
				}}
				onChange={(event) => onChange(event.target.value || undefined)}
			/>
		</div>
	);
}

/**
 * What the footer shows once rows are ticked: one bordered control, the pager's
 * twin, with the count set the way the pager sets its page -- the number in
 * the foreground, the word muted -- then a clear and the delete, each its own
 * segment behind a hairline. Clay is kept to the one word that destroys
 * something.
 */
function SelectionBar({
	count,
	onClear,
	onDelete,
}: {
	count: number;
	onClear: () => void;
	onDelete: () => void;
}) {
	const noun = count === 1 ? "detection" : "detections";
	return (
		<fieldset
			aria-label="Selected detections"
			className="flex h-7 w-fit shrink-0 overflow-hidden rounded-md border border-input bg-card text-sm"
		>
			{/* Narrow, the words go and the count and the trash glyph carry it,
			    so the bar fits one row beside the pager; screen readers still get
			    "selected" and the button's full name. */}
			<span className="flex items-center gap-[0.5ch] @min-[36rem]:px-3 px-2 text-muted-foreground">
				<span className="tabular-data font-semibold text-foreground">
					{count}
				</span>
				<span className="sr-only @min-[36rem]:not-sr-only">selected</span>
			</span>
			<button
				type="button"
				aria-label="Clear selection"
				title="Clear selection"
				onClick={onClear}
				className="flex w-7 shrink-0 items-center justify-center border-input border-l text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
			>
				<X className="size-4" aria-hidden="true" />
			</button>
			<button
				type="button"
				aria-label={`Delete ${count} selected ${noun}`}
				onClick={onDelete}
				className="flex @min-[36rem]:w-auto w-7 items-center justify-center gap-2 border-input border-l @min-[36rem]:px-3 text-destructive transition-colors hover:bg-destructive/10"
			>
				<Trash2 className="size-4" aria-hidden="true" />
				<span className="sr-only @min-[36rem]:not-sr-only">Delete</span>
			</button>
		</fieldset>
	);
}

export function DetectionsFilters({
	search,
	onSearchChange,
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
			{/* The page's 4-unit rhythm both stacked and side by side: the search,
			    the date range and Delete are separate controls, and a tighter gap
			    between them read as uneven next to the 16px everywhere else. */}
			<div className="flex @min-[38rem]:flex-row flex-col @min-[38rem]:items-center @min-[38rem]:justify-between gap-(--page-gap)">
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
				{/* Stacked, the range takes the full width under the search, its two
				    dates splitting it; side by side it is only as wide as it needs. */}
				<div className="@min-[38rem]:w-auto w-full">
					<DateRangeFilter
						from={search.from}
						to={search.to}
						onChange={({ from, to }) => updateSearch({ page: 1, from, to })}
					/>
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
	onDeleteSelected,
}: DetectionsTableProps) {
	function updateSearch(change: Partial<DetectionWorkspaceSearch>) {
		onSearchChange({ ...search, ...change });
		onRowSelectionChange({});
	}

	function flipSort() {
		updateSearch({
			page: 1,
			direction: search.direction === "asc" ? "desc" : "asc",
		});
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
					<span className="flex @min-[36rem]:hidden flex-col items-end">
						<span className="leading-tight">{clockLabel(row.original)}</span>
						<span className="text-muted-foreground text-xs leading-tight">
							{dayLabel(row.original)}
						</span>
					</span>
					<span className="@min-[36rem]:inline hidden">
						{recordedLabel(row.original)}
					</span>
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
			// Narrow, the column is a lone speaker glyph per row and needs no
			// heading to explain it; the name stays for screen readers.
			header: () => (
				<span className="sr-only @min-[36rem]:not-sr-only">Recording</span>
			),
			cell: ({ row }) => (
				<div className="flex justify-end">
					<RecordingButton
						audioUrl={audioUrlFor(
							row.original.Date,
							row.original.Com_Name,
							row.original.File_Name,
						)}
						label="Recording"
						labelClassName="hidden @min-[36rem]:inline"
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
	const selectedCount = Object.values(rowSelection).filter(Boolean).length;
	return (
		// A column, not a stack: the scrollport takes the leftover height so the
		// rows are the only thing that scrolls, and the pager below stays put.
		// `min-h-0` is what lets it shrink -- a flex child defaults to
		// `min-height: auto` and would otherwise push the pager off the page.
		// No gap: the rows scroll directly beneath the pager's top rule, so the
		// footer reads as the edge of the scrollport rather than floating over it.
		<div className="@container flex min-h-0 flex-1 flex-col">
			{/* `-ml-(--page-gap) pl-0` pulls the scrollport out through the card's
			    left padding, so the zebra fill and the header's band run to the card's
			    edge; the first column carries that inset instead. `-mt-4` does the
			    same at the top: the header band meets the card's top edge and its
			    cells take the 16px as padding, so the labels sit exactly the card's
			    4 units down rather than that plus half a centred 40px row. */}
			{/* Only the rows scroll: the header sits above the scrollport rather
			    than stuck to the top of it, so the scrollbar runs beside the rows
			    and stops at the column labels. That takes the header out of the
			    rows' scroll box, and a table can't share column widths across two
			    of them -- so the table is laid out as a grid, and the header, the
			    body and every row are subgrids of its columns. Species through
			    Confidence share the width equally, never below what they hold;
			    the ends take what they carry. The display change drops the
			    elements' native table roles in some browsers, so they are given
			    back explicitly.

			    Both halves reserve the scrollbar's gutter, so the header's last
			    column lines up with the body's whether or not a classic scrollbar
			    is showing. Sideways, the whole grid scrolls once the columns no
			    longer fit. */}
			<Table
				role="table"
				className="grid h-full min-w-min @min-[36rem]:grid-cols-(--cols-md) @min-[54rem]:grid-cols-(--cols-lg) grid-cols-(--cols-sm) grid-rows-[auto_minmax(0,1fr)]"
				style={gridColumns(canDelete)}
				containerClassName="-ml-(--page-gap) -mr-(--card-edge) -mt-(--page-gap) min-h-0 flex-1 overflow-x-auto overflow-y-hidden pr-0 pl-0"
			>
				{/* A hairline under the header, the footer's rule mirrored, so the
				    rows are framed top and bottom by the same line running the card's
				    full width. It sits on the rowgroup rather than the row (the base
				    `[&_tr]:border-b` is switched off) and its 1px comes out of the
				    bottom padding, so the band stays the footer's height.
				    `leading-none` sets the label's line to its 14px type, so the 16px
				    above it reaches the letters rather than a 20px line's leading, and
				    `[&_tr]:h-auto` drops the shared row's 41px floor so the band is its
				    padding plus the label and nothing more. */}
				<TableHeader
					role="rowgroup"
					className="col-span-full grid grid-cols-subgrid overflow-hidden border-b bg-[var(--surface-strong)] [scrollbar-gutter:stable] [&_th]:h-auto @min-[36rem]:[&_th]:pt-4 [&_th]:pt-[calc(var(--page-gap)/2+1px)] @min-[36rem]:[&_th]:pb-[15px] [&_th]:pb-[calc(var(--page-gap)/2)] [&_th]:leading-none [&_th_button]:leading-none [&_tr]:h-auto [&_tr]:border-none"
				>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} role="row" className={GRID_ROW}>
							{headerGroup.headers.map((header) => (
								<TableHead
									key={header.id}
									role="columnheader"
									className={cn(
										"font-semibold",
										CELL_GAP,
										HEADER_CLASSES[header.column.id],
										header.column.id === "select"
											? undefined
											: (COLUMN_VISIBILITY[header.column.id] ??
													"@min-[36rem]:block hidden"),
										header.index === 0 && FIRST_COLUMN_CLASSES,
									)}
								>
									{header.isPlaceholder
										? null
										: flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
								</TableHead>
							))}
							{/* Narrow, the labels give way to one sort menu spanning the
							    columns after the checkbox: three bare headings over three
							    columns said little, and two of the four sorts belong to
							    columns this width does not show. */}
							<TableHead
								role="columnheader"
								className={cn(
									"@min-[36rem]:hidden",
									canDelete
										? "col-[2/-1]"
										: `col-[1/-1] ${FIRST_COLUMN_CLASSES}`,
									AUDIO_EDGE,
								)}
							>
								<SortMenu search={search} onSort={sortBy} onFlip={flipSort} />
							</TableHead>
						</TableRow>
					))}
				</TableHeader>
				{/* No empty row here: the page renders its own empty card instead of
				    this table, so the header, footer and pager come off with it. */}
				<TableBody
					role="rowgroup"
					className="col-span-full grid min-h-0 grid-cols-subgrid content-start overflow-y-auto [scrollbar-gutter:stable]"
				>
					{table.getRowModel().rows.map((row) => (
						<TableRow
							key={row.id}
							role="row"
							data-state={row.getIsSelected() && "selected"}
							// Zebra fill in place of the shared row's hairline -- the same
							// idiom the list above and the Now page use. `border-none` drops
							// that rule; selection is a conditional class rather than stacking
							// `data-[state=selected]:` over `odd:`, so intent wins over
							// Tailwind's own ordering, matching the list's choice.
							className={cn(
								GRID_ROW,
								row.getIsSelected()
									? "border-none bg-[var(--row-selected)]"
									: "border-none odd:bg-[var(--meadow)]",
							)}
						>
							{row.getVisibleCells().map((cell, index) => (
								<TableCell
									key={cell.id}
									role="cell"
									className={cn(
										CELL_GAP,
										CELL_CLASSES[cell.column.id],
										COLUMN_VISIBILITY[cell.column.id],
										index === 0 && FIRST_COLUMN_CLASSES,
									)}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>

			{/* The footer carries what acts on the rows: the selection on the left,
			    once there is one, and the pager on the right. Delete lives here
			    rather than among the filters -- it is an action on the rows just
			    picked, and with nothing picked there is nothing to show at all, so
			    no dead button. `ml-auto` holds the pager right on its own.
			    The footer is the header's twin: a 46px band -- the 1px rule, 8px,
			    the 28px controls, 9px -- against the header's 16px either side of
			    its 14px labels, so the table is bookended by two bands of one height
			    rather than a footer that outweighs the header. It owns the space
			    down to the card's edge; the card drops its bottom padding for it.
			    A hairline sets it off from the rows: the header gets away without
			    one because the first row is always a zebra row, but the last row
			    in view is as often white, and then the footer ran straight into
			    it. The rule runs the card's full width, out through its side
			    padding like the rows, which the footer takes back as its own. */}
			<div className="-mr-(--card-edge) -ml-(--page-gap) flex shrink-0 flex-wrap items-center gap-2 border-t pt-[calc(var(--page-gap)/2)] pr-(--card-edge) pb-[calc(var(--page-gap)/2+1px)] pl-(--page-gap) text-sm">
				{canDelete && selectedCount > 0 ? (
					<SelectionBar
						count={selectedCount}
						onClear={() => onRowSelectionChange({})}
						onDelete={onDeleteSelected}
					/>
				) : null}
				<PageStepper
					className="ml-auto"
					label="Detections pages"
					page={search.page}
					pageCount={pageCount}
					onPageChange={(page) => updateSearch({ page })}
				/>
			</div>
		</div>
	);
}
