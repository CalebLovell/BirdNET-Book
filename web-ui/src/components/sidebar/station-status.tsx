import { useEffect, useState } from "react";

import {
	getStationStatus,
	type StationStatus as StationReading,
} from "~/lib/station.ts";
import { formatClockTimeWithSeconds } from "~/lib/time-ago.ts";

const POLL_INTERVAL_MS = 15_000;

/**
 * The station's own reading, fetched on mount and then polled.
 *
 * The sidebar renders in the root shell, outside the route tree, so it has no
 * loader to hang this off -- hence the fetch-on-mount rather than the
 * loader-plus-`usePolledData` pattern the routes use. Null until the first
 * response lands, which the caller renders as placeholder rows.
 */
function useStationStatus(): StationReading | null {
	const [reading, setReading] = useState<StationReading | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function read() {
			try {
				const next = await getStationStatus();
				if (!cancelled) setReading(next);
			} catch {
				// A transient failure shouldn't kill polling -- the next tick retries,
				// and the sidebar keeps showing the last good reading meanwhile.
			}
		}

		read();
		const id = setInterval(read, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, []);

	return reading;
}

/**
 * Station liveness in the sidebar's lower section. It lives in the site chrome
 * rather than on one page because the station's state describes the station,
 * not whatever card happens to be at the top of a route.
 */
export function StationStatus() {
	const reading = useStationStatus();

	return (
		<section className="flex items-center gap-2 px-4 py-3">
			<LivePill />

			{/* Fixed-height whether or not the reading has landed, so the first
			    response fills it in rather than shoving the footer down. */}
			<span className="min-h-[1.4em] truncate text-[11px] text-muted-foreground leading-tight">
				{reading ? (
					<span className="tabular-data">
						{formatClockTimeWithSeconds(reading.generatedAt)}
					</span>
				) : null}
			</span>
		</section>
	);
}

/**
 * Borrows the confidence pills' shape so the polling indicator reads as part of
 * the same family.
 */
function LivePill() {
	return (
		<span
			className="flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold text-[10px] uppercase tracking-[0.14em]"
			style={{
				backgroundColor: "var(--live-fill)",
				color: "var(--moss)",
			}}
		>
			<span className="live-dot" aria-hidden="true" />
			Live
		</span>
	);
}
