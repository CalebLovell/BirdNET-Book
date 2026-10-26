import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ArrowRight, CalendarRange, LayoutDashboard, List } from "lucide-react";
import { z } from "zod";
import { Deferred, SHELL_DELAY_MS } from "~/components/deferred.tsx";
import {
	DetectionsByHourCard,
	DetectionsByHourCardSkeleton,
} from "~/components/detections-by-hour-card.tsx";
import { HighlightsCard } from "~/components/highlights-card.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { ShareButton, useShare } from "~/components/share-button.tsx";
import { InMenuBar } from "~/components/sidebar/mobile-nav.tsx";
import {
	SpeciesByHourCard,
	SpeciesByHourCardSkeleton,
} from "~/components/species-by-hour-card.tsx";
import {
	SpeciesGrid,
	type SpeciesGridItem,
	SpeciesGridSkeleton,
} from "~/components/species-grid.tsx";
import { StatusPage } from "~/components/status-page.tsx";
import { PeriodToolbar } from "~/components/timeline/period-toolbar.tsx";
import { ButtonLink } from "~/components/ui/button-link.tsx";
import { ShellFigure } from "~/components/ui/shell.tsx";
import { TooltipProvider } from "~/components/ui/tooltip.tsx";
import { getDayShareCard } from "~/lib/day-share.ts";
import { formatDayTitle } from "~/lib/day-title.ts";
import { EMPTY } from "~/lib/empty-messages.ts";
import type { HighlightThresholds } from "~/lib/highlight-thresholds.ts";
import { PAGE_HEADERS } from "~/lib/page-headers.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { formatShareCard } from "~/lib/share-card.ts";
import type { HourActivity } from "~/lib/stats-data.ts";
import type { TimelineData, TimelineRow } from "~/lib/timeline.ts";
import {
	type DayOutOfRange,
	getTimelinePage,
	type TimelinePageData,
} from "~/lib/timeline-page.ts";
import {
	TIMELINE_PERIOD_LABELS,
	TIMELINE_PERIODS,
	type TimelinePeriod,
} from "~/lib/timeline-periods.ts";
import { formatTimelineShareCard } from "~/lib/timeline-share.ts";
import {
	currentAnchor,
	isValidAnchor,
	spelledDate,
	windowFor,
} from "~/lib/timeline-window.ts";
import { useBirdFavicon } from "~/lib/use-favicon.ts";
import { useSettled } from "~/lib/use-settled.ts";
import { cn } from "~/lib/utils.ts";

const DEFAULT_PERIOD: TimelinePeriod = "day";

/**
 * Which body to draw for the window: the species x hour heat map, or the grid
 * of everything heard. Only one shows at a time; the other is a click away on
 * the view toggle. Lives in the URL alongside period and date so a link carries
 * the whole view, not just the window.
 */
const TIMELINE_VIEWS = ["hours", "grid"] as const;
type TimelineView = (typeof TIMELINE_VIEWS)[number];
const DEFAULT_VIEW: TimelineView = "hours";

const timelineSearchSchema = z.object({
	period: z
		.enum(TIMELINE_PERIODS)
		.default(DEFAULT_PERIOD)
		.catch(DEFAULT_PERIOD),
	view: z.enum(TIMELINE_VIEWS).default(DEFAULT_VIEW).catch(DEFAULT_VIEW),
	/**
	 * Which window of the period to show, in that period's own notation (see
	 * TimelineAnchor). Absent means the one containing today, so a bare
	 * /timeline link stays current instead of freezing on whatever day it was
	 * written.
	 */
	// Coerced, not plain string: a bare year in a hand-written link
	// (?date=2019) parses as a number, and rejecting it would silently snap the
	// page back to today.
	date: z.coerce.string().optional().catch(undefined),
});

/**
 * Falls back to today's window when the URL names none, and to today's window
 * again when it holds an anchor left over from a different period (switching
 * Monthly -> Daily mid-navigation) or plain garbage.
 *
 * The day period is the exception: it is the one scope that can tell you *why*
 * a date is unusable -- not a date at all, still ahead, or before the station
 * was listening -- so a value it cannot read travels on to be judged rather
 * than being silently swapped for today. Quietly showing a different day than
 * the address asked for is the worse failure.
 */
function resolveAnchor(period: TimelinePeriod, date: string | undefined) {
	if (!date) return currentAnchor(period);
	if (isValidAnchor(period, date)) return date;
	return period === "day" ? date : currentAnchor(period);
}

