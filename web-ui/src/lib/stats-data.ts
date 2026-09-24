export type HourActivity = { hour: number; count: number };
export type BusiestHour = HourActivity;
export type BusiestDay = { date: string; count: number };
export type TrendBucketCount = { bucket: string; count: number };
export type TrendPoint = TrendBucketCount & { label: string };
export type SpeciesCount = {
	comName: string;
	sciName: string;
	count: number;
	imageUrl: string | null;
};

function parseIsoDate(value: string): Date {
	return new Date(`${value}T00:00:00Z`);
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/**
 * The twelve calendar months, zero-filled, from rows bucketed by two-digit
 * month ("01".."12") with every year folded together. A fixed twelve-point
 * axis is the point of the chart: the seasons read at a glance only if a quiet
 * January still takes up as much room as a busy May.
 */
export function buildMonthlyTrend(rows: TrendBucketCount[]): TrendPoint[] {
	const countByBucket = new Map(rows.map((row) => [row.bucket, row.count]));

	return MONTH_LABELS.map((label, index) => {
		const bucket = (index + 1).toString().padStart(2, "0");
		return { bucket, label, count: countByBucket.get(bucket) ?? 0 };
	});
}

export function buildHourActivity(rows: HourActivity[]): HourActivity[] {
	const countByHour = new Map(rows.map((row) => [row.hour, row.count]));

	return Array.from({ length: 24 }, (_, hour) => ({
		hour,
		count: countByHour.get(hour) ?? 0,
	}));
}

export function selectBusiestHour(
	activity: HourActivity[],
): BusiestHour | null {
	return activity.reduce<BusiestHour | null>(
		(busiest, point) =>
			point.count > 0 && (!busiest || point.count > busiest.count)
				? point
				: busiest,
		null,
	);
}

export function dayLabel(date: string): string {
	const parsed = parseIsoDate(date);
	return Number.isNaN(parsed.getTime()) ? date : DAY_LABEL.format(parsed);
}

export function rankingBarPercent(count: number, maximum: number): number {
	if (count <= 0 || maximum <= 0) return 0;
	return Math.max(2, Math.round((count / maximum) * 100));
}

/**
 * Collapses per-species hour counts (each a 24-length array, midnight first)
 * into one detections-by-hour series for a window. Lets any timeline window
 * feed DetectionsByHourCard, not just the day and all-time views that carry a
 * ready-made HourActivity.
 */
export function hourActivityFromRows(
	rows: { hourCounts: number[] }[],
): HourActivity[] {
	return Array.from({ length: 24 }, (_, hour) => ({
		hour,
		count: rows.reduce((sum, row) => sum + (row.hourCounts[hour] ?? 0), 0),
	}));
}
