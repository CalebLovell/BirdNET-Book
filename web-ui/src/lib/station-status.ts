import { createServerFn } from "@tanstack/react-start";

import { readStationStatus } from "./station-status.server.ts";

/**
 * Whether the station is listening: "live" while BirdNET is recording and
 * analysing, "offline" when either has stopped, "unknown" where the server
 * can't tell (no systemd to ask).
 */
export type StationStatus = "live" | "offline" | "unknown";

/** Public, like the Live page it heads: it says only whether the station is
    running, nothing a locked visitor shouldn't see. */
export const getStationStatus = createServerFn({ method: "GET" }).handler(
	(): Promise<StationStatus> => readStationStatus(),
);
