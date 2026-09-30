import {
	Binoculars,
	Bird,
	ChartNoAxesColumnIncreasing,
	Feather,
} from "lucide-react";

import { PageHeaderStats } from "~/components/page-header-card.tsx";
import type { NowSummary } from "~/lib/now.ts";

/**
 * The last 24 hours at a glance, between the hero and the log: how many kinds
 * of bird, how many visits the log below folds them into, how many detections
 * those visits hold, and who was loudest. Follows the poll, so the figures
 * move as birds arrive.
 */
export function LiveSummaryStats({
	summary,
	className,
}: {
	summary: NowSummary;
	className?: string;
}) {
	return (
		<PageHeaderStats
			className={className}
			stats={[
				{ label: "Species", value: summary.species, icon: Feather },
				{ label: "Visits", value: summary.visits, icon: Binoculars },
				{
					label: "Detections",
					value: summary.detections,
					icon: ChartNoAxesColumnIncreasing,
				},
				{
					label: "Most heard",
					value: summary.topSpecies?.comName ?? "—",
					icon: Bird,
				},
			]}
		/>
	);
}
