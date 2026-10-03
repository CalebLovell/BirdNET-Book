import { formatClockTimeWithSeconds } from "~/lib/time-ago.ts";

/**
 * The Live page's polling indicator: the pill, and the clock time of the
 * reading the page is showing, so a stalled poll shows as a clock that stops.
 *
 * Borrows the confidence pills' shape so it reads as part of the same family.
 */
export function LivePill({ generatedAt }: { generatedAt: string }) {
	return (
		<span className="flex shrink-0 items-center gap-2">
			<span
				className="flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold text-[10px] uppercase tracking-[0.14em]"
				style={{
					backgroundColor: "var(--live-fill)",
					color: "var(--moss)",
				}}
			>
				<span className="live-dot" aria-hidden="true" />
				Live
			</span>
			<span className="tabular-data text-[11px] text-muted-foreground">
				{formatClockTimeWithSeconds(generatedAt)}
			</span>
		</span>
	);
}
