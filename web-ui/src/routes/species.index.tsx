import {
	createFileRoute,
	Link,
	stripSearchParams,
} from "@tanstack/react-router";
import Fuse from "fuse.js";
import {
	ArrowDownAZ,
	ArrowDownWideNarrow,
	ArrowUpNarrowWide,
	BarChart3,
	Bird,
	ChartNoAxesColumnIncreasing,
	ChevronDown,
	Clock,
	Clock3,
	Feather,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { z } from "zod";
import { EmptyNote, EmptyState } from "~/components/empty-state.tsx";
import {
	PageHeaderCard,
	type PageHeaderStat,
} from "~/components/page-header-card.tsx";
import { SpeciesActions } from "~/components/species-actions.tsx";
import { SpeciesImage } from "~/components/species-image.tsx";
import { PageStepper } from "~/components/ui/page-stepper.tsx";
import { SearchInput } from "~/components/ui/search-input.tsx";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group.tsx";
import { formatDateTime } from "~/lib/date-format.ts";
import { getLifeListCards, type LifeListCard } from "~/lib/detections.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import { hourLabel } from "~/lib/time-ago.ts";
import { cn } from "~/lib/utils.ts";

const SORT_KEYS = ["count", "recent", "alpha"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const DEFAULT_SEARCH = {
	q: "",
	sort: "count" as SortKey,
	reverse: false,
	page: 1,
};

// Search/sort/page all live in the URL (not component state), so filtering
// is shareable/bookmarkable and survives back/forward navigation.
const speciesSearchSchema = z.object({
	// Coerced: search terms are not quoted in the URL, so a numeric one
	// ("?q=1080") parses back as a number and a bare z.string() would drop it.
	q: z.coerce.string().default(DEFAULT_SEARCH.q).catch(DEFAULT_SEARCH.q),
	sort: z
		.enum(SORT_KEYS)
		.default(DEFAULT_SEARCH.sort)
		.catch(DEFAULT_SEARCH.sort),
	reverse: z
		.boolean()
		.default(DEFAULT_SEARCH.reverse)
		.catch(DEFAULT_SEARCH.reverse),
	page: z
		.number()
		.int()
		.min(1)
		.default(DEFAULT_SEARCH.page)
		.catch(DEFAULT_SEARCH.page),
});

export const Route = createFileRoute("/species/")({
	head: () => ({ meta: [{ title: pageTitle("Species") }] }),
	validateSearch: speciesSearchSchema,
	search: {
		middlewares: [stripSearchParams(DEFAULT_SEARCH)],
	},
	component: Species,
	loader: () => getLifeListCards(),
});

const PAGE_SIZE = 24;

function Species() {
	const cards = Route.useLoaderData();
	const { q: search, sort, reverse, page } = Route.useSearch();
	const navigate = Route.useNavigate();

	// Local state keeps typing responsive; the URL (and the Fuse search it
	// drives) only updates after a short debounce, so back/forward history
	// doesn't get a new entry on every keystroke.
	const [queryInput, setQueryInput] = useState(search);
	useEffect(() => setQueryInput(search), [search]);

	const debouncedSetQuery = useDebouncedCallback((value: string) => {
		navigate({
			search: (prev) => ({ ...prev, q: value, page: 1 }),
			replace: true,
		});
	}, 200);

	const fuse = useMemo(
		() =>
			new Fuse(cards, {
				keys: ["comName", "sciName"],
				threshold: 0.2,
				ignoreLocation: true,
			}),
		[cards],
	);

	const filtered = useMemo(() => {
		const query = search.trim();
		const matches = query ? fuse.search(query).map((r) => r.item) : cards;

		const direction = reverse ? -1 : 1;
		return [...matches].sort((a, b) => {
			if (sort === "alpha")
				return direction * b.comName.localeCompare(a.comName);
			if (sort === "recent")
				return direction * b.lastDetected.localeCompare(a.lastDetected);
			return direction * (b.allTimeCount - a.allTimeCount);
		});
	}, [cards, fuse, search, sort, reverse]);

	// Derived from the whole life list, never the search: the header describes
	// the station, and only the grid below answers the query.
	const stats = useMemo<PageHeaderStat[]>(() => {
		// An empty station has nothing to describe, so the row comes off
		// entirely rather than reading as a line of zeros.
		if (cards.length === 0) return [];

		const detections = cards.reduce((sum, card) => sum + card.allTimeCount, 0);
		// Ranked by count regardless of the current sort, so this always names the
		// most-detected species rather than whatever the toggle put on top.
		const mostActive = cards.reduce(
			(top, card) => (card.allTimeCount > top.allTimeCount ? card : top),
			cards[0],
		);
		// Hourly histograms folded across every species, so the peak names the
		// station's busiest hour of day rather than any one bird's.
		const hourTotals = cards.reduce((totals, card) => {
			for (let hour = 0; hour < 24; hour += 1)
				totals[hour] += card.hourCounts[hour] ?? 0;
			return totals;
		}, new Array<number>(24).fill(0));
		const peakHour = hourTotals.reduce(
			(best, count, hour) => (count > hourTotals[best] ? hour : best),
			0,
		);
		const hasPeak = hourTotals[peakHour] > 0;

		return [
			{
				label: "Total detections",
				value: detections,
				icon: ChartNoAxesColumnIncreasing,
			},
			{
				label: "Species",
				value: cards.length,
				icon: Feather,
			},
			{
				label: "Most active",
				value: mostActive.comName,
				icon: Bird,
			},
			{
				label: "Most active hour",
				value: hasPeak ? hourLabel(peakHour) : "—",
				icon: Clock3,
			},
		] satisfies PageHeaderStat[];
	}, [cards]);

	// A new sort starts in its natural direction; the direction button flips
	// whichever sort is current. Both go back to page one, since the page you
	// were on no longer holds the same species.
	const pickSort = (next: SortKey) =>
		navigate({
			search: (prev) => ({ ...prev, sort: next, reverse: false, page: 1 }),
			replace: true,
		});
	const flipDirection = () =>
		navigate({
			search: (prev) => ({ ...prev, reverse: !prev.reverse, page: 1 }),
			replace: true,
		});

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount);
	const pageItems = filtered.slice(
		(currentPage - 1) * PAGE_SIZE,
		currentPage * PAGE_SIZE,
	);

	return (
		<div className="page-wrap flex min-h-full flex-col gap-(--page-gap) py-4">
			<PageHeaderCard
				icon={Feather}
				title="Species"
				description="Every species ever recorded at this station."
				stats={stats}
			/>

			{/* Gated on the life list rather than the current result, so a search
			    that matches nothing keeps the box you need to clear it. */}
			{cards.length > 0 && (
				// One row at every width: the search takes what the sort leaves. The
				// three sort tabs need about 340px beside a usable search box, so
				// below 640px the same choice becomes a dropdown.
				<div className="flex items-center gap-2 sm:gap-3">
					<SearchInput
						aria-label="Filter by species"
						placeholder="Search species..."
						value={queryInput}
						onChange={(e) => {
							const value = e.target.value;
							setQueryInput(value);
							debouncedSetQuery(value);
						}}
						onClear={() => {
							setQueryInput("");
							debouncedSetQuery.cancel();
							navigate({
								search: (prev) => ({ ...prev, q: "", page: 1 }),
								replace: true,
							});
						}}
					/>
					{/* The same two controls at every width -- which sort, then its
					    direction -- as a dropdown on a phone and tabs from 640px. */}
					<SortSelect
						sort={sort}
						reverse={reverse}
						onSort={pickSort}
						onReverse={flipDirection}
					/>
					<SortTabs
						sort={sort}
						reverse={reverse}
						onSort={pickSort}
						onReverse={flipDirection}
					/>
				</div>
			)}

			{pageItems.length === 0 ? (
				cards.length === 0 ? (
					// Nothing has ever been recorded: the page itself is empty, so it
					// carries the card rather than a line inside one.
					<EmptyState icon={Bird} title="No species recorded yet.">
						Every species the station hears will be listed here.
					</EmptyState>
				) : (
					<section
						aria-label="Species recorded"
						className="feature-card rounded-md p-4"
					>
						<div className="island-kicker">Species recorded</div>
						<EmptyNote>No species match &ldquo;{search}&rdquo;.</EmptyNote>
					</section>
				)
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-(--page-gap)">
					{pageItems.map((card) => (
						<SpeciesCard key={card.comName} card={card} />
					))}
				</div>
			)}

			{pageItems.length > 0 && (
				<SpeciesFooter
					first={(currentPage - 1) * PAGE_SIZE + 1}
					last={(currentPage - 1) * PAGE_SIZE + pageItems.length}
					total={filtered.length}
					lifeList={cards.length}
					sort={sort}
					reverse={reverse}
					page={currentPage}
					pageCount={pageCount}
					onPageChange={(next) =>
						navigate({
							search: (prev) => ({ ...prev, page: next }),
							replace: true,
						})
					}
				/>
			)}
		</div>
	);
}

const SORT_META: Record<
	SortKey,
	{ label: string; icon: React.ComponentType<{ className?: string }> }
> = {
	count: { label: "Total", icon: BarChart3 },
	recent: { label: "Recent", icon: Clock },
	// "Name" rather than the tab's "Alphabetical": a native select is as wide as
	// its widest option, and the search box beside it needs that width more.
	// Not "A–Z" either -- the default order runs Z first (see `filtered`).
	alpha: { label: "Name", icon: ArrowDownAZ },
};

/** How each sort reads in the footer, in its natural and reversed direction. */
const SORT_PHRASE: Record<SortKey, [string, string]> = {
	count: ["most recorded first", "least recorded first"],
	recent: ["most recently heard first", "longest unheard first"],
	alpha: ["Z to A", "A to Z"],
};

/**
 * The grid's footer: the same band the tables end on -- a hairline, then what
 * the page holds on the left and the stepper held right. The grid has no card
 * of its own, so the footer is one: a slim card the width of the grid. Shown
 * on a single page too, so the page keeps one shape as a search narrows it,
 * and held to the bottom of the page (`mt-auto` in the page's full-height
 * column) so a short last page doesn't pull it up under the grid.
 */
function SpeciesFooter({
	first,
	last,
	total,
	lifeList,
	sort,
	reverse,
	page,
	pageCount,
	onPageChange,
}: {
	first: number;
	last: number;
	total: number;
	lifeList: number;
	sort: SortKey;
	reverse: boolean;
	page: number;
	pageCount: number;
	onPageChange: (page: number) => void;
}) {
	const Icon = SORT_META[sort].icon;
	return (
		<div className="feature-card mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md px-(--page-gap) py-2 text-sm">
			<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
				<span>
					<span className="tabular-data font-semibold text-foreground">
						{first.toLocaleString()}&ndash;{last.toLocaleString()}
					</span>{" "}
					of{" "}
					<span className="tabular-data font-semibold text-foreground">
						{total.toLocaleString()}
					</span>{" "}
					species
					{total < lifeList ? (
						<span className="max-sm:hidden">
							{" "}
							&middot; filtered from{" "}
							<span className="tabular-data">{lifeList.toLocaleString()}</span>
						</span>
					) : null}
				</span>
				<span className="flex items-center gap-1.5 max-[400px]:hidden">
					<Icon className="size-3.5" aria-hidden="true" />
					{SORT_PHRASE[sort][reverse ? 1 : 0]}
				</span>
			</div>
			<PageStepper
				className="ml-auto"
				label="Species pages"
				page={page}
				pageCount={pageCount}
				onPageChange={onPageChange}
			/>
		</div>
	);
}

/**
 * The sort on a narrow screen: a native select dressed like the timeline's
 * period menu -- the same 36px box, border, card surface and hover, the chosen
 * sort's icon in front -- with the direction joined to its right end by a
 * hairline, the way the timeline's date stepper joins its arrows -- the same
 * direction button the tabs carry from 640px.
 */
function SortSelect({
	sort,
	reverse,
	onSort,
	onReverse,
}: {
	sort: SortKey;
	reverse: boolean;
	onSort: (next: SortKey) => void;
	onReverse: () => void;
}) {
	const Icon = SORT_META[sort].icon;
	return (
		<div className="flex h-9 shrink-0 overflow-hidden rounded-md border border-input bg-card focus-within:border-[var(--focus-ring)] sm:hidden">
			<div className="relative">
				{/* Under 400px the icon goes: the search box needs the width more. */}
				<Icon
					className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 max-[400px]:hidden"
					aria-hidden="true"
				/>
				<select
					aria-label="Sort by"
					value={sort}
					onChange={(event) => onSort(event.target.value as SortKey)}
					className="h-full cursor-pointer appearance-none bg-transparent pr-7 pl-8 font-medium pointer-coarse:text-base text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none max-[400px]:pl-2.5"
				>
					{SORT_KEYS.map((key) => (
						<option key={key} value={key}>
							{SORT_META[key].label}
						</option>
					))}
				</select>
				<ChevronDown
					className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
			<DirectionButton
				reverse={reverse}
				onReverse={onReverse}
				className="w-8 border-l"
			/>
		</div>
	);
}

/**
 * The sort from 640px: which order, as three joined tabs, with the direction
 * joined to their right end -- the same button the phone's dropdown carries.
 * Picking a tab only picks the sort; clicking the active one does nothing, so
 * the direction lives in one place instead of hiding behind a second click.
 */
function SortTabs({
	sort,
	reverse,
	onSort,
	onReverse,
}: {
	sort: SortKey;
	reverse: boolean;
	onSort: (next: SortKey) => void;
	onReverse: () => void;
}) {
	return (
		<div className="hidden shrink-0 sm:flex">
			<ToggleGroup
				type="single"
				variant="outline"
				value={sort}
				onValueChange={(value) => {
					if (value) onSort(value as SortKey);
				}}
			>
				{SORT_KEYS.map((key) => {
					const Icon = SORT_META[key].icon;
					return (
						<ToggleGroupItem
							key={key}
							value={key}
							// Square where the direction button joins on.
							className="data-[spacing=0]:last:rounded-r-none"
						>
							<Icon className="size-4" />
							{key === "alpha" ? "Alphabetical" : SORT_META[key].label}
						</ToggleGroupItem>
					);
				})}
			</ToggleGroup>
			<DirectionButton
				reverse={reverse}
				onReverse={onReverse}
				className="w-9 rounded-r-md border border-l-0"
			/>
		</div>
	);
}

/**
 * Flips the current sort. Every sort starts descending -- biggest, newest, or
 * Z first -- and reversing it flips the arrow. Not a chevron: beside the
 * dropdown's own chevron it would read as a second dropdown.
 */
function DirectionButton({
	reverse,
	onReverse,
	className,
}: {
	reverse: boolean;
	onReverse: () => void;
	className: string;
}) {
	const Direction = reverse ? ArrowUpNarrowWide : ArrowDownWideNarrow;
	return (
		<button
			type="button"
			aria-label="Reverse sort order"
			aria-pressed={reverse}
			title={reverse ? "Reversed" : "Reverse order"}
			onClick={onReverse}
			className={cn(
				// Reversed wears the selected sort's green, so it reads as on.
				"flex shrink-0 items-center justify-center border-input bg-card transition-colors hover:bg-accent hover:text-accent-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-pressed:hover:text-primary-foreground",
				className,
			)}
		>
			<Direction className="size-4" aria-hidden="true" />
		</button>
	);
}

function SpeciesCard({ card }: { card: LifeListCard }) {
	const lastHeard = card.lastDetected ? formatDateTime(card.lastDetected) : "—";

	return (
		<div className="feature-card feature-card-link relative flex flex-col gap-3 overflow-hidden rounded-md p-4 has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2 max-[400px]:gap-2">
			{/* The whole-card link is an invisible overlay pinned to the card's
			    edges, so its own focus ring would land under `overflow-hidden` and
			    never be seen. Instead the card wears the ring on the overlay's
			    behalf -- scoped to [data-card-link] so focusing the Bird Call
			    button or the eBird link inside doesn't light the whole card too. */}
			<Link
				to="/species/$comName"
				params={{ comName: comNameToSlug(card.comName) }}
				data-card-link=""
				className="absolute inset-0 z-0 focus-visible:outline-none"
				aria-label={`View ${card.comName}`}
			/>
			<div className="flex flex-col gap-1">
				<div className="flex items-baseline gap-1">
					<div className="tabular-data font-semibold text-foreground text-lg leading-none">
						{card.allTimeCount.toLocaleString()}
					</div>
					{/* Not "total": that word belongs to the station's own figure
					    above the grid, which this card's count is one share of. */}
					<div className="text-[10px] text-muted-foreground/70 leading-none">
						{card.allTimeCount === 1 ? "detection" : "detections"}
					</div>
				</div>
			</div>

			{/* The bird takes whatever height the row leaves over, so the count
			    stays pinned to the top, the name block to the bottom, and no card
			    shows a blank band when a neighbour in its row runs taller. The image
			    sits in an absolute layer so its native size can't stretch the card.
			    Positioning lifts it over the whole-card link, so it lets clicks
			    through to that link. */}
			<div className="pointer-events-none relative min-h-40 w-full flex-1">
				<div className="absolute inset-0 flex items-center justify-center overflow-hidden">
					<SpeciesImage
						imageUrl={card.imageUrl}
						alt={card.comName}
						glyphClassName="size-16"
						loading="lazy"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-3 max-[400px]:gap-2">
				<div>
					<h2 className="display-title font-bold text-base">{card.comName}</h2>
					<p className="text-[var(--bark)] text-xs italic">{card.sciName}</p>
				</div>
				<SpeciesActions
					audioUrl={card.audioUrl}
					ebirdUrl={card.ebirdUrl}
					comName={card.comName}
				/>
				<div className="w-full self-end text-right text-[10px] text-muted-foreground/70 leading-none">
					Last heard · {lastHeard}
				</div>
			</div>
		</div>
	);
}
