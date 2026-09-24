import {
	createFileRoute,
	Link,
	notFound,
	stripSearchParams,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	CalendarDays,
	ChartNoAxesColumnIncreasing,
	ChevronLeft,
	ChevronRight,
	Clock3,
	Gauge,
	Sunrise,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { BestRecordingCard } from "~/components/best-recording-card.tsx";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { DetectionsByHourCard } from "~/components/detections-by-hour-card.tsx";
import { DetectionsByMonthCard } from "~/components/detections-by-month-card.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import {
	PageHeaderCard,
	type PageHeaderStat,
} from "~/components/page-header-card.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { SpeciesActions } from "~/components/species-actions.tsx";
import {
	HERO_CARD_SHELL,
	SpeciesHeroCard,
} from "~/components/species-hero-card.tsx";
import { StatusPage } from "~/components/status-page.tsx";
import { Button } from "~/components/ui/button.tsx";
import { Input } from "~/components/ui/input.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip.tsx";
import { YearSelector } from "~/components/year-selector.tsx";
import { formatConfidence } from "~/lib/confidence.ts";
import { ebirdUrlFor } from "~/lib/ebird.ts";
import { HEAT_COLORS, heatLevel } from "~/lib/heatmap.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import { pageTitle } from "~/lib/page-title.ts";
import {
	getSpeciesDetail,
	getSpeciesVisits,
	type SpeciesDetail,
	type VisitPage,
	visitPageCount,
} from "~/lib/species-detail.ts";
import { formatTimeAgo } from "~/lib/time-ago.ts";
import type { TrendPoint } from "~/lib/trend.ts";
import { useAgeOffset } from "~/lib/use-age-offset.ts";
import { useFavicon } from "~/lib/use-favicon.ts";

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2000;
const DEFAULT_YEAR = CURRENT_YEAR;

const speciesDetailSearchSchema = z.object({
	year: z.coerce
		.number()
		.int()
		.min(MIN_YEAR)
		.max(CURRENT_YEAR)
		.default(DEFAULT_YEAR)
		.catch(DEFAULT_YEAR),
	/** Visit log page, 1 = newest. Clamped to the bird's last page on render. */
	visits: z.coerce.number().int().min(1).default(1).catch(1),
});

export const Route = createFileRoute("/species/$comName")({
	validateSearch: speciesDetailSearchSchema,
	search: {
		middlewares: [stripSearchParams({ year: DEFAULT_YEAR, visits: 1 })],
	},
	// The visit page is deliberately not a dep: paging the log fetches just
	// that page, rather than rerunning every query on the page. The loader still
	// reads it so a deep link to page 40 server-renders page 40.
	loaderDeps: ({ search }) => ({ year: search.year }),
	loader: async ({ params, deps, location }) => {
		const result = await getSpeciesDetail({
			data: {
				comNameSlug: params.comName,
				year: deps.year,
				visitsPage: (location.search as { visits?: number }).visits,
			},
		});
		// Thrown rather than rendered so the router's not-found path handles it,
		// which is what lets this route keep its own masthead below.
		if (result.status === "unknown") throw notFound();
		return result;
	},
	// The bird's own name once the loader has resolved the slug -- for an
	// undetected bird too, since the catalog gave us the name even though the
	// station has never heard it. Until then the section name stands in.
	head: ({ loaderData }) => ({
		meta: [
			{
				title: pageTitle(
					loaderData?.status === "detected"
						? loaderData.detail.comName
						: (loaderData?.comName ?? "Species"),
				),
			},
		],
	}),
	component: BirdPage,
	notFoundComponent: SpeciesNotFound,
});

type HeatMapWeek = {
	days: { date: Date; point: TrendPoint | null }[];
	monthLabel: string | null;
};

function dateForBucket(bucket: string): Date {
	return new Date(`${bucket.slice(0, 10)}T00:00:00`);
}

