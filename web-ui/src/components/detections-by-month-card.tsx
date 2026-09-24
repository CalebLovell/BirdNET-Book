import {
	Bar,
	BarChart,
	CartesianGrid,
	Tooltip as ChartTooltip,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";

import { ChartValueTooltip } from "~/components/chart-tooltip.tsx";
import { CHART_MARGIN, X_AXIS_HEIGHT } from "~/lib/chart-style.ts";
import type { TrendPoint } from "~/lib/stats-data.ts";

/**
 * The species page's detections-by-month chart: every detection on record,
 * each calendar month summed across the years, so it shows the bird's seasons.
 *
 * Bars rather than the line the by-hour card uses: twelve months are discrete
 * buckets to be compared against each other, not a continuous cycle to trace
 * the shape of. A line between them implies readings in the gaps that do not
 * exist.
 */
export function DetectionsByMonthCard({
	trend,
	className = "",
}: {
	/** The twelve calendar months, zero-filled, all years folded together. */
	trend: TrendPoint[];
	className?: string;
}) {
	const isEmpty = trend.every((point) => point.count === 0);

	return (
		<section
			aria-label="Detections by month"
			// The min-height reserves room for the chart; with only a line of text
			// in the card it would just be empty space.
			className={`feature-card flex flex-col rounded-md p-4 ${isEmpty ? "" : "min-h-72"} ${className}`}
		>
			<div className="island-kicker">Detections by month</div>

			{isEmpty ? (
				<p className="mt-4 text-muted-foreground text-sm">
					No detections recorded yet.
				</p>
			) : (
				<div className="mt-4 min-h-0 flex-1">
					{/* `minHeight` is not decoration: ResponsiveContainer measures its own
				    box, and `height: 100%` inside a card sized by `min-h-72` resolves
				    against an indefinite height -- so it measures zero and draws
				    nothing unless a parent grid row happens to stretch the card to a
				    definite height. The floor makes the chart render wherever the card
				    is put, and it still grows past it when a row does stretch. */}
					<ResponsiveContainer width="100%" height="100%" minHeight={220}>
						<BarChart
							data={trend}
							// No extra right margin for "Dec": each label is centred in its
							// month's band, so the last one sits half a band in from the edge.
							margin={CHART_MARGIN}
							// Twelve discrete buckets, not a continuous signal: a fifth of
							// each band goes to the gap so no two months' fills touch, and
							// the cap keeps the bars from turning into slabs on a wide card.
						>
							<CartesianGrid stroke="var(--line)" vertical={false} />
							<XAxis
								dataKey="label"
								height={X_AXIS_HEIGHT}
								stroke="var(--muted-foreground)"
								fontSize={12}
								tickLine={false}
								minTickGap={0}
								interval={0}
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
								content={(props) => <ChartValueTooltip {...props} />}
								// The band, not the bar: a cursor sized to the mark makes the
								// hover target smaller than the thing being pointed at.
								cursor={{ fill: "var(--sage)", fillOpacity: 0.2 }}
							/>
							{/* One series, so no legend -- the kicker above names it. The
							    rounded top is on the data end only; the baseline end stays
							    square so the bar reads as sitting on zero. */}
							{/* One series, so no legend -- the kicker above names it. The
							    rounded corners are on the data end only; the baseline end
							    stays square so each bar reads as sitting on zero.

							    No enter animation: recharts 3.10 grows a bar from zero
							    height and, in this chart, never finishes -- every bar stays
							    at zero and the shape is dropped entirely, which is a blank
							    card. The line charts animate because they interpolate along
							    a path rather than out of a collapsed rectangle. */}
							<Bar
								dataKey="count"
								isAnimationActive={false}
								fill="var(--moss)"
								radius={[4, 4, 0, 0]}
								maxBarSize={48}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			)}
		</section>
	);
}
