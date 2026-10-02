import type { TooltipContentProps } from "recharts";

/**
 * The tooltip every detections chart shares: one horizontal line reading
 * "Apr — 6,042 detections" or "3 PM — 5,713 detections".
 *
 * Recharts' own tooltip stacks a bucket label above a named series row. There
 * is only ever one number behind the cursor, so it reads as a sentence on one
 * line instead, in a single colour, with only the bucket carrying weight.
 */
export function ChartValueTooltip({
	active,
	label,
	payload,
	formatLabel,
}: TooltipContentProps & {
	/** For charts whose x-axis holds a raw value (the hour of day) rather than
	 * an already-readable label. */
	formatLabel?: (label: unknown) => string;
}) {
	const raw = payload?.[0]?.value;
	const value = Number(raw);
	const shown = active && raw != null && !Number.isNaN(value);

	const bucket = formatLabel ? formatLabel(label) : String(label ?? "");
	const noun = value === 1 ? "detection" : "detections";

	// A live region, as recharts' own tooltip content is: stepping the chart
	// with the arrow keys reads each value aloud. It stays mounted while empty
	// because screen readers skip a region whose text arrives with it.
	return (
		<output
			aria-live="assertive"
			className={
				shown
					? "block rounded-sm border border-[var(--line)] bg-[var(--paper-raised)] px-2 py-1 text-[13px] text-[var(--ink)]"
					: undefined
			}
		>
			{shown && (
				<>
					<span className="font-semibold">{bucket}</span>
					{` — ${value.toLocaleString()} ${noun}`}
				</>
			)}
		</output>
	);
}
