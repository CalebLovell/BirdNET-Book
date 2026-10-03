import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "~/components/ui/button.tsx";

/**
 * The compact year stepper that sits in a card's header, shared by every card
 * that shows one calendar year at a time. It steps through the years that
 * actually recorded something rather than a numeric range, so a station with a
 * gap in its history never lands on an empty year by pressing next.
 *
 * With a single year on record there is nothing to step to, so it renders
 * nothing at all rather than a pair of dead buttons.
 *
 * On the smallest phones (under 400px, where the page gap halves) it steps
 * down a size with everything else, so it doesn't crowd the card's kicker.
 */
export function YearSelector({
	year,
	years,
	onChange,
}: {
	year: number;
	/** Years with detections, in any order. */
	years: number[];
	onChange: (year: number) => void;
}) {
	if (years.length <= 1) return null;

	// Neighbours rather than indices, so a year with nothing on record -- the
	// current one, before the station has heard anything this January -- still
	// steps back to the last year that did.
	const ascending = [...years].sort((a, b) => a - b);
	const previousYear = ascending.filter((it) => it < year).at(-1) ?? null;
	const nextYear = ascending.find((it) => it > year) ?? null;

	return (
		<div className="flex items-center gap-2 max-[400px]:gap-1.5">
			<Button
				variant="outline"
				size="icon-xs"
				className="max-[400px]:size-5"
				disabled={previousYear === null}
				aria-label="Previous year"
				onClick={() => previousYear !== null && onChange(previousYear)}
			>
				<ChevronLeft />
			</Button>
			<div className="tabular-data min-w-12 text-center font-semibold text-sm max-[400px]:min-w-10 max-[400px]:text-xs">
				{year}
			</div>
			<Button
				variant="outline"
				size="icon-xs"
				className="max-[400px]:size-5"
				disabled={nextYear === null}
				aria-label="Next year"
				onClick={() => nextYear !== null && onChange(nextYear)}
			>
				<ChevronRight />
			</Button>
		</div>
	);
}
