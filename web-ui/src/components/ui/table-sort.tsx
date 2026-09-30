import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";

type SortDirection = "asc" | "desc";

/**
 * A narrow table's header: which column orders the rows and which way, as one
 * joined control in the family of the pager and the date range -- a native
 * menu (so a phone opens its own picker) and the direction beside it. Shared by
 * the detections and species control tables.
 */
export function SortMenu<Sort extends string>({
	label,
	sorts,
	labels,
	sort,
	direction,
	onSort,
	onFlip,
}: {
	/** The menu's accessible name, e.g. "Sort detections by". */
	label: string;
	sorts: readonly Sort[];
	labels: Record<Sort, string>;
	sort: Sort;
	direction: SortDirection;
	onSort: (sort: Sort) => void;
	onFlip: () => void;
}) {
	const DirectionIcon = direction === "asc" ? ArrowUp : ArrowDown;
	return (
		// Held to the right edge, over the columns it orders, rather than hard
		// against the checkbox.
		<div className="ml-auto flex h-7 w-fit overflow-hidden rounded-md border border-input bg-card font-normal text-sm">
			<div className="relative flex">
				<select
					aria-label={label}
					value={sort}
					// Picking a column sorts by it as clicking its heading does; the
					// arrow beside it is for turning that around.
					onChange={(event) =>
						sort !== event.target.value && onSort(event.target.value as Sort)
					}
					className="h-full cursor-pointer appearance-none bg-transparent pr-7 pl-2.5 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"
				>
					{sorts.map((option) => (
						<option key={option} value={option}>
							{labels[option]}
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
				aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`}
				title={direction === "asc" ? "Ascending" : "Descending"}
				onClick={onFlip}
				className="flex w-7 shrink-0 items-center justify-center border-input border-l text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
			>
				<DirectionIcon className="size-4" aria-hidden="true" />
			</button>
		</div>
	);
}

/** A sortable column heading: its name and an arrow, faint until it is active. */
export function SortButton<Sort extends string>({
	label,
	sort,
	activeSort,
	direction,
	onSort,
}: {
	label: string;
	sort: Sort;
	activeSort: Sort;
	direction: SortDirection;
	onSort: (sort: Sort) => void;
}) {
	const isActive = activeSort === sort;
	const Icon = isActive && direction === "asc" ? ArrowUp : ArrowDown;
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