export const Route = createFileRoute("/timeline")({
	head: () => ({ meta: [{ title: pageTitle("Timeline") }] }),
	validateSearch: timelineSearchSchema,
	search: {
		middlewares: [
			stripSearchParams({ period: DEFAULT_PERIOD, view: DEFAULT_VIEW }),
		],
	},
	loaderDeps: ({ search }) => ({
		period: search.period,
		anchor: resolveAnchor(search.period, search.date),
	}),
	// Deferred: the page renders at once (see Deferred), and its cards fill in
	// as the window's data arrives.
	loader: ({ deps }) => ({ page: getTimelinePage({ data: deps }) }),
	component: Timeline,
});

function Timeline() {
	const { page } = Route.useLoaderData();
	const settled = useSettled(page);
	const search = Route.useSearch();
	const { period, view } = search;
	const anchor = resolveAnchor(period, search.date);
	const navigate = Route.useNavigate();
	// The window's most-heard bird (rows come busiest first), held over from the
	// last window while the next one loads so the tab doesn't flash the nest.
	const shown = settled?.value.body;
	useBirdFavicon(
		shown && shown.kind !== "day-out-of-range"
			? (shown.rows[0]?.imageUrl ?? null)
			: null,
	);

	const show = (next: {
		period?: TimelinePeriod;
		date?: string;
		view?: TimelineView;
	}) =>
		navigate({
			search: (prev) => ({ ...prev, ...next }),
			replace: true,
			resetScroll: false,
		});

	// A date the station could never have recorded is the one case with nothing
	// to say at all -- no figures, no window, no grid -- so it replaces the page
	// rather than sitting inside it.
	if (settled?.current && settled.value.body.kind === "day-out-of-range") {
		return <OutOfRangeDay result={settled.value.body.result} date={anchor} />;
	}

	return (
		<TooltipProvider>
			<div className="page-wrap space-y-(--page-gap) py-4">
				<TimelineHeader
					data={settled?.current ? settled.value : null}
					staleData={settled?.value ?? null}
					period={period}
					anchor={anchor}
					onChange={show}
				/>

				{/* A new period or date keeps the old window's cards up for a
				    moment: most windows answer well inside it and swap straight in,
				    rather than flashing their shells for a frame. One that takes
				    longer drops to the shells, so the old window never passes for
				    the new one for long. */}
				<Deferred
					promise={page}
					shellAfterMs={SHELL_DELAY_MS}
					shell={
						<TimelineCardsShell
							period={period}
							view={view}
							onViewChange={(next) => show({ view: next })}
						/>
					}
				>
					{(data) =>
						data.body.kind === "day-out-of-range" ? null : (
							// A station with nothing recorded yet draws the same cards as a
							// quiet window, each saying so, so the page holds the shape its
							// shells promised and every control stays usable.
							<TimelineCards
								rows={data.body.rows}
								highlights={data.body.highlights}
								thresholds={data.body.thresholds}
								period={data.period}
								jumpTo={jumpTarget(data)}
								windowLabel={data.window?.label ?? null}
								stationEmpty={!data.hasAnyDetections}
								view={view}
								onViewChange={(next) => show({ view: next })}
							/>
						)
					}
				</Deferred>
			</div>
		</TooltipProvider>
	);
}

/**
 * The cards as TimelineCards lays them out, each its own skeleton: the body
 * in the view the URL asks for, with the real view toggle and the window's
 * figures blurred in its header, then the Highlights and the hour chart.
 */
function TimelineCardsShell({
	period,
	view,
	onViewChange,
}: {
	period: TimelinePeriod;
	view: TimelineView;
	onViewChange: (next: TimelineView) => void;
}) {
	const toggle = <ViewToggle view={view} onViewChange={onViewChange} />;
	const summary = <WindowSummary rows={null} />;
	return (
		<div className="min-[1800px]:flex min-[1800px]:items-start min-[1800px]:gap-4">
			{view === "hours" ? (
				<SpeciesByHourCardSkeleton
					summary={summary}
					action={toggle}
					className={BODY_CARD_WIDTH}
				/>
			) : (
				<SpeciesGridSkeleton
					summary={summary}
					action={toggle}
					className={BODY_CARD_WIDTH}
				/>
			)}
			<div className="mt-(--page-gap) grid min-w-0 gap-(--page-gap) md:max-[1799px]:grid-cols-2 min-[1800px]:mt-0 min-[1800px]:flex-1">
				<HighlightsCard
					highlights={null}
					period={period}
					emptyMessage=""
					className="self-start"
				/>
				<DetectionsByHourCardSkeleton className={HOUR_CARD_SIZE} />
			</div>
		</div>
	);
}

