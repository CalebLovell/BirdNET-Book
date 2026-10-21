import {
	ChevronDown,
	Gem,
	Infinity as InfinityIcon,
	Repeat2,
} from "lucide-react";
import type { ComponentType } from "react";

import { ShellFigure } from "~/components/ui/shell.tsx";
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
	regulars: Repeat2,
	rare: Gem,
	all: InfinityIcon,
};

/** Species each pool can quiz on, or null until the first round arrives. */
type PoolCounts = Record<LearnPool, number> | null;

export function LearnPoolSelector({
	pool,
	poolCounts,
	onPoolChange,
}: {
	pool: LearnPool;
	poolCounts: PoolCounts;
	onPoolChange: (pool: LearnPool) => void;
}) {
	return (
		// The choice on the left, what it means on the right; on a phone the
		// line drops under the control instead.
		<div className="mt-(--page-gap) flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			{/* Joined segments want about 300px, and a segmented control can't
			    wrap without breaking its own shape -- so below 640px the same choice
			    becomes a dropdown, as the timeline's period and the species sort do. */}
			<PoolSelect pool={pool} onPoolChange={onPoolChange} />
			<div className="hidden sm:block">
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

			{/* How many the chosen pool picks from. What makes a species a regular
			    is the quiz's info tip's to explain, not this line's. */}
			<p className="text-sm">
				Picking from{" "}
				{poolCounts ? (
					<strong className="tabular-data font-semibold">
						{poolCounts[pool]}
					</strong>
				) : (
					<ShellFigure />
				)}{" "}
				species.
			</p>
		</div>
	);
}

/**
 * The pool switcher on a narrow screen: a native select dressed like the
 * timeline's period menu -- the same 36px box, border, card surface and hover,
 * the chosen pool's icon in front, a chevron marking it as a dropdown. Native
 * so a phone opens its own picker.
 */
function PoolSelect({
	pool,
	onPoolChange,
}: {
	pool: LearnPool;
	onPoolChange: (pool: LearnPool) => void;
}) {
	const Icon = LEARN_POOL_ICONS[pool];
	return (
		<div className="relative shrink-0 sm:hidden">
			<Icon
				className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
				aria-hidden="true"
			/>
			<select
				aria-label="Which birds"
				value={pool}
				onChange={(event) => onPoolChange(event.target.value as LearnPool)}
				className="h-9 cursor-pointer appearance-none rounded-md border border-input bg-card pr-7 pl-8 font-medium pointer-coarse:text-base text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-[var(--focus-ring)] focus-visible:outline-none"
			>
				{LEARN_POOLS.map((option) => (
					<option key={option} value={option}>
						{LEARN_POOL_LABELS[option]}
					</option>
				))}
			</select>
			<ChevronDown
				className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
				aria-hidden="true"
			/>
		</div>
	);
}
