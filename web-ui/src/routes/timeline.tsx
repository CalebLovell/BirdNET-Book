import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Bird, Grid3x3, LayoutDashboard } from "lucide-react";
import { z } from "zod";
import { DetectionsByHourRoseCard } from "~/components/detections-by-hour-rose-card.tsx";
import { EmptyState } from "~/components/empty-state.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { SpeciesByHourCard } from "~/components/species-by-hour-card.tsx";
import {
	SpeciesGrid,
	type SpeciesGridItem,
} from "~/components/species-grid.tsx";
import { StatusPage } from "~/components/status-page.tsx";
import { HighlightsCard } from "~/components/timeline/highlights-card.tsx";
import { PeriodToolbar } from "~/components/timeline/period-toolbar.tsx";
import { TooltipProvider } from "~/components/ui/tooltip.tsx";
import { useShareCard } from "~/components/use-share-card.tsx";
import { getDayShareCard } from "~/lib/day-share.ts";
import { formatDayTitle } from "~/lib/day-title.ts";
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
import { currentAnchor, isValidAnchor } from "~/lib/timeline-window.ts";
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
	loader: ({ deps }) => getTimelinePage({ data: deps }),
	component: Timeline,
});

/**
 * The day masthead drops the weekday the shared window label carries -- the
 * "Daily" eyebrow above it already says what kind of window this is, so
 * "Thu, " only crowds the date. UTC to match every other timeline label.
 */
const DAY_TITLE = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

function Timeline() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	const { period, view } = search;
	const anchor = resolveAnchor(period, search.date);
	const navigate = Route.useNavigate();

	const show = (next: {
		period?: TimelinePeriod;
		date?: string;
		view?: TimelineView;
	}) => navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

	// A date the station could never have recorded is the one case with nothing
	// to say at all -- no figures, no window, no grid -- so it replaces the page
	// rather than sitting inside it.
	if (data.body.kind === "day-out-of-range") {
		return <OutOfRangeDay result={data.body.result} date={anchor} />;
	}

	return (
		<TooltipProvider>
			<div className="page-wrap space-y-4 py-4">
				<TimelineHeader
					data={data}
					period={period}
					anchor={anchor}
					onChange={show}
				/>

				{/* A station with nothing recorded has no window picker and no
				    figures, so every card below would be an empty shell with one
				    line in it. The page-level treatment replaces them outright
				    rather than nesting a card inside a card. */}
				{data.hasAnyDetections ? (
					<TimelineCards
						rows={data.body.rows}
						previousTotals={data.body.previousTotals}
						period={period}
						windowLabel={data.window?.label ?? null}
						view={view}
						onViewChange={(next) => show({ view: next })}
					/>
				) : (
					<EmptyState icon={Bird} title="No detections recorded yet.">
						Once the station hears something, its rhythm will show up here --
						hour by hour, day by day, and across the whole of its history.
					</EmptyState>
				)}
			</div>
		</TooltipProvider>
	);
}

/**
 * The masthead for every period: the standard page header, with the selected
 * window as the title, the granularity named beneath it, and the share control
 * set against the title. The window's figures no longer live here -- they ride
 * the body card's kicker (see WindowSummary), against the species they count.
 */
function TimelineHeader({
	data,
	period,
	anchor,
	onChange,
}: {
	data: TimelinePageData;
	period: TimelinePeriod;
	anchor: string;
	onChange: (next: { period?: TimelinePeriod; date?: string }) => void;
}) {
	const rows = data.body.kind === "rows" ? data.body.rows : [];

	const share = useShareCard({
		subject: `${period}:${anchor}`,
		load: async () =>
			period === "day"
				? formatShareCard(await getDayShareCard({ data: anchor }))
				: formatTimelineShareCard({
						period,
						windowLabel: data.window?.label ?? null,
						rows,
					}),
	});

	return (
		<PageHeaderCard
			title={headerTitle(data, period, anchor)}
			description={TIMELINE_DESCRIPTION}
			action={data.hasAnyDetections ? share.trigger : undefined}
			// Between the title and the body card, so the window it picks reads as
			// steering the figures and body beneath it. Gated on the station rather
			// than the window: an empty week still needs the switcher to reach a
			// window with something in it.
			afterHeader={
				data.hasAnyDetections ? (
					<PeriodToolbar
						period={period}
						anchor={anchor}
						window={data.window}
						prevAnchor={data.prevAnchor}
						nextAnchor={data.nextAnchor}
						lastActiveDay={data.lastActiveDay}
						stationRange={data.stationRange}
						onChange={onChange}
					/>
				) : undefined
			}
		>
			{share.summary}
		</PageHeaderCard>
	);
}