const PERIOD_NOUNS: Record<Exclude<TimelinePeriod, "all">, string> = {
	day: "day",
	week: "week",
	month: "month",
	year: "year",
};

type JumpTarget = {
	anchor: string;
	direction: "last" | "next";
	noun: string;
	label: string;
};

/**
 * Where an empty window points: the nearest one that heard something, earlier
 * first -- usually that's today, or this week, before the station has woken
 * up. Null when the window has rows, or for All Time, which is never empty
 * while the station has recorded anything.
 */
function jumpTarget(data: TimelinePageData): JumpTarget | null {
	const { period } = data;
	if (period === "all" || data.body.kind !== "rows") return null;
	if (data.body.rows.length > 0) return null;
	const [anchor, direction] = data.prevAnchor
		? [data.prevAnchor, "last" as const]
		: data.nextAnchor
			? [data.nextAnchor, "next" as const]
			: [null, null];
	if (!anchor || !direction) return null;
	return {
		anchor,
		direction,
		noun: PERIOD_NOUNS[period],
		label:
			period === "day" ? spelledDate(anchor) : windowFor(period, anchor).label,
	};
}

/**
 * The masthead for every period: the standard page header, with the selected
 * window as the title, the granularity named beneath it, and the share control
 * set against the title. The window's figures no longer live here -- they ride
 * the body card's kicker (see WindowSummary), against the species they count.
 */
function TimelineHeader({
	data,
	staleData,
	period,
	anchor,
	onChange,
}: {
	/** This window's page, once it has arrived. */
	data: TimelinePageData | null;
	/** The latest page to arrive, perhaps for the window before this one --
	    enough to keep the toolbar drawn while this window loads. */
	staleData: TimelinePageData | null;
	period: TimelinePeriod;
	anchor: string;
	onChange: (next: { period?: TimelinePeriod; date?: string }) => void;
}) {
	const rows = data?.body.kind === "rows" ? data.body.rows : [];
	const highlights = data?.body.kind === "rows" ? data.body.highlights : [];
	const toolbarData = data ?? staleData;

	// Both cards carry the window's Highlights, which the page has already
	// loaded for its own Highlights card, so the share says what the page says.
	// Until this window's page is in, there is nothing true to share: the rows
	// and window label below would still be empty.
	const shareSubject = data ? `${period}:${anchor}` : null;
	const loadShare = async () =>
		period === "day"
			? formatShareCard({
					...(await getDayShareCard({ data: anchor })),
					highlights,
					heading: headerLines(period, anchor),
				})
			: formatTimelineShareCard({
					period,
					heading: headerLines(period, anchor),
					rows,
					highlights,
				});
	const share = useShare({ subject: shareSubject, load: loadShare });
	const canShare = data?.hasAnyDetections ?? false;

	return (
		<>
			{canShare && (
				<InMenuBar>
					<ShareButton state={share} shape="plain" />
				</InMenuBar>
			)}
			<PageHeaderCard
				icon={CalendarRange}
				title={headerTitle(period, anchor)}
				description={PAGE_HEADERS.timeline.description}
				// Below `xl` the menu bar carries it instead, where it has room.
				action={
					canShare ? (
						<ShareButton state={share} className="h-10 max-xl:hidden" />
					) : undefined
				}
				// Between the title and the body card, so the window it picks reads as
				// steering the figures and body beneath it. Gated on the station rather
				// than the window: an empty week still needs the switcher to reach a
				// window with something in it.
				//
				// Drawn at once: the period and the window come from the URL. While
				// this window's page is on its way it draws from the last one to
				// arrive (or from nothing, on the first), and what it can't know yet
				// -- where the arrows lead, the station's first and last days -- waits
				// for the data. A station that has recorded nothing keeps it too, so
				// the page reads the same before and after its first bird.
				afterHeader={
					<PeriodToolbar
						period={period}
						anchor={anchor}
						window={data ? data.window : safeWindow(period, anchor)}
						lastActiveDay={data?.lastActiveDay ?? null}
						stationRange={toolbarData?.stationRange ?? null}
						onChange={onChange}
					/>
				}
			/>
		</>
	);
}

