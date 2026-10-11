import type { LucideIcon } from "lucide-react";
import { Database, HardDrive, Radio } from "lucide-react";

import type { PageHeaderStat } from "~/components/page-header-card.tsx";
import { ShellFigure } from "~/components/ui/shell.tsx";
import type { HealthMetricId, StationHealth } from "~/lib/health-data.ts";

const ICONS: Record<HealthMetricId, LucideIcon> = {
	disk: HardDrive,
	database: Database,
	"last-detection": Radio,
};

/**
 * The station's vital signs as masthead figures, so Settings has the same head
 * as every other page rather than a panel of its own invention. Each metric is
 * just a label and a value -- the value carries its own unit ("88.0%"), the way
 * every other figure does.
 */
export function healthStats(health: StationHealth): PageHeaderStat[] {
	return health.metrics.map((metric) => ({
		label: metric.label,
		value: metric.value,
		icon: ICONS[metric.id],
	}));
}

/** The same figures before the first reading: their labels and icons as
    themselves, each value blurred, so the masthead is its loaded height from
    the first frame. */
export function healthStatsSkeleton(): PageHeaderStat[] {
	return [
		{
			label: "Disk used",
			value: <ShellFigure placeholder="00%" />,
			icon: ICONS.disk,
		},
		{
			label: "Database",
			value: <ShellFigure placeholder="00 MB" />,
			icon: ICONS.database,
		},
		{
			label: "Last detection",
			value: <ShellFigure placeholder="0 min ago" />,
			icon: ICONS["last-detection"],
		},
	];
}
