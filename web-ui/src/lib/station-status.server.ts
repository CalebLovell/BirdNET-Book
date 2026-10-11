import "@tanstack/react-start/server-only";

import { spawn } from "node:child_process";

import type { StationStatus } from "./station-status.ts";

/** The two services that make a station "live": one records, one listens. */
const LIVE_SERVICES = ["birdnet_recording.service", "birdnet_analysis.service"];

/** Long enough for a busy Pi to answer, short enough not to hold a poll. */
const TIMEOUT_MS = 3_000;

/**
 * Whether the station is listening right now, from systemd itself:
 * `systemctl is-active` exits 0 only when every service named is active.
 * Anything else it answers is "offline". A machine where systemctl can't be
 * run at all -- a development laptop, a container -- or that doesn't answer in
 * time is "unknown": there is no station there to describe.
 */
export function readStationStatus(): Promise<StationStatus> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (status: StationStatus) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(status);
		};

		let child: ReturnType<typeof spawn>;
		try {
			child = spawn("systemctl", ["is-active", "--quiet", ...LIVE_SERVICES], {
				shell: false,
				stdio: "ignore",
				windowsHide: true,
			});
		} catch {
			resolve("unknown");
			return;
		}
		const timer = setTimeout(() => {
			child.kill();
			finish("unknown");
		}, TIMEOUT_MS);
		child.once("error", () => finish("unknown"));
		child.once("exit", (code) => finish(code === 0 ? "live" : "offline"));
	});
}
