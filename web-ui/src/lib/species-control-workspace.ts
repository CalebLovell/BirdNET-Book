export const SPECIES_CONTROL_SORTS = [
	"species",
	"scientific",
	"count",
	"status",
] as const;

export type SpeciesControlSort = (typeof SPECIES_CONTROL_SORTS)[number];
export type SpeciesControlSortDirection = "asc" | "desc";

export type SpeciesControlWorkspaceSearch = {
	page: number;
	sort: SpeciesControlSort;
	direction: SpeciesControlSortDirection;
	query?: string;
};

const DEFAULT_DIRECTION: Record<
	SpeciesControlSort,
	SpeciesControlSortDirection
> = {
	species: "asc",
	scientific: "asc",
	count: "desc",
	status: "asc",
};

function isSpeciesControlSort(value: unknown): value is SpeciesControlSort {
	return SPECIES_CONTROL_SORTS.includes(value as SpeciesControlSort);
}

export function normalizeSpeciesControlWorkspaceSearch(
	input: Record<string, unknown>,
): SpeciesControlWorkspaceSearch {
	const rawPage = Number(input.page);
	const page =
		Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
	// TODO(audit 17): opening on ~6,500 installed species A→Z buries the few
	// dozen this station actually hears among zero-count rows. Default to the
	// count sort (or add a "heard here" filter), and give the bulk-action
	// buttons (Automatic / Custom / Always / Never) enough contrast to read
	// while nothing is selected.
	const sort = isSpeciesControlSort(input.sort) ? input.sort : "species";
	const direction = input.direction === "desc" ? "desc" : "asc";
	const query = input.query == null ? "" : String(input.query).trim();

	return {
		page,
		sort,
		direction,
		...(query ? { query } : {}),
	};
}

export function nextSpeciesControlSort(
	search: SpeciesControlWorkspaceSearch,
	sort: SpeciesControlSort,
): SpeciesControlWorkspaceSearch {
	return {
		...search,
		page: 1,
		sort,
		direction:
			search.sort === sort
				? search.direction === "asc"
					? "desc"
					: "asc"
				: DEFAULT_DIRECTION[sort],
	};
}
