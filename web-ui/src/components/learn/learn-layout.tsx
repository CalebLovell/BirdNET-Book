import {
	CalendarDays,
	Clock,
	Infinity as InfinityIcon,
	Repeat2,
} from "lucide-react";
import type { ComponentType } from "react";

import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group.tsx";
import {
	LEARN_POOL_LABELS,
	LEARN_POOLS,
	type LearnPool,
} from "~/lib/learn-pools.ts";

export const LEARN_POOL_ICONS: Record<
	LearnPool,
	ComponentType<{ className?: string }>
> = {
	today: Clock,
	week: CalendarDays,
	frequent: Repeat2,
	all: InfinityIcon,
};

export function LearnPoolSelector({
	pool,
	onPoolChange,
}: {
	pool: LearnPool;
	onPoolChange: (pool: LearnPool) => void;
}) {
	return (
		<div className="mt-4 flex justify-start overflow-x-auto">
			<ToggleGroup
				type="single"
				variant="outline"
				value={pool}
				onValueChange={(value) => {
					if (value) onPoolChange(value as LearnPool);
				}}
			>
				{LEARN_POOLS.map((option) => {
					const Icon = LEARN_POOL_ICONS[option];
					return (
						<ToggleGroupItem key={option} value={option}>
							<Icon className="size-4" />
							{LEARN_POOL_LABELS[option]}
						</ToggleGroupItem>
					);
				})}
			</ToggleGroup>
		</div>
	);
}
