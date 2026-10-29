import {
	Calendar,
	CalendarDays,
	CalendarRange,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Clock,
	Infinity as InfinityIcon,
} from "lucide-react";

import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group.tsx";
import {
	TIMELINE_PERIOD_LABELS,
	TIMELINE_PERIODS,
	type TimelinePeriod,
} from "~/lib/timeline-periods.ts";
import {
	anchorForDay,
	currentAnchor,
	isValidAnchor,
	shortAnchorLabel,
	stepAnchor,
	type TimelineAnchor,
	type TimelineWindow,
} from "~/lib/timeline-window.ts";

const PERIOD_ICONS: Record<
	TimelinePeriod,
	React.ComponentType<{ className?: string }>
> = {
	day: Clock,
	week: CalendarDays,
	month: CalendarRange,
	year: Calendar,
	all: InfinityIcon,
};

// The native input that fits each granularity. Chromium renders week and month
// as real pickers; elsewhere they degrade to text fields holding the same
// "2026-W31" / "2026-07" values, which still round-trip correctly.
const PICKER_TYPES: Record<Exclude<TimelinePeriod, "all">, string> = {
	day: "date",
	week: "week",
	month: "month",
	year: "number",
};

const PICKER_LABELS: Record<Exclude<TimelinePeriod, "all">, string> = {
	day: "Day",
	week: "Week",
	month: "Month",
	year: "Year",
};

/**
 * The single time control for the timeline page: how wide a window to look
 * through, and which one.
 *
 * This is the whole reason Today, Timeline, Stats and the day review are one
 * page rather than four. Each of them was a fixed scope with its own way of
 * moving through time; here the scope is a control, and the page underneath
 * changes to suit it.
 */
export function PeriodToolbar({
	period,
	anchor,
	window,
	lastActiveDay,
	stationRange,
	onChange,
}: {
	period: TimelinePeriod;
	anchor: TimelineAnchor;
	window: TimelineWindow | null;
	lastActiveDay: string | null;
	stationRange: { first: string; last: string } | null;
	onChange: (next: { period?: TimelinePeriod; date?: string }) => void;
}) {
	const pickPeriod = (next: TimelinePeriod) => {
		// Carry the spot in history across the switch, anchored on the last day of
		// the current window that holds detections. Using the window's start
		// instead would drop Yearly onto January 1st and land the user in a dead
		// month; falling back to it only matters when the current window is empty
		// anyway.
		const carried = lastActiveDay ?? window?.start;
		onChange({
			period: next,
			date:
				next === "all" || !carried ? undefined : anchorForDay(next, carried),
		});
	};

	return (
		// One row at every width: the period and the window it picks never stack.
		// The date field is what gives way, shrinking before anything wraps.
		<div className="flex items-center justify-between gap-2 sm:gap-3">
			{/* Five joined segments need about 710px of row beside the picker, and a
			    segmented control can't wrap without breaking its own shape -- so
			    below 800px the same choice becomes a dropdown. */}
			<PeriodSelect period={period} onPick={pickPeriod} />
			<div className="hidden min-[800px]:block">
				<ToggleGroup
					type="single"
					variant="outline"
					value={period}
					onValueChange={(value) => {
						if (value) pickPeriod(value as TimelinePeriod);
					}}
				>
					{TIMELINE_PERIODS.map((value) => {
						const Icon = PERIOD_ICONS[value];
						return (
							<ToggleGroupItem key={value} value={value}>
								<Icon className="size-4" />
								{TIMELINE_PERIOD_LABELS[value]}
							</ToggleGroupItem>
						);
					})}
				</ToggleGroup>
			</div>

			{/* Date picker on the right. "all" has no window to pick, so an empty slot
			    holds the right edge and keeps the period switcher pinned left rather
			    than letting it slide over. */}
			{period !== "all" ? (
				<WindowStepper
					period={period}
					anchor={anchor}
					stationRange={stationRange}
					onPick={(date) => onChange({ date })}
				/>
			) : (
				<div />
			)}
		</div>
	);
}

/**
 * The period switcher on a narrow screen: a native select dressed like the
 * date field beside it -- the same 36px box, border, card surface and hover --
 * with the chosen period's icon in front, as its tab would show it, and a
 * chevron marking it as a dropdown. Native so a phone opens its own picker.
 */
function PeriodSelect({
	period,
	onPick,
}: {
	period: TimelinePeriod;
	onPick: (next: TimelinePeriod) => void;
}) {
	const Icon = PERIOD_ICONS[period];
	return (
		<div className="relative shrink-0 min-[800px]:hidden">
			{/* Under 400px the icon goes too: the row needs its width for the
			    longest window name ("Sep 23rd, 2026") beside it. */}
			<Icon
				className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 max-[400px]:hidden"
				aria-hidden="true"
			/>
			<select
				aria-label="Period"
				value={period}
				onChange={(event) => onPick(event.target.value as TimelinePeriod)}
				className="h-9 cursor-pointer appearance-none rounded-md border border-input bg-card pr-7 pl-8 font-medium pointer-coarse:text-base text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-[var(--focus-ring)] focus-visible:outline-none max-[400px]:pl-2.5"
			>
				{TIMELINE_PERIODS.map((value) => (
					<option key={value} value={value}>
						{TIMELINE_PERIOD_LABELS[value]}
					</option>
				))}
			</select>
			<ChevronDown
				className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
				aria-hidden="true"
			/>
		</div>
	);
}

