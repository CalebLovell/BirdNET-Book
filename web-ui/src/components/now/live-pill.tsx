import { ShellSized } from "~/components/ui/shell.tsx";
import type { StationStatus } from "~/lib/station-status.ts";

const PILL_CLASS =
	"flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold text-[10px] uppercase tracking-[0.14em]";

/**
 * The station's state, set in the Live page's hero: live (recording and
 * analysing -- the moss pill with its pulsing dot), offline (a service has
 * stopped -- muted, the dot still), or unknown (the server can't ask).
 *
 * Borrows the confidence pills' shape so it reads as part of the same family.
 */
export function LivePill({ status }: { status: StationStatus }) {
	if (status === "live") {
		return (
			<span
				className={PILL_CLASS}
				style={{ backgroundColor: "var(--live-fill)", color: "var(--moss)" }}
			>
				<span className="live-dot" aria-hidden="true" />
				Live
			</span>
		);
	}
	return (
		<span
			className={`${PILL_CLASS} bg-muted text-muted-foreground`}
			title={
				status === "offline"
					? "BirdNET's recording or analysis service isn't running."
					: "The station's services couldn't be checked from here."
			}
		>
			<span
				className="inline-block size-2 rounded-full bg-current opacity-60"
				aria-hidden="true"
			/>
			{status === "offline" ? "Offline" : "Unknown"}
		</span>
	);
}

/** The pill before the station's status arrives: a shell of its size. */
export function LivePillSkeleton() {
	return (
		<ShellSized className="rounded-full">
			<LivePill status="live" />
		</ShellSized>
	);
}
