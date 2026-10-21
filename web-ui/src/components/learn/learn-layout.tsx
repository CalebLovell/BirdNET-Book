import {
	Binoculars,
	ChevronDown,
	Footprints,
	Gem,
	Infinity as InfinityIcon,
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
	common: Footprints,
	uncommon: Binoculars,
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
		<div className="mt-(--page-gap)">
			{/* Joined segments want about 520px, and a segmented control can't
			    wrap without breaking its own shape -- so below 640px the same choice
			    becomes a dropdown, as the timeline's period and the species sort do. */}
			<PoolSelect
				pool={pool}
				poolCounts={poolCounts}
				onPoolChange={onPoolChange}
			/>
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
								<PoolCount count={poolCounts?.[option]} />
							</ToggleGroupItem>
						);
					})}
				</ToggleGroup>
			</div>
		</div>
	);
}

/**
 * How many species a pool picks from, as a small round pill after its label.
 * A fixed 20px tall, so it sits inside the 36px segment without making it any
 * taller, and with a line box that full height: the count's Georgia figures
 * are old-style and dip below the baseline, so a tighter line lets them spill
 * out of the pill. A faint ink wash on the other segments; on the chosen one
 * a white wash under white figures, strong enough to read on the dark fill
 * without the glare of a solid white pill.
 */
function PoolCount({ count }: { count: number | undefined }) {
	return (
		<span className="count-figure inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/8 in-data-[state=on]:bg-primary-foreground/20 px-1.5 in-data-[state=on]:text-primary-foreground! leading-5">
			{count === undefined ? <ShellFigure /> : count}
		</span>
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
	poolCounts,
	onPoolChange,
}: {
	pool: LearnPool;
	poolCounts: PoolCounts;
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
						{/* A native option holds only text, so its count rides along
						    in parentheses where the segments draw a pill. */}
						{poolCounts
							? `${LEARN_POOL_LABELS[option]} (${poolCounts[option]})`
							: LEARN_POOL_LABELS[option]}
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