/**
 * The page's title: the scope, then the window -- "Daily — August 26th, 2026".
 * "all" has no window to name, so it stops at the scope ("All Time"); every
 * other period appends the window label the picker moves through. The day title
 * drops the weekday the shared window label carries -- the "Daily" eyebrow
 * already says what kind of window this is.
 */
function headerTitle(period: TimelinePeriod, anchor: string): string {
	return headerLines(period, anchor).join(" — ");
}

/**
 * The header title's two halves -- the period, then the window it names -- so
 * the share card can stack them on their own lines and still match the page.
 */
function headerLines(period: TimelinePeriod, anchor: string): string[] {
	const scope = TIMELINE_PERIOD_LABELS[period];
	if (period === "all") return [scope];
	// Worked out here from the URL rather than waiting on the server's window,
	// so the title is right the moment the period or date changes. A Daily
	// anchor that isn't a date at all is shown as typed; the page beneath
	// explains it once the server has judged it.
	if (period === "day") {
		return [scope, isValidAnchor("day", anchor) ? spelledDate(anchor) : anchor];
	}
	return [scope, safeWindow(period, anchor)?.label ?? anchor];
}

/** The window an anchor names, or null for one that names none. */
function safeWindow(period: TimelinePeriod, anchor: string) {
	return isValidAnchor(period, anchor) ? windowFor(period, anchor) : null;
}

/**
 * The window's headline figures -- how many detections, across how many species
 * -- set beside the body card's kicker. This replaces the old four-figure
 * masthead row: the two numbers worth keeping now ride the card that actually
 * shows those species and their counts, so they read against the data rather
 * than floating above it. Both bodies (heat map and grid) get the same node, so
 * the view toggle never drops it. Derived from the already period-scoped rows,
 * so it moves with the period toggle without a second round trip.
 */
function WindowSummary({ rows }: { rows: TimelineRow[] | null }) {
	// Null while the window loads: the words are there at once, and only the
	// two figures wait, blurred.
	const detections = rows?.reduce((sum, row) => sum + row.totalDetections, 0);

	return (
		// Under 400px there's no room beside the kicker and the view switcher, so
		// the figures take their own line beneath both (the cards' header wraps
		// there), dropping the divider that only made sense beside the kicker.
		<div className="flex min-w-0 items-center gap-2.5 max-[400px]:order-last max-[400px]:basis-full">
			<span
				className="h-4 w-px shrink-0 bg-[var(--line)] max-[400px]:hidden"
				aria-hidden="true"
			/>
			{/* Lifted 1.5px so its ink centres on the kicker's. The boxes already
			    centre, but Georgia's lowercase and old-style figures sit low in theirs
			    next to the kicker's all-caps, so box-centred reads as dropped. */}
			<div className="flex -translate-y-[1.5px] items-center gap-2 truncate text-[13px] text-muted-foreground">
				<span className="whitespace-nowrap">
					{detections === undefined ? (
						<ShellFigure />
					) : (
						<span className="count-figure">{detections.toLocaleString()}</span>
					)}{" "}
					detections
				</span>
				<span
					className="size-[3px] shrink-0 rounded-full bg-muted-foreground opacity-60"
					aria-hidden="true"
				/>
				<span className="whitespace-nowrap">
					{rows ? (
						<span className="count-figure">{rows.length.toLocaleString()}</span>
					) : (
						<ShellFigure />
					)}{" "}
					species
				</span>
			</div>
		</div>
	);
}

/**
 * The window's body, one view at a time: either when each species was active
 * across the window's hours, or the grid of everything heard in it. The toggle
 * above swaps between them -- the same rows, drawn two ways, so only the one
 * you asked for takes up the page.
 */
