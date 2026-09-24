import { useId } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	Tooltip as ChartTooltip,
	Line,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";

import { ChartValueTooltip } from "~/components/chart-tooltip.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import {
	CHART_ANIMATION_MS,
	CHART_MARGIN,
	X_AXIS_HEIGHT,
} from "~/lib/chart-style.ts";
import type { HourActivity } from "~/lib/stats-data.ts";
import { hourLabel } from "~/lib/time-ago.ts";

const EVEN_HOURS = Array.from({ length: 12 }, (_, index) => index * 2);

/**
 * The species page's detections-by-hour chart: every detection of the species
 * on record, bucketed by hour of day.
 */
export function DetectionsByHourCard({
	activity,
	className = "",
}: {
	activity: HourActivity[];
	className?: string;
}) {
	// Two of these can share a page in principle; a scoped id keeps the
	// gradients from colliding.
	const fillId = useId();

	// buildHourActivity always returns all 24 hours, so an empty chart is one
	// where every hour is zero rather than one with no points at all.
	const isEmpty = activity.every((point) => point.count === 0);

	if (isEmpty) {
		return (
			<section
				aria-label="Detections by hour"
				className={`feature-card flex flex-col rounded-md p-4 ${className}`}
			>
				<div className="island-kicker">Detections by hour</div>
				<EmptyNote>No detections recorded yet.</EmptyNote>
			</section>
		);
	}

	return (
		<section
			aria-label="Detections by hour"
			className={`feature-card flex min-h-72 flex-col rounded-md p-4 ${className}`}
		>
			<div className="island-kicker">Detections by hour</div>

			<div className="mt-(--page-gap) min-h-0 flex-1">
				{/* `minHeight` is not decoration: ResponsiveContainer measures its own
			    box, and `height: 100%` inside a card sized by `min-h-72` resolves
			    against an indefinite height -- so it measures zero and draws
			    nothing unless a parent grid row happens to stretch the card to a
			    definite height. The floor makes the chart render wherever the card
			    is put, and it still grows past it when a row does stretch. */}
				<ResponsiveContainer width="100%" height="100%" minHeight={220}>
					<AreaChart data={activity} margin={CHART_MARGIN}>
						<defs>
							<linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--moss)" stopOpacity={0.2} />
								<stop offset="100%" stopColor="var(--moss)" stopOpacity={0} />
							</linearGradient>
						</defs>
						<CartesianGrid stroke="var(--line)" vertical={false} />
						<XAxis
							dataKey="hour"
							height={X_AXIS_HEIGHT}
							tickFormatter={hourLabel}
							stroke="var(--muted-foreground)"
							fontSize={12}
							tickLine={false}
							// Every other hour where the card is wide enough; on a narrow
							// one recharts drops whichever labels would collide.
							ticks={EVEN_HOURS}
							interval="preserveStart"
						/>
						<YAxis
							stroke="var(--muted-foreground)"
							fontSize={12}
							tickLine={false}
							allowDecimals={false}
							// Auto rather than a fixed width: a busy station's five-digit
							// counts were being clipped to their trailing digits.
							width="auto"
						/>
						<ChartTooltip
							content={(props) => (
								<ChartValueTooltip
									{...props}
									formatLabel={(hour) => hourLabel(Number(hour))}
								/>
							)}
							cursor={{ fill: "var(--sage)", fillOpacity: 0.2 }}
						/>
						{/* The wash under the line, not a series of its own: it plots the
						    same counts, so left in the tooltip it listed every value twice. */}
						<Area
							dataKey="count"
							tooltipType="none"
							animationDuration={CHART_ANIMATION_MS}
							stroke="none"
							fill={`url(#${fillId})`}
						/>
						<Line
							type="monotone"
							dataKey="count"
							animationDuration={CHART_ANIMATION_MS}
							stroke="var(--moss)"
							strokeWidth={2}
							dot={false}
							activeDot={{ r: 3, fill: "var(--moss)" }}
						/>
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</section>
	);
}
