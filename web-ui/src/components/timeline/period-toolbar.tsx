import {
	Calendar,
	CalendarDays,
	CalendarRange,
	ChevronLeft,
	ChevronRight,
	Clock,
	Infinity as InfinityIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button.tsx";
import { Input } from "~/components/ui/input.tsx";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group.tsx";
import {
	TIMELINE_PERIOD_LABELS,
	TIMELINE_PERIODS,
	type TimelinePeriod,
} from "~/lib/timeline-periods.ts";
import {
	anchorForDay,
	isValidAnchor,
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
	prevAnchor,
	nextAnchor,
	lastActiveDay,
	stationRange,
	onChange,
}: {
	period: TimelinePeriod;
	anchor: TimelineAnchor;
	window: TimelineWindow | null;
	prevAnchor: TimelineAnchor | null;
	nextAnchor: TimelineAnchor | null;
	lastActiveDay: string | null;
	stationRange: { first: string; last: string } | null;
	onChange: (next: { period?: TimelinePeriod; date?: string }) => void;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			{/* Five joined segments are wider than a phone, and a segmented control
			    cannot wrap without breaking its own shape -- so on a narrow screen
			    the row scrolls instead, the same way the site nav above it does. */}
			<div className="max-w-full overflow-x-auto">
				<ToggleGroup
					type="single"
					variant="outline"
					value={period}
					onValueChange={(value) => {
						if (!value) return;
						const next = value as TimelinePeriod;
						// Carry the spot in history across the switch, anchored on the last
						// day of the current window that holds detections. Using the
						// window's start instead would drop Yearly onto January 1st and
						// land the user in a dead month; falling back to it only matters
						// when the current window is empty anyway.
						const carried = lastActiveDay ?? window?.start;
						onChange({
							period: next,
							date:
								next === "all" || !carried
									? undefined
									: anchorForDay(next, carried),
						});
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
				<WindowPicker
					period={period}
					anchor={anchor}
					stationRange={stationRange}
					prevAnchor={prevAnchor}
					nextAnchor={nextAnchor}
					onPick={(date) => onChange({ date })}
				/>
			) : (
				<div />
			)}
		</div>
	);
}

/**
 * The date side of the toolbar: a native picker matched to the granularity,
 * flanked by steps to the nearest neighbouring window that actually holds
 * detections. The arrows disable at the ends of the station's history rather
 * than walking off into empty windows.
 */
function WindowPicker({
	period,
	anchor,
	stationRange,
	prevAnchor,
	nextAnchor,
	onPick,
}: {
	period: Exclude<TimelinePeriod, "all">;
	anchor: TimelineAnchor;
	stationRange: { first: string; last: string } | null;
	prevAnchor: TimelineAnchor | null;
	nextAnchor: TimelineAnchor | null;
	onPick: (anchor: TimelineAnchor) => void;
}) {
	const label = PICKER_LABELS[period];
	// Bounds in the picker's own notation, so the calendar greys out everything
	// the station could never have recorded.
	const min = stationRange
		? anchorForDay(period, stationRange.first)
		: undefined;
	const max = stationRange
		? anchorForDay(period, stationRange.last)
		: undefined;

	return (
		<div className="flex items-center gap-1">
			<StepButton
				direction="prev"
				label={`Previous ${label.toLowerCase()} with detections`}
				target={prevAnchor}
				onPick={onPick}
			/>
			<Input
				aria-label={label}
				className="!w-44"
				type={PICKER_TYPES[period]}
				value={anchor}
				min={min}
				max={max}
				step={period === "year" ? 1 : undefined}
				onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
					const next = event.target.value;
					// Half-typed values stream through on every keystroke; only commit
					// once one names a real window.
					if (isValidAnchor(period, next)) onPick(next);
				}}
			/>
			<StepButton
				direction="next"
				label={`Next ${label.toLowerCase()} with detections`}
				target={nextAnchor}
				onPick={onPick}
			/>
		</div>
	);
}

function StepButton({
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

	// `icon-lg` and the outline variant are what make these match the field they
	// flank: the same 36px box, the same card surface, the same hover. Hand-rolled
	// at 32px with no fill, they read as a different control that happened to land
	// next to the picker rather than part of it.
	return (
		<Button
			variant="outline"
			size="icon-lg"
			aria-label={label}
			title={label}
			disabled={target === null}
			onClick={() => target && onPick(target)}
		>
			<Icon />
		</Button>
	);
}