/**
 * The date side of the toolbar: one bordered control, the steps joined to
 * either end by hairlines, around the window's short name ("Sep 2026") rather
 * than the browser's own picker text ("September 2026"), which is wider and
 * reads differently in every browser. The steps move one window at a time,
 * quiet ones included, as far as you like either way.
 *
 * Clicking the name opens the native picker for the granularity, laid
 * invisibly over it -- or, for a year, a native list of the station's years.
 * Fills the row beside the period menu on a phone; a fixed 16rem from 400px.
 */
function WindowStepper({
	period,
	anchor,
	stationRange,
	onPick,
}: {
	period: Exclude<TimelinePeriod, "all">;
	anchor: TimelineAnchor;
	stationRange: { first: string; last: string } | null;
	onPick: (anchor: TimelineAnchor) => void;
}) {
	const label = PICKER_LABELS[period];
	const nativePicker = useNativePicker(PICKER_TYPES[period]);
	// The arrows walk one window at a time, quiet ones included, with no limit
	// either way: a window ahead or before the station is just a quiet one.
	const valid = isValidAnchor(period, anchor);
	const prevTarget = valid ? stepAnchor(period, anchor, -1) : null;
	const nextTarget = valid ? stepAnchor(period, anchor, 1) : null;

	const overlay = "absolute inset-0 size-full cursor-pointer opacity-0";

	return (
		<div className="flex h-9 min-w-0 flex-1 overflow-hidden rounded-md border border-input bg-card focus-within:border-[var(--focus-ring)] min-[400px]:w-64 min-[400px]:flex-none">
			<JoinedStep
				direction="prev"
				label={`Previous ${label.toLowerCase()}`}
				target={prevTarget}
				onPick={onPick}
			/>
			<div className="relative flex min-w-0 flex-1 items-center justify-center px-1 pointer-coarse:text-base text-sm">
				{/* Both lengths render and the width picks one: "Week" squeezes to
				    "Wk" under 400px, and the calendar mark in front of the name shows
				    only where there's room for it. */}
				<Calendar
					className="mr-2 size-4 shrink-0 text-muted-foreground max-[400px]:hidden"
					aria-hidden="true"
				/>
				<span className="truncate max-[400px]:hidden">
					{shortAnchorLabel(period, anchor)}
				</span>
				<span className="truncate min-[400px]:hidden">
					{shortAnchorLabel(period, anchor, { compact: true })}
				</span>
				{period === "year" ? (
					<select
						aria-label={label}
						className={overlay}
						value={anchor}
						onChange={(event) => onPick(event.target.value)}
					>
						{pickableYears(anchor, stationRange).map((year) => (
							<option key={year} value={year}>
								{year}
							</option>
						))}
					</select>
				) : nativePicker ? (
					<input
						aria-label={label}
						// iOS Safari gives date fields a minimum width of their own;
						// stripping its native look lets the overlay fit the label.
						className={`${overlay} min-w-0 appearance-none text-base`}
						type={PICKER_TYPES[period]}
						value={anchor}
						// A desktop browser only opens its calendar from the field's own
						// little button, which is invisible here -- so a click anywhere on
						// the name asks for the picker outright. Touch browsers open it on
						// tap regardless; where showPicker is missing or refuses, the
						// field still takes focus as before.
						onClick={(event) => {
							try {
								event.currentTarget.showPicker?.();
							} catch {
								// Not allowed here (e.g. not a user gesture); nothing to do.
							}
						}}
						onChange={(event) => {
							if (isValidAnchor(period, event.target.value)) {
								onPick(event.target.value);
							}
						}}
					/>
				) : null}
			</div>
			<JoinedStep
				direction="next"
				label={`Next ${label.toLowerCase()}`}
				target={nextTarget}
				onPick={onPick}
			/>
		</div>
	);
}

/**
 * Whether this browser draws a real picker for the input type. Where it
 * doesn't -- iOS Safari has no week picker -- the input falls back to a text
 * field, which laid invisibly over the label would take typing you can't see;
 * the stepper then drops it and steps with its arrows alone. Assumed true until
 * mounted, so the server render matches the common case.
 */
function useNativePicker(type: string): boolean {
	const [supported, setSupported] = useState(true);
	useEffect(() => {
		const probe = document.createElement("input");
		probe.setAttribute("type", type);
		setSupported(probe.type === type);
	}, [type]);
	return supported;
}

/**
 * The years the year list offers, newest first: the station's, this year, and
 * the one showing, plus a year either side. A native list can't run forever,
 * so the arrows are what reach further out.
 */
function pickableYears(
	anchor: TimelineAnchor,
	stationRange: { first: string; last: string } | null,
): string[] {
	const years = [Number(currentAnchor("year"))];
	if (isValidAnchor("year", anchor)) years.push(Number(anchor));
	if (stationRange) {
		years.push(Number(stationRange.first.slice(0, 4)));
		years.push(Number(stationRange.last.slice(0, 4)));
	}
	const from = Math.min(...years) - 1;
	const to = Math.max(...years) + 1;
	return Array.from({ length: to - from + 1 }, (_, i) => String(to - i));
}

/** One end of the joined stepper, divided from the name by a hairline. */
function JoinedStep({
	direction,
	label,
	target,
	onPick,
}: {
	direction: "prev" | "next";
	label: string;
	target: TimelineAnchor | null;
	onPick: (anchor: TimelineAnchor) => void;
}) {
	const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={target === null}
			onClick={() => target && onPick(target)}
			className={`flex w-8 shrink-0 items-center justify-center border-input transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 ${direction === "prev" ? "border-r" : "border-l"}`}
		>
			<Icon className="size-4" aria-hidden="true" />
		</button>
	);
}