/**
 * The page's title: the scope, then the window -- "Daily — Aug 26, 2026". "all"
 * has no window to name, so it stops at the scope ("All Time"); every other
 * period appends the window label the picker moves through.
 *
 * The week label carries its own range dash (an en dash). Stepped down here to a
 * hyphen so it reads as subordinate to the em dash that splits scope from
 * window, rather than a second separator of the same weight sitting beside it.
 */
function headerTitle(
	data: TimelinePageData,
	period: TimelinePeriod,
	anchor: string,
): string {
	const scope = TIMELINE_PERIOD_LABELS[period];
	if (period === "all") return scope;
	const window =
		period === "day"
			? DAY_TITLE.format(new Date(`${anchor}T00:00:00Z`))
			: (data.window?.label ?? anchor);
	return `${scope} — ${window.replace(/–/g, "-")}`;
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
function WindowSummary({ rows }: { rows: TimelineRow[] }) {
	const detections = rows.reduce((sum, row) => sum + row.totalDetections, 0);

	return (
		<div className="flex min-w-0 items-center gap-2.5">
			<span className="h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden="true" />
			{/* Lifted 1.5px so its ink centres on the kicker's. The boxes already
			    centre, but Georgia's lowercase and old-style figures sit low in theirs
			    next to the kicker's all-caps, so box-centred reads as dropped. */}
			<div className="flex -translate-y-[1.5px] items-center gap-2 truncate text-[13px] text-muted-foreground">
				<span className="whitespace-nowrap">
					<span className="count-figure">{detections.toLocaleString()}</span>{" "}
					detections
				</span>
				<span
					className="size-[3px] shrink-0 rounded-full bg-muted-foreground opacity-60"
					aria-hidden="true"
				/>
				<span className="whitespace-nowrap">
					<span className="count-figure">{rows.length.toLocaleString()}</span>{" "}
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
	previousTotals,
	period,
	windowLabel,
	view,
	onViewChange,
}: {
	rows: TimelineRow[];
	previousTotals: TimelineData["previousTotals"];
	period: TimelinePeriod;
	windowLabel: string | null;
	view: TimelineView;
	onViewChange: (next: TimelineView) => void;
}) {
	const emptyMessage = windowLabel
		? `No detections recorded for ${windowLabel}.`
		: "No detections recorded in this window.";

	const gridItems: SpeciesGridItem[] = rows.map((row) => ({
		comName: row.comName,
		sciName: row.sciName,
		imageUrl: row.imageUrl,
		count: row.totalDetections,
		averageConfidence: row.averageConfidence,
		isNew: row.isNew,
		isRare: row.isRare,
		isReturned: row.isReturned,
		returnedUnit: row.returnedUnit,
		hourCounts: row.hourCounts,
	}));

	const toggle = <ViewToggle view={view} onViewChange={onViewChange} />;

	// A quiet window (no rows) shows the empty card without a "0 detections · 0
	// species" line reading back the emptiness the card already states.
	const summary = rows.length > 0 ? <WindowSummary rows={rows} /> : undefined;

	// The window's day for the side column's rose: every species summed, hour by
	// hour.
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
				newLabel={windowLabel}
				emptyMessage={emptyMessage}
				summary={summary}
				action={toggle}
				className={BODY_CARD_WIDTH}
			/>
		) : (
			<SpeciesGrid
				species={gridItems}
				newLabel={windowLabel}
				emptyMessage={emptyMessage}
				summary={summary}
				action={toggle}
				className={BODY_CARD_WIDTH}
			/>
		);

	// On the widest screens the body sits on the left at one fixed width in both
	// views, so the toggle never shifts the column beside it: the window's
	// detections by hour, then Highlights, stacked. Below that there isn't room
	// for the column, so the body fills the row on its own.
	return (
		<div className="min-[1800px]:flex min-[1800px]:items-start min-[1800px]:gap-4">
			{body}
			{/* Drawn for a quiet window too, with the Activity card's own empty
			    line in each card, so the column holds its place instead of the page jumping when the
			    period steps from a window that heard something to one that
			    didn't. */}
			<div className="hidden min-w-0 flex-1 flex-col gap-4 min-[1800px]:flex">
				<DetectionsByHourRoseCard
					activity={hourActivity}
					title="Detections by hour"
					emptyMessage={emptyMessage}
				/>
				<HighlightsCard
					rows={rows}
					period={period}
					previousTotals={previousTotals}
					emptyMessage={emptyMessage}
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
// and the column beside it, in place. That column only appears from 1800px:
// below that, what's left beside a 72rem card is too narrow to hold anything.
const BODY_CARD_WIDTH = "min-w-0 min-[1800px]:w-[72rem] min-[1800px]:flex-none";

/**
 * The masthead subtitle -- one line for every period and both bodies. The view
 * toggle and the bodies themselves show *how* the detections are drawn, so the
 * subtitle stays fixed and just says what the page is: every detection, grouped
 * by species, across whatever window the toolbar has selected.
 */
const TIMELINE_DESCRIPTION =
	"Every detection, by species, over the selected time period";

const VIEW_META: Record<
	TimelineView,
	{
		label: string;
		/** A grid of cells for the heat map, uneven panels for the species
		    tiles. Both glyphs fill the same 18 of lucide's 24 units, so they share
		    one size. */
		icon: React.ComponentType<{ className?: string }>;
	}
> = {
	hours: {
		label: "Heatmap",
		icon: Grid3x3,
	},
	grid: {
		label: "Grid",
		icon: LayoutDashboard,
	},
};

/**
 * Picks which body the window draws -- set against the card's title, top-right.
 * One bordered pill split into two equal tabs, each an icon and its word, with
 * a hairline between them. The pill's rounding is clipped from outside, so
 * only its two ends round: where the tabs meet they sit flush, square against
 * the divider. The active tab takes the moss fill with paper text -- the same
 * on state as the period toggle above the card -- so every "which view"
 * control on the page marks its choice the same way.
 */
function ViewToggle({
	view,
	onViewChange,
}: {
	view: TimelineView;
	onViewChange: (next: TimelineView) => void;
}) {
	return (
		<div className="grid w-52 shrink-0 grid-cols-2 overflow-hidden rounded-full border border-[var(--line)] bg-card">
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
							"flex h-6 items-center justify-center gap-1.5 whitespace-nowrap px-3 font-medium text-xs transition-colors [&+&]:border-[var(--line)] [&+&]:border-l",
							active
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-[var(--meadow)] hover:text-foreground",
						)}
					>
						<Icon className="size-[15.5px] shrink-0" aria-hidden="true" />
						{label}
					</button>
				);
			})}
		</div>
	);
}

const TIMELINE_SECTION = "Timeline";
const TIMELINE_SECTION_DESCRIPTION =
	"What this station heard, at whatever scale you ask for.";

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
					section={TIMELINE_SECTION}
					sectionDescription={TIMELINE_SECTION_DESCRIPTION}
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
					section={TIMELINE_SECTION}
					sectionDescription={TIMELINE_SECTION_DESCRIPTION}
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
					section={TIMELINE_SECTION}
					sectionDescription={TIMELINE_SECTION_DESCRIPTION}
					tone="missing"
					title="That isn't a date"
				>
					“{date}” isn’t a valid date. Dates look like 2025-04-19.
				</StatusPage>
			);
	}
}
