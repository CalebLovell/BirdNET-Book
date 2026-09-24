import { HEAT_COLORS, heatLevel } from "~/lib/heatmap.ts";
import { hourLabel } from "~/lib/time-ago.ts";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// Only the eight three-hour marks get a label; 24 would ring the tiny chart in
// noise. Each names the hour whose bar sits above it.
const TICK_HOURS = [0, 3, 6, 9, 12, 15, 18, 21] as const;

// A non-zero hour never drops below this share of the chart height, so a quiet
// hour next to the dawn chorus reads as "a little" rather than vanishing.
const MIN_BAR_PERCENT = 8;

function tickParts(hour: number): { number: string; meridiem: string } {
	if (hour === 0) return { number: "12", meridiem: "a" };
	if (hour < 12) return { number: String(hour), meridiem: "a" };
	if (hour === 12) return { number: "12", meridiem: "p" };
	return { number: String(hour - 12), meridiem: "p" };
}

/**
 * One bird's day as a compact 24-hour column chart: midnight at the left,
 * 11pm at the right. Each bar's height is its share of *this bird's* busiest
 * hour, so the shape of the day reads regardless of how loud the bird is
 * overall -- the same self-scaling the timeline heatmap uses per row. Each bar
 * also takes that hour's heat-map colour, so the busiest hours are the darkest
 * in both views and the peak is full moss. A
 * non-zero hour always shows at least a sliver; a silent hour is a faint
 * baseline stub. Plots the same series as the page's species-by-hour heatmap,
 * offered here beside each bird's portrait rather than in a ranked grid.
 */
export function SpeciesHourBars({
	comName,
	hourCounts,
	className = "",
}: {
	comName: string;
	hourCounts: number[];
	className?: string;
}) {
	const max = Math.max(...hourCounts, 0);
	// A bird with nothing in the window has no shape to draw.
	if (max === 0) return null;

	const peakHour = hourCounts.reduce(
		(best, count, hour) => (count > hourCounts[best] ? hour : best),
		0,
	);

	return (
		<div
			className={className}
			role="img"
			aria-label={`Hourly activity for ${comName}, busiest at ${hourLabel(peakHour)}`}
		>
			<div className="flex h-9 items-end gap-px">
				{HOURS.map((hour) => {
					const count = hourCounts[hour] ?? 0;
					const isZero = count === 0;
					const percent = isZero
						? 0
						: Math.max((count / max) * 100, MIN_BAR_PERCENT);
					return (
						<div
							key={`bar-${hour}`}
							data-hour-bar=""
							title={`${hourLabel(hour)} — ${count.toLocaleString()} ${count === 1 ? "detection" : "detections"}`}
							className="flex-1 rounded-t-[1px]"
							style={
								isZero
									? { height: "2px", backgroundColor: "var(--line)" }
									: {
											height: `${percent}%`,
											backgroundColor: HEAT_COLORS[heatLevel(count, max)],
										}
							}
						/>
					);
				})}
			</div>

			<div className="mt-1 flex">
				{HOURS.map((hour) => {
					const label = TICK_HOURS.includes(hour as (typeof TICK_HOURS)[number])
						? tickParts(hour)
						: null;
					return (
						<div
							key={`tick-${hour}`}
							className="flex flex-1 justify-center leading-none"
						>
							{label ? (
								<span
									data-hour-tick=""
									className="flex items-baseline gap-px text-muted-foreground"
								>
									<span className="text-[9px]">{label.number}</span>
									<span className="text-[7px]">{label.meridiem}</span>
								</span>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}
