import { EmptyNote } from "~/components/empty-state.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip.tsx";
import { HEAT_COLORS, heatLevel } from "~/lib/heatmap.ts";
import type { HourActivity } from "~/lib/stats-data.ts";
import { hourLabel } from "~/lib/time-ago.ts";

// The drawing lives in a square viewBox; every measure below is in those user
// units, so the SVG scales to whatever box the card gives it. The box is a
// little wider than the petals reach so the "6 AM"/"6 PM" side labels have room
// to sit outside them without being clipped at the edge.
const VIEW = 212;
const CENTER = VIEW / 2;
// The wedges stop short of the edge so the four clock labels have room to sit
// outside the petals rather than on top of the busiest hour.
const MAX_RADIUS = 78;
const DEGREES_PER_HOUR = 360 / 24;
// A non-zero hour always shows at least this much radius, so a quiet hour next
// to the dawn chorus reads as "a little" rather than vanishing into the hub.
const MIN_WEDGE_RADIUS = 4;
// The concentric guides, as fractions of MAX_RADIUS -- the same four-ring
// grading the area chart's y-axis gives, read radially.
const GRID_RINGS = [0.25, 0.5, 0.75, 1] as const;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// Only the four quarters of the day get a label; 24 of them would ring the
// chart in noise. The text comes from `hourLabel` -- the same formatter the
// line chart's x-axis uses -- so "12 AM", "6 AM"... read identically across the
// two hour charts rather than one saying "6a" and the other "6 AM".
const CLOCK_LABELS = [
	{ hour: 0, dx: 0, dy: -1 },
	{ hour: 6, dx: 1, dy: 0 },
	{ hour: 12, dx: 0, dy: 1 },
	{ hour: 18, dx: -1, dy: 0 },
] as const;

/** A point at radius `r` and `deg` clockwise from straight up (midnight). */
function polar(r: number, deg: number): [number, number] {
	const rad = (deg * Math.PI) / 180;
	return [CENTER + r * Math.sin(rad), CENTER - r * Math.cos(rad)];
}

/** The pie-style wedge for one hour: hub to an arc `DEGREES_PER_HOUR` wide,
 * centred on the hour's own bearing so midnight points straight up. */
function wedgePath(hour: number, radius: number): string {
	const start = hour * DEGREES_PER_HOUR - DEGREES_PER_HOUR / 2;
	const end = hour * DEGREES_PER_HOUR + DEGREES_PER_HOUR / 2;
	const [x1, y1] = polar(radius, start);
	const [x2, y2] = polar(radius, end);
	// Sweep flag 1 draws the arc clockwise; the 15deg span is never a large arc.
	return `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
}

/**
 * The detections-by-hour data drawn as a Nightingale rose (a polar-area chart):
 * 24 wedges of equal angle, one per hour, midnight at the top and the day
 * running clockwise. A wedge's *area* -- not its radius -- tracks the hour's
 * share of the busiest hour, so the petals stay honest the way Nightingale's
 * original did; radius therefore scales with the square root of the count. It
 * plots the very same series as {@link DetectionsByHourCard}, offering the shape
 * of the day as a clock-face rather than a line.
 */
export function DetectionsByHourRoseCard({
	activity,
	title = "Detections by hour",
	emptyMessage = "No detections recorded yet.",
	className = "",
}: {
	activity: HourActivity[];
	/** The kicker. */
	title?: string;
	/** What the card says when every hour is zero. */
	emptyMessage?: string;
	className?: string;
}) {
	// buildHourActivity always returns all 24 hours, so an empty chart is one
	// where every hour is zero rather than one with no points at all.
	const isEmpty = activity.every((point) => point.count === 0);

	if (isEmpty) {
		return (
			<section
				aria-label="Detections by hour, radial"
				className={`feature-card flex flex-col rounded-md p-4 ${className}`}
			>
				<div className="island-kicker">{title}</div>
				<EmptyNote>{emptyMessage}</EmptyNote>
			</section>
		);
	}

	return (
		<section
			aria-label="Detections by hour, radial"
			className={`feature-card flex min-h-72 flex-col rounded-md p-4 ${className}`}
		>
			<div className="island-kicker">{title}</div>

			<div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
				<DetectionsByHourRose
					activity={activity}
					className="h-full max-h-72 w-full"
				/>
			</div>
		</section>
	);
}

/**
 * The rose itself, without a card around it -- for a card that holds other
 * things too, like the timeline's Highlights, where a nested feature-card
 * would break the one-card rule. Expects at least one non-zero hour; callers
 * show their own empty state.
 */
export function DetectionsByHourRose({
	activity,
	className = "",
}: {
	activity: HourActivity[];
	className?: string;
}) {
	const countByHour = new Map(
		activity.map((point) => [point.hour, point.count]),
	);
	const maximum = Math.max(...activity.map((point) => point.count), 0);

	return (
		<TooltipProvider>
			<svg
				viewBox={`0 0 ${VIEW} ${VIEW}`}
				className={className}
				role="img"
				aria-label="Detections by hour of day, as a radial polar-area chart with midnight at the top"
			>
				<title>Detections by hour of day</title>

				{/* The guide rings and the spokes between wedges, so a petal reads
			    against a scale rather than floating on its own. */}
				{GRID_RINGS.map((fraction) => (
					<circle
						key={`ring-${fraction}`}
						cx={CENTER}
						cy={CENTER}
						r={MAX_RADIUS * fraction}
						fill="none"
						stroke="var(--line)"
						strokeWidth={0.5}
					/>
				))}
				{HOURS.map((hour) => {
					const [x, y] = polar(
						MAX_RADIUS,
						hour * DEGREES_PER_HOUR - DEGREES_PER_HOUR / 2,
					);
					return (
						<line
							key={`spoke-${hour}`}
							x1={CENTER}
							y1={CENTER}
							x2={x}
							y2={y}
							stroke="var(--line)"
							strokeWidth={0.25}
						/>
					);
				})}

				{/* The petals. Area tracks the count, so radius is the square root
			    of the count's share of the busiest hour. */}
				{HOURS.map((hour) => {
					const count = countByHour.get(hour) ?? 0;
					if (count === 0) return null;
					const radius = Math.max(
						MAX_RADIUS * Math.sqrt(count / maximum),
						MIN_WEDGE_RADIUS,
					);
					const level = heatLevel(count, maximum);
					return (
						<Tooltip key={`wedge-${hour}`}>
							<TooltipTrigger asChild>
								<path
									d={wedgePath(hour, radius)}
									fill={HEAT_COLORS[level]}
									stroke="var(--paper-raised)"
									strokeWidth={0.75}
									className="transition-opacity hover:opacity-80"
									aria-label={`${hourLabel(hour)}: ${count.toLocaleString()} detections`}
								/>
							</TooltipTrigger>
							<TooltipContent>
								<span className="font-semibold">{hourLabel(hour)}</span>
								{` — ${count.toLocaleString()} ${count === 1 ? "detection" : "detections"}`}
							</TooltipContent>
						</Tooltip>
					);
				})}

				{/* The four quarters of the day, sitting just outside the petals. */}
				{CLOCK_LABELS.map(({ hour, dx, dy }) => {
					const [x, y] = polar(MAX_RADIUS + 13, hour * DEGREES_PER_HOUR);
					return (
						<text
							key={`label-${hour}`}
							x={x + dx * 2}
							y={y + dy * 2}
							textAnchor="middle"
							dominantBaseline="central"
							className="fill-[var(--muted-foreground)] text-[9px]"
						>
							{hourLabel(hour)}
						</text>
					);
				})}
			</svg>
		</TooltipProvider>
	);
}
