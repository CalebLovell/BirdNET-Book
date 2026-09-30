import {
	Binoculars,
	Bird,
	ChartNoAxesColumnIncreasing,
	Feather,
} from "lucide-react";

import { Figure } from "~/components/page-header-card.tsx";
import type { NowSummary } from "~/lib/now.ts";

/**
 * The last 24 hours at a glance, at the head of the rail above Listen: how
 * many kinds of bird, how many visits the log folds them into, how many
 * detections those visits hold, and who was loudest. Two by two at every
 * width, so the rail stays a narrow column. Follows the poll, so the figures
 * move as birds arrive.
 */
export function LiveSummaryStats({ summary }: { summary: NowSummary }) {
	return (
		<dl className="grid grid-cols-2 gap-(--page-gap)">
			<Figure compact label="Species" value={summary.species} icon={Feather} />
			<Figure compact label="Visits" value={summary.visits} icon={Binoculars} />
			<Figure
				compact
				label="Detections"
				value={summary.detections}
				icon={ChartNoAxesColumnIncreasing}
			/>
			<Figure
				compact
				label="Most heard"
				value={summary.topSpecies?.comName ?? "—"}
				icon={Bird}
			/>
		</dl>
	);
}