function TimelineCards({
	rows,
	highlights,
	thresholds,
	period,
	jumpTo,
	windowLabel,
	stationEmpty,
	view,
	onViewChange,
}: {
	rows: TimelineRow[];
	highlights: TimelineData["highlights"];
	thresholds: HighlightThresholds;
	period: TimelinePeriod;
	/** The nearest window with detections, offered when this one has none. */
	jumpTo: JumpTarget | null;
	windowLabel: string | null;
	/** The station has recorded nothing at all, in any window. */
	stationEmpty: boolean;
	view: TimelineView;
	onViewChange: (next: TimelineView) => void;
}) {
	const emptyMessage = stationEmpty
		? EMPTY.station.detections
		: EMPTY.window.timelineWindow(windowLabel);
	// Only the body card carries the way out: a line naming the nearest window
	// that heard something, then a full-size button on its own line so it reads
	// as the next step rather than the tail of a sentence. The two cards beside
	// it just say they're empty.
	const emptyAction = jumpTo ? (
		<>
			<p className="text-muted-foreground text-sm">
				{jumpTo.direction === "last" ? "Last" : "Next"} {jumpTo.noun} with
				detections: {jumpTo.label}.
			</p>
			<ButtonLink
				to="/timeline"
				search={(prev) => ({ ...prev, date: jumpTo.anchor })}
				size="default"
				icon={ArrowRight}
				iconPosition="end"
				className="mt-(--page-gap)"
			>
				View {jumpTo.direction === "last" ? "last" : "next"} detections
			</ButtonLink>
		</>
	) : undefined;

	const gridItems: SpeciesGridItem[] = rows.map((row) => ({
		comName: row.comName,
		sciName: row.sciName,
		imageUrl: row.imageUrl,
		count: row.totalDetections,
		isNew: row.isNew,
		firstHeard: row.firstHeard,
		isRare: row.isRare,
		isConsistent: row.isConsistent,
		regularNote: row.regularNote,
		isReturned: row.isReturned,
		away: row.away,
		vocal: row.vocal,
		hourCounts: row.hourCounts,
	}));

	// Kept for a quiet window too: the shell drew both, so dropping them once
	// the data lands would change the card's header under the reader.
	const toggle = <ViewToggle view={view} onViewChange={onViewChange} />;
	const summary = <WindowSummary rows={rows} />;

	// The window's day for the side column's hour chart: every species summed,
	// hour by hour.
	const hourActivity: HourActivity[] = Array.from(
		{ length: 24 },
		(_, hour) => ({
			hour,
			count: rows.reduce((sum, row) => sum + (row.hourCounts[hour] ?? 0), 0),
		}),
	);

	const body =
		view === "hours" ? (
			<SpeciesByHourCard
				rows={rows}
				emptyMessage={emptyMessage}
				emptyAction={emptyAction}
				summary={summary}
				action={toggle}
				className={BODY_CARD_WIDTH}
			/>
		) : (
			<SpeciesGrid
				species={gridItems}
				emptyMessage={emptyMessage}
				emptyAction={emptyAction}
				summary={summary}
				action={toggle}
				className={BODY_CARD_WIDTH}
			/>
		);

	// On the widest screens the body sits on the left at one fixed width in both
	// views, so the toggle never shifts the column beside it: the window's
	// Highlights, then its detections by hour, stacked. Below that there isn't room
	// for the column beside the body, so the same two cards follow it
	// underneath, side by side from md (768px, roughly 360px each) up, each only
	// as tall as its own content -- Highlights doesn't stretch to the chart's
	// height and trail empty space, and the chart keeps its fixed height rather
	// than growing to a long Highlights card. Only on a phone do they stack.
	return (
		<div className="min-[1800px]:flex min-[1800px]:items-start min-[1800px]:gap-4">
			{body}
			{/* Drawn for a quiet window too, with the Activity card's own empty
			    line in each card, so the column holds its place instead of the page jumping when the
			    period steps from a window that heard something to one that
			    didn't. */}
			<div className="mt-(--page-gap) grid min-w-0 gap-(--page-gap) md:max-[1799px]:grid-cols-2 min-[1800px]:mt-0 min-[1800px]:flex-1">
				<HighlightsCard
					highlights={highlights}
					thresholds={thresholds}
					period={period}
					emptyMessage={emptyMessage}
					className="self-start"
				/>
				<DetectionsByHourCard
					activity={hourActivity}
					emptyMessage={emptyMessage}
					className={HOUR_CARD_SIZE}
				/>
			</div>
		</div>
	);
}

// The heat map's hours (24 fixed 1.75rem columns) and counts plus a generous
// name column: the heat map's names soak up whatever the hours and counts
// leave, so this width is really the room given to bird names -- enough that
// even long ones and an all-time count of eight or nine characters fit. The
// species grid takes the same width so the view toggle leaves the left card,
// and the column beside it, in place. That column only sits beside it from
// 1800px: below that, what's left beside a 72rem card is too narrow to hold
// anything, so its cards drop beneath the body instead.
const BODY_CARD_WIDTH = "min-w-0 min-[1800px]:w-[72rem] min-[1800px]:flex-none";

