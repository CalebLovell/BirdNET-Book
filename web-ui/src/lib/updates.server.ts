import "@tanstack/react-start/server-only";

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
	parseUpdateState,
	UNMANAGED_UPDATE_STATE,
	type UpdateState,
} from "./updates-data.ts";

/**
 * Where install_web_ui.sh keeps releases and the updater's status files. Set
 * by the birdnet_web_ui service; unset in a development checkout, which has no
 * updater to drive.
 */
function updateDirectory() {
	return process.env.BIRDNET_UPDATE_DIR;
}

async function readOptional(file: string) {
	try {
		return await readFile(file, "utf8");
	} catch {
		return null;
	}
}

export async function loadUpdateState(
	directory = updateDirectory(),
): Promise<UpdateState> {
	if (!directory) return UNMANAGED_UPDATE_STATE;
	const [installed, status] = await Promise.all([
		readOptional(path.join(directory, "installed.json")),
		readOptional(path.join(directory, "update-status.json")),
	]);
	return parseUpdateState(installed, status);
}

/** The two things the card can ask of the updater, as the units that do them. */
const UNITS = {
	check: "birdnet_update_check.service",
	install: "birdnet_update_now.service",
} as const;

/**
 * Starts the updater and returns at once: `--no-block` hands the run to
 * systemd, so an update that restarts this very server isn't cut off with it.
 * The card follows along by polling the status file.
 */
export function startUpdater(action: keyof typeof UNITS): Promise<void> {
	// Not BIRDNET_SKIP_SYSTEM_ACTIONS: a web UI beside another BirdNET-Pi sets
	// that to keep its hands off the other project's services, but still
	// updates itself (see scripts/install_updater_beside.sh).
	if (!updateDirectory())
		return Promise.reject(
			new Error("This copy of the web UI isn't managed by the updater."),
		);
	return new Promise((resolve, reject) => {
		const child = spawn(
			"sudo",
			["systemctl", "start", "--no-block", UNITS[action]],
			{ shell: false, stdio: "ignore", windowsHide: true },
		);
		child.once("error", () =>
			reject(new Error("The updater could not start.")),
		);
		child.once("exit", (code) =>
			code === 0
				? resolve()
				: reject(new Error("The updater could not start.")),
		);
	});
}
