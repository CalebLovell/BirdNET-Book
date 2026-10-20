import {
	createFileRoute,
	Link,
	stripSearchParams,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Feather } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import {
	BestRecordingCard,
	BestRecordingCardSkeleton,
} from "~/components/best-recording-card.tsx";
import { CardHeader } from "~/components/card-header.tsx";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { Deferred } from "~/components/deferred.tsx";
import {
	DetectionsByHourCard,
	DetectionsByHourCardSkeleton,
} from "~/components/detections-by-hour-card.tsx";
import {
	DetectionsByMonthCard,
	DetectionsByMonthCardSkeleton,
} from "~/components/detections-by-month-card.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import { IndexDot } from "~/components/index-dot.tsx";
import { PageStatus } from "~/components/page-status.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { SpeciesActions } from "~/components/species-actions.tsx";
import { SpeciesImage } from "~/components/species-image.tsx";
import { Button } from "~/components/ui/button.tsx";
import { ButtonLink } from "~/components/ui/button-link.tsx";
import { PageStepper } from "~/components/ui/page-stepper.tsx";
import { ShellBar, ShellSized, ShellText } from "~/components/ui/shell.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip.tsx";
import { YearSelector } from "~/components/year-selector.tsx";
import { formatConfidence } from "~/lib/confidence.ts";
import { formatDate, formatDateTime, formatTime } from "~/lib/date-format.ts";
import { ebirdUrlFor } from "~/lib/ebird.ts";
import { EMPTY } from "~/lib/empty-messages.ts";
import { heatColor, heatColorAt } from "~/lib/heatmap.ts";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import { pageTitle } from "~/lib/page-title.ts";
import {
	getSpeciesDetail,
	getSpeciesVisits,
	type SpeciesDetail,
	VISITS_PAGE_SIZE,
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

export const Route = createFileRoute("/birds/$comName")({
	validateSearch: speciesDetailSearchSchema,
	search: {
		middlewares: [stripSearchParams({ year: DEFAULT_YEAR, visits: 1 })],
	},
	// The visit page is deliberately not a dep: paging the log fetches just
	// that page, rather than rerunning every query on the page. The loader still
	// reads it so a deep link to page 40 server-renders page 40.
	loaderDeps: ({ search }) => ({ year: search.year }),
	// Deferred: the page renders at once (see Deferred) and fills in when the
	// bird's detail arrives. Which means an unknown slug can't be thrown as the
	// router's not-found -- the loader has returned long before anyone knows --
	// so the page renders its not-found card in place instead.
	loader: ({ params, deps, location }) => ({
		result: getSpeciesDetail({
			data: {
				comNameSlug: params.comName,
				year: deps.year,
				visitsPage: (location.search as { visits?: number }).visits,
			},
		}),
	}),
	// The section name until the bird's own arrives with its detail; the page
	// sets that itself (see useBirdTitle).
	head: () => ({ meta: [{ title: pageTitle("Species") }] }),
	component: BirdPage,
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

function BirdPage() {
	const { result } = Route.useLoaderData();
	const { year } = Route.useSearch();

	// Keyed on the year, the one search the loader reruns for, so a new year
	// drops the page to its shell at once rather than holding the old one.
	return (
		<Deferred
			key={year}
			promise={result}
			shell={<SpeciesDetailShell year={year} />}
		>
			{(loaded) => <BirdResult result={loaded} />}
		</Deferred>
	);
}

function BirdResult({
	result,
}: {
	result: Awaited<ReturnType<typeof getSpeciesDetail>>;
}) {
	// The bird's own name once the slug has resolved -- for an undetected bird
	// too, since the catalog gave us the name even though the station has never
	// heard it.
	useBirdTitle(
		result.status === "detected"
			? result.detail.comName
			: result.status === "undetected"
				? result.comName
				: null,
	);

	if (result.status === "undetected") {
		return (
			<UndetectedSpecies comName={result.comName} sciName={result.sciName} />
		);
	}
	if (result.status !== "detected") return <SpeciesNotFound />;

	return <SpeciesDetailView detail={result.detail} />;
}

/** Names the tab after the bird once its detail is in. The route's own head
    can't: it renders before the deferred detail settles. */
function useBirdTitle(comName: string | null) {
	useEffect(() => {
		if (comName) document.title = pageTitle(comName);
	}, [comName]);
}

/**
 * The whole page before the bird arrives, laid out as the page lays it out,
 * every card its own skeleton of the loaded card's shape: the profile, the
 * year's heat map (its weekday labels and legend as themselves), Best
 * recording, the two charts and the visit log.
 */
function SpeciesDetailShell({ year }: { year: number }) {
	return (
		<div className="@container/species page-wrap pb-4">
			<section
				aria-busy="true"
				aria-label="Species profile"
				className={PROFILE_CARD_CLASS}
			>
				<div className="flex h-36 items-center justify-center overflow-hidden p-4 pb-0 sm:h-44 sm:pb-4">
					<ShellBar className="h-full w-36 rounded-md" />
				</div>
				<div
					aria-hidden="true"
					className="flex min-w-0 flex-col justify-center gap-3 p-4"
				>
					<div className="min-w-0">
						<ShellText
							className="display-title font-bold text-2xl sm:text-3xl"
							barClassName="w-64 max-w-full"
						/>
						<ShellText className="text-xs" barClassName="w-32" />
					</div>
					<ShellText className="text-sm" barClassName="w-80 max-w-full" />
					<div className="relative z-10 flex flex-wrap items-center gap-2">
						<ShellSized className="rounded-md">
							<Button variant="outline" icon={ExternalLink}>
								eBird
							</Button>
						</ShellSized>
					</div>
				</div>
			</section>

			<div className={COLUMNS_CLASS}>
				<section
					aria-busy="true"
					aria-label="Detection history"
					className="feature-card overflow-hidden rounded-md p-4"
				>
					<CardHeader title="Detection history" className="flex-wrap">
						<div className="-my-1">
							<ShellSized className="rounded-md">
								<YearSelector
									year={year}
									years={[year - 1, year]}
									onChange={() => {}}
								/>
							</ShellSized>
						</div>
					</CardHeader>
					<div aria-hidden="true" className="mt-(--page-gap) flex gap-2">
						<WeekdayLabels />
						<div className="min-w-0 flex-1 overflow-hidden pb-1">
							<div className="w-max">
								<div className="mb-1 h-3" />
								<div className="flex w-max gap-1">
									{Array.from({ length: weeksInYear(year) }, (_, week) => (
										<div
											// biome-ignore lint/suspicious/noArrayIndexKey: one column per week
											key={week}
											className="flex shrink-0 flex-col gap-1"
										>
											{Array.from({ length: 7 }, (_, day) => (
												<span
													// biome-ignore lint/suspicious/noArrayIndexKey: one square per day
													key={day}
													className="size-3 animate-pulse rounded-[3px] bg-muted"
												/>
											))}
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
					<div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 max-[400px]:mt-2">
						{/* The real line carries count figures, which set its height. */}
						<ShellText
							className="w-56 text-xs"
							barClassName="w-full"
							strut={<span className="count-figure">&nbsp;</span>}
						/>
						<HeatLegend />
					</div>
				</section>

				<BestRecordingCardSkeleton />

				<div className="grid min-w-0 @min-[80rem]/species:grid-rows-2 gap-(--page-gap)">
					<DetectionsByHourCardSkeleton className="@min-[80rem]/species:min-h-0" />
					<DetectionsByMonthCardSkeleton className="@min-[80rem]/species:min-h-0" />
				</div>

				<VisitLogSkeleton />
			</div>
		</div>
	);
}

/** Weeks the heat map draws for a year: Sunday-aligned columns across Jan 1
    to Dec 31, or, for the year under way, across the 365 days to today (the
    rolling year getYearTrend returns for it). */
function weeksInYear(year: number): number {
	// Midnights, as buildHeatMap's buckets are: measuring to the current time
	// of day counted an extra day, and now and then an extra week column --
	// which widened the heat map's column and shifted the page on load.
	const today = new Date();
	const end =
		year === CURRENT_YEAR
			? new Date(today.getFullYear(), today.getMonth(), today.getDate())
			: new Date(year, 11, 31);
	const start =
		year === CURRENT_YEAR
			? new Date(end.getFullYear(), end.getMonth(), end.getDate() - 364)
			: new Date(year, 0, 1);
	// Columns from the Sunday on or before `start` through the week holding `end`.
	const sunday = new Date(start);
	sunday.setDate(sunday.getDate() - sunday.getDay());
	const span = Math.round((end.getTime() - sunday.getTime()) / 86_400_000);
	return Math.floor(span / 7) + 1;
}

/** The visit log's rows, as the loaded log draws them (see VisitLogCard). */
function VisitLogSkeleton() {
	return (
		<section
			aria-busy="true"
			aria-label="Visit log"
			className={VISIT_LOG_CLASS}
		>
			<div className={VISIT_LOG_HEADER_CLASS}>
				<div className="island-kicker">Visit log</div>
				<ShellText
					className="w-16 text-xs"
					barClassName="right-0 left-auto w-full"
				/>
			</div>
			<ul aria-hidden="true" className="-mx-(--page-gap) divide-y">
				{Array.from({ length: VISITS_PAGE_SIZE }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static decoration
					<li key={index} className={VISIT_ROW_CLASS}>
						<ShellBar className="h-6 w-7 shrink-0 rounded-full" />
						<div className="min-w-0 flex-1 text-sm">
							<ShellText
								className="font-medium"
								barClassName="w-48 max-w-full"
							/>
							<ShellText className="text-xs" barClassName="w-20" />
						</div>
						<ShellSized className="rounded-full">
							<ConfidencePill confidence={0.9} className="shrink-0" />
						</ShellSized>
						<ShellSized className="rounded-md">
							<RecordingButton audioUrl={null} {...VISIT_ROW_BUTTON} />
						</ShellSized>
					</li>
				))}
			</ul>
			<div className={VISIT_LOG_FOOTER_CLASS}>
				<span className="ml-auto">
					<ShellSized className="rounded-md">
						<PageStepper
							label="Visit log pages"
							page={1}
							// A heard bird's log runs to many pages, which is what
							// sets the stepper's width.
							pageCount={100}
							onPageChange={() => {}}
						/>
					</ShellSized>
				</span>
			</div>
		</section>
	);
}

/**
 * A bird the installed model knows about that this station has never heard.
 * Not an error card: it is the same profile hero a heard bird opens with --
 * portrait, name, eBird link -- with "not heard yet" where the last-heard line
 * would be, because someone arriving here is usually waiting on exactly this
 * species rather than recovering from a typo.
 */
function UndetectedSpecies({
	comName,
	sciName,
}: {
	comName: string;
	sciName: string;
}) {
	return (
		<div className="page-wrap pb-4">
			<section
				aria-label="Species profile"
				className="feature-card mt-(--page-gap) grid overflow-hidden rounded-md sm:grid-cols-[12rem_minmax(0,1fr)]"
			>
				<div className="flex h-36 items-center justify-center overflow-hidden p-4 pb-0 sm:h-44 sm:pb-4">
					<SpeciesImage
						imageUrl={illustrationUrlFor(sciName)}
						alt={comName}
						glyphClassName="size-16"
						cropToPainting
					/>
				</div>

				<div className="flex min-w-0 flex-col justify-center gap-3 p-4">
					<div className="min-w-0">
						<h1 className="display-title font-bold text-2xl text-[var(--moss)] sm:text-3xl">
							{comName}
						</h1>
						<p className="text-[var(--bark)] text-xs italic">{sciName}</p>
					</div>
					<p className="text-muted-foreground text-sm">
						Not detected at this station yet. It will appear here the first time
						it is heard.
					</p>
					<SpeciesActions
						ebirdUrl={ebirdUrlFor(sciName, comName)}
						comName={comName}
					/>
				</div>
			</section>
		</div>
	);
}

/**
 * The slug matched no bird the installed classifier can even emit. Like the
 * profile it stands in for, it carries no "All Birds" masthead -- this is a
 * bird's page, so the card is the page and owns its h1.
 */
function SpeciesNotFound() {
	const { comName } = Route.useParams();

	return (
		<div className="page-wrap py-4">
			<PageStatus
				tone="missing"
				title="No such species"
				actions={
					<ButtonLink to="/birds" size="sm" icon={Feather}>
						Browse all species
					</ButtonLink>
				}
			>
				“{comName}” doesn’t match any bird this station’s classifier knows
				about. The address may be mistyped.
			</PageStatus>
		</div>
	);
}

function SpeciesDetailView({ detail }: { detail: SpeciesDetail }) {
	const { year, visits: visitsPage } = Route.useSearch();
	const navigate = Route.useNavigate();
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
			resetScroll: false,
		});
	const selectVisitsPage = (next: number) =>
		navigate({
			search: (prev) => ({ ...prev, visits: next }),
			replace: true,
			resetScroll: false,
		});

	return (
		<TooltipProvider>
			<div className="@container/species page-wrap pb-4">
				<SummaryCard detail={detail} />

				{/* Two columns only once the page is wide enough (80rem) for a full
				    year of heat map (~920px card) beside the 20rem column; any
				    narrower and the side column squeezes the heat map into a
				    scroller, so stack instead. One column uses `minmax(0,1fr)`
				    rather than the implicit `auto` track: an auto track sizes to the
				    heat map's min-content, which pushed every card off a phone
				    screen instead of letting the heat map scroll inside its card. */}
				<div className={COLUMNS_CLASS}>
					<section
						aria-label="Detection history"
						className="feature-card overflow-hidden rounded-md p-4"
					>
						<CardHeader title="Detection history" className="flex-wrap">
							<div className="-my-1">
								<YearSelector
									year={year}
									years={detail.availableYears}
									onChange={selectYear}
								/>
							</div>
						</CardHeader>

						{/* The weekday labels sit outside the scroller, so they stay put
						    while a phone scrolls through the weeks. The month row is a
						    fixed 12px (plus its 4px margin) so the labels' pt-4 lines Sun
						    up with the first row of squares. */}
						<div className="mt-(--page-gap) flex gap-2">
							<WeekdayLabels />
							<div
								ref={heatScrollRef}
								className="min-w-0 flex-1 overflow-x-auto pb-1"
							>
								<div className="w-max">
									<div className="mb-1 flex h-3 gap-1 leading-3">
										{/* A label in the last column hangs leftwards over the
										    empty cells before it; hanging right would widen the
										    scroller past the squares and force a scrollbar. */}
										{weeks.map((week, index) => (
											<div
												key={`month-${week.days[0].date.toISOString()}`}
												className={`flex w-3 shrink-0 whitespace-nowrap text-[10px] text-muted-foreground ${index === weeks.length - 1 ? "justify-end" : ""}`}
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
						{/* The bird's all-time tally on the left, the legend held right;
						    the tally wraps above the legend when they can't share a line. */}
						<div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 max-[400px]:mt-2">
							<StationRecord detail={detail} />
							<HeatLegend />
						</div>
					</section>

					<BestRecordingCard
						recording={detail.bestRecording}
						speciesName={detail.comName}
					/>

					{/* The hour/month charts and the visit log share the same two
					    columns as the row above -- one grid, so the heat map and the
					    charts line up on the left and Best recording and the visit log
					    line up on the right. min-w-0 lets the charts conform to the
					    left track rather than widen it. */}
					<div className="grid min-w-0 @min-[80rem]/species:grid-rows-2 gap-(--page-gap)">
						<DetectionsByHourCard
							activity={detail.hourActivity}
							className="@min-[80rem]/species:min-h-0"
						/>

						<DetectionsByMonthCard
							trend={detail.detectionTrend}
							className="@min-[80rem]/species:min-h-0"
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

/** Samples of the continuous ramp for the "Less … More" key. */
const LEGEND_SHARES = [0, 0.25, 0.5, 0.75, 1] as const;

/** The "Less … More" key. Needs no data, so the skeleton draws it as itself. */
function HeatLegend() {
	return (
		<div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
			<span>Less</span>
			{LEGEND_SHARES.map((share) => (
				<span
					key={share}
					className="size-3 rounded-[3px] border border-[var(--line)]"
					style={{ backgroundColor: heatColorAt(share) }}
				/>
			))}
			<span>More</span>
		</div>
	);
}

/** The heat map's row labels, outside its scroller. Drawn as themselves by
    the skeleton too. */
function WeekdayLabels() {
	return (
		<div className="flex w-7 shrink-0 flex-col gap-1 pt-4 text-[9px] text-muted-foreground leading-3">
			<span>Sun</span>
			<span>Mon</span>
			<span>Tue</span>
			<span>Wed</span>
			<span>Thu</span>
			<span>Fri</span>
			<span>Sat</span>
		</div>
	);
}

// Shared by the loaded page and its skeleton, so the two are one shape.
const PROFILE_CARD_CLASS =
	"feature-card mt-(--page-gap) grid overflow-hidden rounded-md sm:grid-cols-[12rem_minmax(0,1fr)]";
const COLUMNS_CLASS =
	"mt-(--page-gap) grid @min-[80rem]/species:grid-cols-[minmax(0,max-content)_minmax(20rem,1fr)] grid-cols-[minmax(0,1fr)] items-stretch gap-(--page-gap)";
const VISIT_LOG_BASE_CLASS =
	"@container feature-card flex flex-col rounded-md p-4";
const VISIT_LOG_CLASS = `${VISIT_LOG_BASE_CLASS} min-h-[420px]`;
const VISIT_LOG_SHORT_CLASS = `${VISIT_LOG_BASE_CLASS} self-start`;
const VISIT_LOG_HEADER_CLASS =
	"-mx-(--page-gap) -mt-(--page-gap) flex min-h-[45px] flex-wrap items-center justify-between gap-2 border-b px-(--page-gap)";
const VISIT_ROW_CLASS =
	"flex items-center @min-[26rem]:gap-3 gap-2 px-(--page-gap) py-1.75";
const VISIT_ROW_BUTTON = {
	labelClassName: "@min-[26rem]:inline hidden",
	className: "@min-[26rem]:w-auto w-6 @min-[26rem]:px-2.5 px-0",
};
const VISIT_LOG_FOOTER_CLASS =
	"-mx-(--page-gap) mt-auto -mb-(--page-gap) flex shrink-0 items-center border-t px-(--page-gap) py-2";

const SWATCH =
	"size-3 rounded-[3px] border border-[var(--line)] transition-[outline] hover:z-10 hover:outline hover:outline-2 hover:outline-[var(--hover-line)] hover:outline-offset-1";

/**
 * One square of the contribution grid. Every day links into that day's
 * Timeline, quiet days included: a day without this bird still has the rest
 * of the station's detections to read.
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
	const dateLabel = formatDate(bucketForDate(date));
	const noun = count === 1 ? "detection" : "detections";
	const label = `${dateLabel}: ${count.toLocaleString()} ${noun}`;
	const fill = { backgroundColor: heatColor(count, maximum) };

	// Inside the link the swatch is decoration: the link already carries the
	// label, and repeating it would have a screen reader read the day twice.
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Link
					to="/timeline"
					search={{ period: "day", date: bucketForDate(date) }}
					aria-label={label}
					className="block"
				>
					<div aria-hidden="true" className={SWATCH} style={fill} />
				</Link>
			</TooltipTrigger>
			<TooltipContent>
				{dateLabel} — {count.toLocaleString()} {noun}
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * The species masthead: the portrait, and beside it the name, when it was last
 * heard and the eBird link. Just the bird -- its all-time figures sit under
 * the detection history, and the recording lives in the visit log below.
 */
function SummaryCard({ detail }: { detail: SpeciesDetail }) {
	// The once-a-second age tick lives here, not on the page: ticking the page
	// re-rendered every heat-map square and chart each second, a ~90ms stall
	// that made anything animating on it (a spectrogram's playhead) stutter.
	const offsetMs = useAgeOffset(detail.generatedAt);
	// The most recent visit is the same detection as `lastDetected`, and it is the
	// only one carrying a server-measured age, so the relative label agrees with
	// the visit log instead of drifting.
	const lastVisit = detail.recentVisits[0];
	const lastHeard = lastVisit
		? formatTimeAgo(lastVisit.ageMs + offsetMs)
		: formatHeardDate(detail.lastDetected.date);
	return (
		<section aria-label="Species profile" className={PROFILE_CARD_CLASS}>
			{/* The portrait's own column -- above the text on a phone, where the
			    column becomes a band, and beside it from sm up. Either way the
			    bird is centred in its column, so a narrow painting doesn't sit
			    hard left with a gap pooled between it and the name. A fixed
			    height, as on the Today hero, so the illustration's own size never
			    sets the card's. */}
			<div className="flex h-36 items-center justify-center overflow-hidden p-4 pb-0 sm:h-44 sm:pb-4">
				<SpeciesImage
					imageUrl={detail.imageUrl}
					alt={detail.comName}
					glyphClassName="size-16"
					cropToPainting
				/>
			</div>

			{/* Centred against the portrait, which is usually the taller of the
			    two, so the text doesn't sit high with a gap pooled beneath it. */}
			<div className="flex min-w-0 flex-col justify-center gap-3 p-4">
				<div className="min-w-0">
					<h1 className="display-title font-bold text-2xl text-[var(--moss)] sm:text-3xl">
						{detail.comName}
					</h1>
					<p className="text-[var(--bark)] text-xs italic">{detail.sciName}</p>
				</div>

				{/* Only the moments are bold; the phrasing around them stays muted. */}
				<p className="tabular-data text-muted-foreground text-sm">
					Last heard{" "}
					<span className="font-semibold text-foreground">{lastHeard}</span>
					{lastVisit && detail.lastDetected.date ? (
						<>
							{" "}
							on{" "}
							<span className="font-semibold text-foreground">
								{formatDate(detail.lastDetected.date)}
							</span>
							{detail.lastDetected.time ? (
								<>
									{" "}
									at{" "}
									<span className="font-semibold text-foreground">
										{formatTime(detail.lastDetected.time)}
									</span>
								</>
							) : null}
						</>
					) : null}
				</p>
				{/* Every row of the column on one even step; the eBird link takes its
				    own row under the last-heard line rather than the card's far edge. */}
				<SpeciesActions ebirdUrl={detail.ebirdUrl} comName={detail.comName} />
			</div>
		</section>
	);
}

/**
 * The bird's whole record at this station, under its heat map: how many times
 * it has been detected, and how many days from its first detection to its
 * latest. All-time, whichever year the heat map is showing.
 */
function StationRecord({ detail }: { detail: SpeciesDetail }) {
	const days = daysBetween(detail.firstDetected.date, detail.lastDetected.date);

	return (
		<p className="tabular-data text-muted-foreground text-xs">
			<span className="count-figure">
				{detail.totalDetections.toLocaleString()}
			</span>{" "}
			{detail.totalDetections === 1 ? "detection" : "detections"}
			{days === null ? null : (
				<>
					{" "}
					over <span className="count-figure">{days.toLocaleString()}</span>{" "}
					{days === 1 ? "day" : "days"} on record
				</>
			)}
		</p>
	);
}

/** Days from the first detection to the last, counting both ends: a bird heard
 * on a single day has one day on record. Null when either date is missing. */
function daysBetween(first: string, last: string): number | null {
	if (!first || !last) return null;
	const start = Date.parse(`${first}T00:00:00Z`);
	const end = Date.parse(`${last}T00:00:00Z`);
	if (Number.isNaN(start) || Number.isNaN(end)) return null;
	return Math.round((end - start) / 86_400_000) + 1;
}

function formatHeardDate(date: string): string {
	return date ? formatDate(date) : "—";
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
	// Each row's place in the bird's whole history, 1 = newest, so the number
	// keeps counting across pages.
	const firstIndex = (shown.page - 1) * VISITS_PAGE_SIZE + 1;
	const lastIndex = firstIndex + visits.length - 1;

	return (
		<section
			aria-label="Visit log"
			// A container, because the log's width depends on the grid track it
			// lands in more than on the screen: it gets ~18rem both on a phone and
			// in the right-hand column at lg, and the whole content width between.
			//
			// A log that fits on one page hugs its rows: stretched to the charts'
			// height beside it, a short log would end in a block of empty card.
			// Paged logs keep the full height so the stepper never jumps. With no
			// footer to close it, the card drops its bottom padding, so the last
			// row ends on its own padding like every other row. (Important, to beat
			// the phone-width `.feature-card.p-4` padding rule.)
			className={
				pageCount > 1
					? VISIT_LOG_CLASS
					: `${VISIT_LOG_SHORT_CLASS} ${visits.length > 0 ? "pb-0!" : ""}`
			}
		>
			{/* The footer's twin: the same full-width hairline and the same 45px
			    band, rule included, so the log is bookended evenly. */}
			<div className={VISIT_LOG_HEADER_CLASS}>
				<div className="island-kicker">Visit log</div>
				{totalVisits > 0 ? (
					<div className="tabular-data text-muted-foreground text-xs">
						{totalVisits.toLocaleString()}{" "}
						{totalVisits === 1 ? "visit" : "visits"}
					</div>
				) : null}
			</div>

			{visits.length === 0 ? (
				<EmptyNote>{EMPTY.window.birdVisits}</EmptyNote>
			) : (
				<ul
					aria-busy={loading}
					className={`-mx-(--page-gap) divide-y transition-opacity ${loading ? "opacity-50" : ""}`}
				>
					{visits.map((visit, i) => {
						const heardAt = formatDateTime(visit.date, visit.time);

						return (
							<li
								key={`${visit.date}-${visit.time}`}
								aria-label={`${heardAt}${visit.confidence != null ? `, ${formatConfidence(visit.confidence)} confidence` : ""}`}
								// 7px rather than the usual 10px, so ten rows take the
								// height nine used to and the card doesn't grow.
								//
								// The moment it was heard over how long ago that was: two
								// lines at every width. Under 26rem the button drops its
								// label to make room.
								//
								// The dividers run out to the card's edges (the list
								// bleeds through the card's padding), and the row's own
								// padding hands that page gap back (the card's own padding, which
								// halves on the smallest phones) so the content lines up with
								// the header and footer and never pokes past the card's border.
								className={VISIT_ROW_CLASS}
							>
								<IndexDot index={firstIndex + i} widest={lastIndex} />
								<div className="min-w-0 flex-1 text-sm">
									{/* The day links to its Timeline, like the detections
										    table's Recorded column and the heat map's squares. */}
									<Link
										to="/timeline"
										search={{ period: "day", date: visit.date }}
										className="block max-w-fit truncate font-medium no-underline hover:underline"
									>
										<time dateTime={`${visit.date}T${visit.time}`}>
											{heardAt}
										</time>
									</Link>
									<div className="truncate text-muted-foreground text-xs">
										{formatTimeAgo(visit.ageMs + offsetMs)}
									</div>
								</div>

								<ConfidencePill
									confidence={visit.confidence}
									className="shrink-0"
								/>
								<RecordingButton
									audioUrl={visit.audioUrl ?? null}
									speciesName={comName}
									{...VISIT_ROW_BUTTON}
								/>
							</li>
						);
					})}
				</ul>
			)}

			{/* The detections table's pager, in a footer like the table's: a
			    hairline across the card's full width, the stepper held right, and
			    `mt-auto` pinning it to the card's bottom on a short last page. */}
			{pageCount > 1 ? (
				<div className={VISIT_LOG_FOOTER_CLASS}>
					<PageStepper
						className="ml-auto"
						label="Visit log pages"
						page={page}
						pageCount={pageCount}
						onPageChange={onPageChange}
					/>
				</div>
			) : null}
		</section>
	);
}