// One height for the hour chart, whatever sits beside it. The species page
// lets the same card stretch to its row; here a long Highlights card would
// pull it into a tall, mostly empty chart.
const HOUR_CARD_SIZE = "h-72 self-start";

const VIEW_META: Record<
	TimelineView,
	{
		label: string;
		/** A bulleted list for the one-bird-per-row view, uneven panels for the
		    species tiles. Both glyphs fill the same 18 of lucide's 24 units, so
		    they share one size. */
		icon: React.ComponentType<{ className?: string }>;
	}
> = {
	hours: {
		label: "List",
		icon: List,
	},
	grid: {
		label: "Grid",
		icon: LayoutDashboard,
	},
};

/**
 * Picks which body the window draws -- set against the card's title, top-right.
 * One bordered box split into two tabs, each only as wide as its icon and
 * word, with a hairline between them. Its corners match the period toolbar's
 * controls (rounded-md). Each tab carries its own see-through hairline, the
 * way the period toggle's items do, so the active tab's fill shows through
 * its border and runs right to the edge instead of sitting inside a pale
 * ring. Only the outer corners round; where the tabs meet they sit flush.
 * The active tab takes the moss fill with paper text -- the same on state as
 * the period toggle above the card -- so every "which view" control on the
 * page marks its choice the same way.
 *
 * Below 520px the words go (kept for screen readers) and each tab is just its
 * icon, so the pill shrinks to leave the kicker's figures room. Not sooner:
 * the kicker, the widest figures ("139,372 detections · 50 species", all
 * time) and the labelled pill still share one line down to about 513px.
 */
function ViewToggle({
	view,
	onViewChange,
}: {
	view: TimelineView;
	onViewChange: (next: TimelineView) => void;
}) {
	return (
		<div className="flex shrink-0 rounded-md bg-card">
			{TIMELINE_VIEWS.map((value) => {
				const { label, icon: Icon } = VIEW_META[value];
				const active = value === view;
				return (
					<button
						key={value}
						type="button"
						aria-pressed={active}
						onClick={() => !active && onViewChange(value)}
						className={cn(
							"flex h-6 items-center justify-center gap-1.5 whitespace-nowrap border border-[var(--line)] px-3 font-medium text-xs transition-colors first:rounded-l-md last:rounded-r-md max-[520px]:px-2.5 [&+&]:border-l-0",
							active
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-[var(--meadow)] hover:text-foreground",
						)}
					>
						<Icon className="size-[15.5px] shrink-0" aria-hidden="true" />
						<span className="max-[520px]:sr-only">{label}</span>
					</button>
				);
			})}
		</div>
	);
}

/**
 * A date outside the station's history. Not a page with empty cards on it: the
 * window itself is the thing that does not exist, so there is nothing to scope
 * and nothing to draw.
 */
function OutOfRangeDay({
	result,
	date,
}: {
	result: DayOutOfRange;
	date: string;
}) {
	switch (result.status) {
		case "future":
			return (
				<StatusPage
					icon={CalendarRange}
					section={PAGE_HEADERS.timeline.missingSection}
					sectionDescription={PAGE_HEADERS.timeline.missingDescription}
					tone="missing"
					title="That day hasn't happened yet"
				>
					{formatDayTitle(date)} is still ahead. There is nothing to review
					until the station has heard it.
				</StatusPage>
			);
		case "before-station":
			return (
				<StatusPage
					icon={CalendarRange}
					section={PAGE_HEADERS.timeline.missingSection}
					sectionDescription={PAGE_HEADERS.timeline.missingDescription}
					tone="missing"
					title="Before this station started listening"
				>
					{formatDayTitle(date)} predates the first recording. This station has
					been listening since {formatDayTitle(result.firstRecorded)}.
				</StatusPage>
			);
		default:
			return (
				<StatusPage
					icon={CalendarRange}
					section={PAGE_HEADERS.timeline.missingSection}
					sectionDescription={PAGE_HEADERS.timeline.missingDescription}
					tone="missing"
					title="That isn't a date"
				>
					“{date}” isn’t a valid date. Dates look like 2025-04-19.
				</StatusPage>
			);
	}
}
