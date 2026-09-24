import {
	createFileRoute,
	Link,
	stripSearchParams,
} from "@tanstack/react-router";
import Fuse from "fuse.js";
import {
	ArrowDownAZ,
	BarChart3,
	Bird,
	ChartNoAxesColumnIncreasing,
	ChevronDown,
	ChevronUp,
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
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "~/components/ui/pagination.tsx";
import { SearchInput } from "~/components/ui/search-input.tsx";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group.tsx";
import { getLifeListCards, type LifeListCard } from "~/lib/detections.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import { hourLabel } from "~/lib/time-ago.ts";

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

function parseDetected(value: string): Date | null {
	if (!value) return null;
	const parsed = new Date(value.replace(" ", "T"));
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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

	// Derived from `filtered` rather than the page slice, so the figures
	// describe the whole search result, not just the 24 cards on screen.
	const stats = useMemo<PageHeaderStat[]>(() => {
		// Nothing to describe means every figure would be a 0 or an em dash, so
		// the row comes off entirely rather than reading as broken.
		if (filtered.length === 0) return [];

		const detections = filtered.reduce(
			(sum, card) => sum + card.allTimeCount,
			0,
		);
		// Ranked by count regardless of the current sort, so this always names the
		// most-detected species in the result rather than whatever the toggle put
		// on top.
		const mostActive = filtered.reduce(
			(top, card) => (card.allTimeCount > top.allTimeCount ? card : top),
			filtered[0],
		);
		// Hourly histograms folded across the whole result, so the peak names the
		// busiest hour of day for these species rather than for any one of them.
		const hourTotals = filtered.reduce((totals, card) => {
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
				value: filtered.length,
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
	}, [filtered]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount);
	const pageItems = filtered.slice(
		(currentPage - 1) * PAGE_SIZE,
		currentPage * PAGE_SIZE,
	);

	return (
		<div className="page-wrap space-y-(--page-gap) py-4">
			<PageHeaderCard
				title="Species"
				description="Every species ever recorded at this station."
				stats={stats}
			/>

			{/* Gated on the life list rather than the current result, so a search
			    that matches nothing keeps the box you need to clear it. */}
			{cards.length > 0 && (
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
					{/* Scrolls rather than wraps on a narrow screen: a segmented control
					    cannot break across lines without losing its joined shape, and
					    the three labels together are a little wider than a phone. */}
					<div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto">
						<ToggleGroup
							type="single"
							variant="outline"
							value={sort}
							onValueChange={(value) => {
								if (!value) {
									navigate({
										search: (prev) => ({
											...prev,
											reverse: !prev.reverse,
											page: 1,
										}),
										replace: true,
									});
									return;
								}
								navigate({
									search: (prev) => ({
										...prev,
										sort: value as SortKey,
										reverse: false,
										page: 1,
									}),
									replace: true,
								});
							}}
						>
							<ToggleGroupItem
								value="count"
								aria-label={`Total sort (${sort === "count" && reverse ? "ascending" : "descending"})`}
							>
								<BarChart3 className="size-4" />
								Total
								{sort === "count" && reverse ? (
									<ChevronUp className="size-3" aria-hidden="true" />
								) : (
									<ChevronDown className="size-3" aria-hidden="true" />
								)}
							</ToggleGroupItem>
							<ToggleGroupItem
								value="recent"
								aria-label={`Recent sort (${sort === "recent" && reverse ? "ascending" : "descending"})`}
							>
								<Clock className="size-4" />
								Recent
								{sort === "recent" && reverse ? (
									<ChevronUp className="size-3" aria-hidden="true" />
								) : (
									<ChevronDown className="size-3" aria-hidden="true" />
								)}
							</ToggleGroupItem>
							<ToggleGroupItem
								value="alpha"
								aria-label={`Alphabetical sort (${sort === "alpha" && reverse ? "ascending" : "descending"})`}
							>
								<ArrowDownAZ className="size-4" />
								Alphabetical
								{sort === "alpha" && reverse ? (
									<ChevronUp className="size-3" aria-hidden="true" />
								) : (
									<ChevronDown className="size-3" aria-hidden="true" />
								)}
							</ToggleGroupItem>
						</ToggleGroup>
					</div>
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
				<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
					{pageItems.map((card) => (
						<SpeciesCard key={card.comName} card={card} />
					))}
				</div>
			)}

			{pageCount > 1 && (
				<Pagination>
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious
								href="#"
								onClick={(e) => {
									e.preventDefault();
									navigate({
										search: (prev) => ({
											...prev,
											page: Math.max(1, currentPage - 1),
										}),
										replace: true,
									});
								}}
								className={
									currentPage === 1 ? "pointer-events-none opacity-50" : ""
								}
							/>
						</PaginationItem>
						{Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
							<PaginationItem key={p}>
								<PaginationLink
									href="#"
									isActive={p === currentPage}
									onClick={(e) => {
										e.preventDefault();
										navigate({
											search: (prev) => ({ ...prev, page: p }),
											replace: true,
										});
									}}
								>
									{p}
								</PaginationLink>
							</PaginationItem>
						))}
						<PaginationItem>
							<PaginationNext
								href="#"
								onClick={(e) => {
									e.preventDefault();
									navigate({
										search: (prev) => ({
											...prev,
											page: Math.min(pageCount, currentPage + 1),
										}),
										replace: true,
									});
								}}
								className={
									currentPage === pageCount
										? "pointer-events-none opacity-50"
										: ""
								}
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			)}
		</div>
	);
}

function SpeciesCard({ card }: { card: LifeListCard }) {
	const parsedLastDetected = parseDetected(card.lastDetected);
	const lastHeard = parsedLastDetected
		? new Intl.DateTimeFormat(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
				hour: "numeric",
				minute: "2-digit",
			}).format(parsedLastDetected)
		: card.lastDetected || "—";

	return (
		<div className="feature-card feature-card-link relative flex flex-col gap-3 overflow-hidden rounded-md p-4 has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2">
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
						{card.allTimeCount}
					</div>
					<div className="text-[10px] text-muted-foreground/70 leading-none">
						total recordings
					</div>
				</div>
			</div>

			<div className="flex h-40 w-full items-center justify-center overflow-hidden">
				{card.imageUrl ? (
					<img
						src={card.imageUrl}
						alt={card.comName}
						className="max-h-full max-w-40 object-contain"
						loading="lazy"
					/>
				) : (
					<div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
						<Bird className="size-12" />
					</div>
				)}
			</div>

			<div className="flex flex-1 flex-col gap-3">
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
