import "@tanstack/react-start/server-only";

import { statfs } from "node:fs/promises";

import { extractedDir } from "~/lib/audio.server.ts";
import type { StationHealth } from "~/lib/health-data.ts";

/**
 * The filesystem holding the recordings, which is the one the purge threshold
 * is about -- not necessarily the one the app is installed on.
 */
async function diskUsedPercent(): Promise<number | null> {
	try {
		const stats = await statfs(extractedDir());
		const total = stats.blocks * stats.bsize;
		// `bavail` excludes the root-reserved blocks, so this is the space that
		// actually remains for recordings rather than the theoretical figure.
		const free = stats.bavail * stats.bsize;
		if (!(total > 0)) return null;
		return ((total - free) / total) * 100;
	} catch {
		return null;
	}
}

/** Never throws; a disk it cannot measure comes back as null. */
export async function loadStationHealth(): Promise<StationHealth> {
	return { diskUsedPercent: await diskUsedPercent() };
}