function bucketForDate(date: Date): string {
	const pad = (value: number) => value.toString().padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildHeatMap(history: TrendPoint[]): {
	weeks: HeatMapWeek[];
	maximum: number;
} {
	if (history.length === 0) return { weeks: [], maximum: 0 };

	const points = new Map(
		history.map((point) => [point.bucket.slice(0, 10), point]),
	);
	const firstDate = dateForBucket(history[0].bucket);
	const lastDate = dateForBucket(history[history.length - 1].bucket);
	const start = new Date(firstDate);
	start.setDate(start.getDate() - start.getDay());
	// The grid pads leftwards to a Sunday so the weekday rows line up, but it is
	// never padded past the trend's last bucket -- which is today for the current
	// year -- so no square ever stands for a day that hasn't happened.
	const end = lastDate;
	const weeks: HeatMapWeek[] = [];
	const seenMonths = new Set<string>();
	const maximum = Math.max(...history.map((point) => point.count), 0);

	for (
		const weekStart = new Date(start);
		weekStart <= end;
		weekStart.setDate(weekStart.getDate() + 7)
	) {
		const days: { date: Date; point: TrendPoint | null }[] = [];
		let monthLabel: string | null = null;
		for (let day = 0; day < 7; day += 1) {
			const date = new Date(weekStart);
			date.setDate(date.getDate() + day);
			if (date > end) break;
			const key = bucketForDate(date);
			days.push({ date, point: points.get(key) ?? null });
			const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
			if (date.getDate() <= 7 && !seenMonths.has(monthKey)) {
				monthLabel = date.toLocaleDateString([], { month: "short" });
				seenMonths.add(monthKey);
			}
		}
		weeks.push({ days, monthLabel });
	}

	return { weeks, maximum };
}

const SPECIES_SECTION = "Species";
const SPECIES_SECTION_DESCRIPTION =
	"Every species ever recorded at this station.";

function BirdPage() {
	const result = Route.useLoaderData();

	if (result.status === "undetected") {
		return (
			<UndetectedSpecies comName={result.comName} sciName={result.sciName} />
		);
	}
	// `unknown` never reaches the component: the loader throws `notFound()` for
	// it, and `SpeciesNotFound` renders instead.
	if (result.status !== "detected") return null;

	return <SpeciesDetailView detail={result.detail} />;
}

/**
 * A bird the installed model knows about that this station has never heard.
 * Not an error card: it carries the bird's name, its portrait and its eBird
 * link, because someone arriving here is usually waiting on exactly this
 * species rather than recovering from a typo.
 */
function UndetectedSpecies({
	comName,
	sciName,
}: {
	comName: string;
	sciName: string;
}) {
	const illustration = illustrationUrlFor(sciName, "flight");

	return (
		<div className="page-wrap space-y-(--page-gap) py-4">
			<PageHeaderCard
				title={SPECIES_SECTION}
				description={SPECIES_SECTION_DESCRIPTION}
			/>
			<section className="feature-card rounded-md p-4">
				<div className="flex flex-wrap items-start gap-5 max-[400px]:gap-2">
					{illustration ? (
						<img
							src={illustration}
							alt=""
							className="size-32 shrink-0 object-contain"
						/>
					) : null}
					<div className="min-w-0 flex-1">
						<h2 className="display-title font-semibold text-xl">{comName}</h2>
						<p className="mt-0.5 text-muted-foreground text-sm italic">
							{sciName}
						</p>
						{/* No measure cap here, unlike the diagnostic prose in
						    `PageStatus`: this is one sentence, and capping it at 42rem
						    inside a much wider card broke the line nowhere near any edge
						    you could see, which read as an accident. Left alone it sets on
						    one line and wraps against the card itself when the column is
						    narrow. */}
						<p className="mt-3 text-muted-foreground text-sm leading-relaxed max-[400px]:mt-2">
							Not detected at this station yet. The installed model can
							recognise this bird, so it will appear here the first time it is
							heard.
						</p>
						<div className="mt-(--page-gap) flex flex-wrap items-center gap-2">
							<SpeciesActions
								ebirdUrl={ebirdUrlFor(sciName, comName)}
								comName={comName}
							/>
							<Button variant="ghost" size="sm" asChild>
								<Link to="/species">All species</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}

/** The slug matched no bird the installed classifier can even emit. */
function SpeciesNotFound() {
	const { comName } = Route.useParams();

	return (
		<StatusPage
			section={SPECIES_SECTION}
			sectionDescription={SPECIES_SECTION_DESCRIPTION}
			tone="missing"
			title="No such species"
			actions={
				<Button variant="outline" size="sm" asChild>
					<Link to="/species">Browse all species</Link>
				</Button>
			}
		>
			“{comName}” doesn’t match any bird this station’s classifier knows about.
			The address may be mistyped.
		</StatusPage>
	);
}

function SpeciesDetailView({ detail }: { detail: SpeciesDetail }) {
	const { year, visits: visitsPage } = Route.useSearch();
	const navigate = Route.useNavigate();
	const offsetMs = useAgeOffset(detail.generatedAt);
	// The same flight illustration the hero draws, so the browser serves it from
	// cache rather than pulling a second half-megabyte PNG. The wings lose their
	// detail at 16px, but the silhouette still reads. Species without a bundled
	// illustration keep the nest.
	useFavicon(illustrationUrlFor(detail.sciName, "flight"));

	const { weeks, maximum } = buildHeatMap(detail.history);
	// A year of weeks is wider than a phone, so the grid scrolls inside its card.
	// For the current year the right edge is today, so start there; a past year
	// starts at January like reading a calendar.
	const heatScrollRef = useRef<HTMLDivElement>(null);
	// `detail.history` is the trigger, not an input: the year in the URL changes
	// before the loader brings that year's grid, so it re-aims once it lands.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-aim trigger
	useEffect(() => {
		const el = heatScrollRef.current;
		if (el) el.scrollLeft = year === CURRENT_YEAR ? el.scrollWidth : 0;
	}, [year, detail.history]);
	// Only the heat map is year-scoped; the charts below it cover all time.
	const selectYear = (next: number) =>
		navigate({
			search: (prev) => ({ ...prev, year: next }),
			replace: true,
		});
	const selectVisitsPage = (next: number) =>
		navigate({
			search: (prev) => ({ ...prev, visits: next }),
			replace: true,
			resetScroll: false,
		});

	return (
		<TooltipProvider>
			<div className="page-wrap pb-4">
				<SummaryCard detail={detail} offsetMs={offsetMs} />

				{/* One column below lg, and `minmax(0,1fr)` rather than the implicit
				    `auto` track: an auto track sizes to the heat map's full-year
				    min-content (~900px), which pushed every card off a phone screen
				    instead of letting the heat map scroll inside its own card. */}
				<div className="mt-(--page-gap) grid grid-cols-[minmax(0,1fr)] items-stretch gap-(--page-gap) lg:grid-cols-[minmax(0,max-content)_minmax(20rem,1fr)]">
					<section
						aria-label="Detection history"
						className="feature-card overflow-hidden rounded-md p-4"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="island-kicker">Detection history</div>
							<YearSelector
								year={year}
								years={detail.availableYears}
								onChange={selectYear}
							/>
						</div>

						{/* The weekday labels sit outside the scroller, so they stay put
						    while a phone scrolls through the weeks. The month row is a
						    fixed 12px (plus its 4px margin) so the labels' pt-4 lines Sun
						    up with the first row of squares. */}
						<div className="mt-(--page-gap) flex gap-2">
							<div className="flex w-7 shrink-0 flex-col gap-1 pt-4 text-[9px] text-muted-foreground leading-3">
								<span>Sun</span>
								<span>Mon</span>
								<span>Tue</span>
								<span>Wed</span>
								<span>Thu</span>
								<span>Fri</span>
								<span>Sat</span>
							</div>
							<div
								ref={heatScrollRef}
								className="min-w-0 flex-1 overflow-x-auto pb-1"
							>
								<div className="w-max">
									<div className="mb-1 flex h-3 gap-1 leading-3">
										{weeks.map((week) => (
											<div
												key={`month-${week.days[0].date.toISOString()}`}
												className="w-3 shrink-0 whitespace-nowrap text-[10px] text-muted-foreground"
											>
												{week.monthLabel}
											</div>
										))}
									</div>
									<div className="flex w-max gap-1">
										{weeks.map((week) => (
											<div
												key={`week-${week.days[0].date.toISOString()}`}
												className="flex shrink-0 flex-col gap-1"
											>
												{week.days.map(({ date, point }) => (
													<HeatMapDay
														key={date.toISOString()}
														date={date}
														point={point}
														maximum={maximum}
													/>
												))}
											</div>
										))}
									</div>
								</div>
							</div>
						</div>
						<div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground max-[400px]:mt-2">
							<span>Less</span>
							{HEAT_COLORS.map((color) => (
								<span
									key={color}
									className="size-3 rounded-[3px] border border-[var(--line)]"
									style={{ backgroundColor: color }}
								/>
							))}
							<span>More</span>
						</div>
					</section>

					<BestRecordingCard recording={detail.bestRecording} />

					{/* The hour/month charts and the visit log share the same two
					    columns as the row above -- one grid, so the heat map and the
					    charts line up on the left and Best recording and the visit log
					    line up on the right. min-w-0 lets the charts conform to the
					    left track rather than widen it. */}
					<div className="grid min-w-0 gap-(--page-gap) lg:grid-rows-2">
						<DetectionsByHourCard
							activity={detail.hourActivity}
							className="lg:min-h-0"
						/>

						<DetectionsByMonthCard
							trend={detail.detectionTrend}
							className="lg:min-h-0"
						/>
					</div>

					{/* Keyed by bird so moving to another species starts its log
					    back at page one instead of carrying the old page number. */}
					<VisitLogCard
						key={detail.comName}
						comName={detail.comName}
						totalVisits={detail.totalDetections}
						firstPage={{
							page: 1,
							visits: detail.recentVisits,
							generatedAt: detail.generatedAt,
						}}
						loadedPage={detail.visitLog}
						page={visitsPage}
						onPageChange={selectVisitsPage}
					/>
				</div>
			</div>
		</TooltipProvider>
	);
}

const SWATCH =
	"size-3 rounded-[3px] border border-[var(--line)] transition-[outline] hover:z-10 hover:outline hover:outline-2 hover:outline-[var(--hover-line)] hover:outline-offset-1";

/**
 * One square of the contribution grid. Days that actually recorded something
 * are links into that day's review; empty squares stay inert, since there is
 * nothing on the other side of them to read.
 */
function HeatMapDay({
	date,
	point,
	maximum,
}: {
	date: Date;
	point: TrendPoint | null;
	maximum: number;
}) {
	const count = point?.count ?? 0;
	const dateLabel = date.toLocaleDateString([], {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	const label = `${dateLabel}: ${count} detections`;
	const fill = { backgroundColor: HEAT_COLORS[heatLevel(count, maximum)] };

	// Inside a link the swatch is decoration: the link already carries the label,
	// and repeating it would have a screen reader read the day twice.
	const swatch =
		count > 0 ? (
			<Link
				to="/timeline"
				search={{ period: "day", date: bucketForDate(date) }}
				aria-label={label}
				className="block"
			>
				<div aria-hidden="true" className={SWATCH} style={fill} />
			</Link>
		) : (
			<div role="img" aria-label={label} className={SWATCH} style={fill} />
		);

	return (
		<Tooltip>
			<TooltipTrigger asChild>{swatch}</TooltipTrigger>
			<TooltipContent>
				{dateLabel} — {count}
				{count > 0 ? " · view this day" : null}
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * The Today page's hero card with this species' figures in it -- same shell,
 * same portrait column, same lines. Only the data differs: this card's clock
 * runs from the species' last visit rather than from a live poll.
 */
function SummaryCard({
	detail,
	offsetMs,
}: {
	detail: SpeciesDetail;
	offsetMs: number;
}) {
	// The most recent visit is the same detection as `lastDetected`, and it is the
	// only one carrying a server-measured age and a clip, so the relative label
	// and the recording both agree with the visit log instead of drifting.
	const lastVisit = detail.recentVisits[0];

	const stats = [
		{
			label: "Total detections",
			value: detail.totalDetections,
			icon: ChartNoAxesColumnIncreasing,
		},
		{
			label: "Avg. confidence",
			value: formatConfidence(detail.averageConfidence),
			icon: Gauge,
		},
		{
			label: "First heard",
			value: formatHeardDate(detail.firstDetected.date),
			icon: Sunrise,
		},
		{
			label: "Last heard",
			value: formatHeardDate(detail.lastDetected.date),
			icon: CalendarDays,
		},
	] satisfies PageHeaderStat[];

	return (
		<SpeciesHeroCard
			label="Species profile"
			comName={detail.comName}
			sciName={detail.sciName}
			imageUrl={detail.imageUrl}
			relativeTime={
				lastVisit
					? formatTimeAgo(lastVisit.ageMs + offsetMs)
					: formatHeardDate(detail.lastDetected.date)
			}
			clockTime={formatVisitTime(detail.lastDetected.time)}
			confidence={detail.lastDetected.confidence}
			audioUrl={lastVisit?.audioUrl ?? null}
			stats={stats}
			actions={
				<SpeciesActions ebirdUrl={detail.ebirdUrl} comName={detail.comName} />
			}
			className={`${HERO_CARD_SHELL} mt-(--page-gap)`}
		/>
	);
}

function formatHeardDate(date: string): string {
	if (!date) return "—";

	return new Date(`${date}T00:00:00`).toLocaleDateString([], {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatVisitTime(time: string): string {
	return new Date(`1970-01-01T${time}`).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * Every visit this species has ever made, newest first, a page at a time. The
 * page lives in the URL (`?visits=`); the loader brings page one (which the
 * hero also reads) and whichever page the URL opened on, and every other page
 * is fetched on demand -- so the log reaches the very first detection, across
 * every year rather than just the heat map's, one page of rows at a time.
 */
function VisitLogCard({
	comName,
	totalVisits,
	firstPage,
	loadedPage,
	page: requestedPage,
	onPageChange,
}: {
	comName: string;
	totalVisits: number;
	firstPage: VisitPage;
	loadedPage: VisitPage;
	page: number;
	onPageChange: (page: number) => void;
}) {
	const fetchVisits = useServerFn(getSpeciesVisits);
	const pageCount = visitPageCount(totalVisits);
	// A URL past the last page (the bird's history is shorter than the link
	// remembers) shows the last page rather than an empty log.
	const page = Math.min(requestedPage, pageCount);
	const [fetched, setFetched] = useState<Record<number, VisitPage>>({});
	const current =
		page === 1
			? firstPage
			: page === loadedPage.page
				? loadedPage
				: fetched[page];
	// Until the next page lands the previous one stays up, dimmed, so paging
	// never collapses the card to nothing.
	const [held, setHeld] = useState(current ?? firstPage);
	useEffect(() => {
		if (current) setHeld(current);
	}, [current]);
	const shown = current ?? held;
	const offsetMs = useAgeOffset(shown.generatedAt);

	useEffect(() => {
		if (current) return;
		let cancelled = false;
		fetchVisits({ data: { comName, page } }).then((data) => {
			if (!cancelled) setFetched((prev) => ({ ...prev, [data.page]: data }));
		});
		return () => {
			cancelled = true;
		};
	}, [comName, page, current, fetchVisits]);

	const loading = !current;
	const visits = shown.visits;

	return (
		<section
			aria-label="Visit log"
			// A container, because the log's width depends on the grid track it
			// lands in more than on the screen: it gets ~18rem both on a phone and
			// in the right-hand column at lg, and the whole content width between.
			className="@container feature-card flex min-h-[420px] flex-col rounded-md p-4"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="island-kicker">Visit log</div>
				{pageCount > 1 ? (
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="icon-xs"
							disabled={page <= 1}
							aria-label="Newer visits"
							onClick={() => onPageChange(page - 1)}
						>
							<ChevronLeft />
						</Button>
						<PageField
							page={page}
							pageCount={pageCount}
							onPageChange={onPageChange}
						/>
						<Button
							variant="outline"
							size="icon-xs"
							disabled={page >= pageCount}
							aria-label="Older visits"
							onClick={() => onPageChange(page + 1)}
						>
							<ChevronRight />
						</Button>
					</div>
				) : null}
			</div>

			{visits.length === 0 ? (
				<EmptyNote>No visits recorded yet.</EmptyNote>
			) : (
				<ul
					aria-busy={loading}
					className={`mt-(--page-gap) space-y-1 transition-opacity ${loading ? "opacity-50" : ""}`}
				>
					{visits.map((visit) => {
						const date = new Date(`${visit.date}T00:00:00`);
						const dateLabel = date.toLocaleDateString([], {
							month: "long",
							day: "numeric",
							year: "numeric",
						});
						const time = formatVisitTime(visit.time);

						return (
							<li
								key={`${visit.date}-${visit.time}`}
								aria-label={`${dateLabel} at ${time}${visit.confidence != null ? `, ${formatConfidence(visit.confidence)} confidence` : ""}`}
								// 7px rather than the usual 10px, so ten rows take the
								// height nine used to and the card doesn't grow.
								//
								// Under 26rem the row can't hold date, time column, pill and
								// a labelled button side by side, so the time and age tuck
								// under the date and the button drops its label. The row
								// keeps its height either way: two lines on both layouts.
								className="flex items-center @min-[26rem]:gap-3 gap-2 rounded-md @min-[26rem]:px-3 px-2 py-1.75 odd:bg-[var(--meadow)] even:bg-transparent"
							>
								<div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
									<Clock3 className="size-3.5 shrink-0 text-[var(--bark)]" />
									<div className="min-w-0">
										<time
											dateTime={visit.date}
											className="block truncate font-medium"
										>
											{dateLabel}
										</time>
										<div className="tabular-data @min-[26rem]:hidden truncate text-muted-foreground text-xs">
											{time} · {formatTimeAgo(visit.ageMs + offsetMs)}
										</div>
									</div>
								</div>

								<div className="@min-[26rem]:block hidden shrink-0 text-right">
									<div className="tabular-data text-sm">{time}</div>
									<div className="text-muted-foreground text-xs">
										{formatTimeAgo(visit.ageMs + offsetMs)}
									</div>
								</div>

								<ConfidencePill
									confidence={visit.confidence}
									className="shrink-0"
								/>
								<RecordingButton
									audioUrl={visit.audioUrl ?? null}
									labelClassName="@min-[26rem]:inline hidden"
									className="@min-[26rem]:w-auto w-6 @min-[26rem]:px-2.5 px-0"
								/>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

/**
 * "[ 12 ] / 1066": type a page and press Enter (or leave the field) to jump
 * there. Out-of-range and non-numeric entries snap to the nearest real page;
 * Escape puts the current page back.
 */
function PageField({
	page,
	pageCount,
	onPageChange,
}: {
	page: number;
	pageCount: number;
	onPageChange: (page: number) => void;
}) {
	const [draft, setDraft] = useState(String(page));
	useEffect(() => setDraft(String(page)), [page]);

	const commit = () => {
		const parsed = Number.parseInt(draft, 10);
		const next = Number.isNaN(parsed)
			? page
			: Math.min(Math.max(parsed, 1), pageCount);
		setDraft(String(next));
		if (next !== page) onPageChange(next);
	};
	const digits = String(pageCount).length;

	return (
		<div className="flex items-center gap-1.5 text-muted-foreground text-sm">
			<Input
				type="text"
				inputMode="numeric"
				aria-label={`Visit log page, of ${pageCount}`}
				value={draft}
				onChange={(event) => setDraft(event.target.value.replace(/D/g, ""))}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") commit();
					if (event.key === "Escape") setDraft(String(page));
				}}
				onFocus={(event) => event.target.select()}
				// Wide enough for the bird's largest page number, so it never
				// clips and paging never nudges the arrows.
				className="tabular-data h-6 px-1.5 text-center text-foreground"
				style={{ width: `calc(${digits}ch + 0.75rem + 2px)` }}
			/>
			<span className="tabular-data">/ {pageCount}</span>
		</div>
	);
}
