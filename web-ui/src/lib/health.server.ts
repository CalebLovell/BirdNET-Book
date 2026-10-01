import "@tanstack/react-start/server-only";

import { stat, statfs } from "node:fs/promises";

import { detectionsDbPath, sqlite } from "~/db/index.ts";
import { extractedDir } from "~/lib/audio.server.ts";
import {
	formatBytes,
	formatPercent,
	type HealthMetric,
	type StationHealth,
} from "~/lib/health-data.ts";
import { formatTimeAgo } from "~/lib/time-ago.ts";

/**
 * The filesystem holding the recordings, which is the one the purge threshold
 * is about -- not necessarily the one the app is installed on.
 */
async function diskMetric(): Promise<HealthMetric> {
	const base = { id: "disk", label: "Disk used" } as const;
	try {
		const stats = await statfs(extractedDir());
		const total = stats.blocks * stats.bsize;
		// `bavail` excludes the root-reserved blocks, so this is the space that
		// actually remains for recordings rather than the theoretical figure.
		const free = stats.bavail * stats.bsize;
		if (!(total > 0)) return { ...base, value: "—" };
		const percentUsed = ((total - free) / total) * 100;
		return { ...base, value: formatPercent(percentUsed) };
	} catch {
		return { ...base, value: "Unknown" };
	}
}

async function databaseMetric(): Promise<HealthMetric> {
	const base = { id: "database", label: "Database" } as const;
	try {
		const { size } = await stat(detectionsDbPath());
		return { ...base, value: formatBytes(size) };
	} catch {
		return { ...base, value: "Unknown" };
	}
}

function lastDetectionMetric(now: number): HealthMetric {
	const base = { id: "last-detection", label: "Last detection" } as const;
	try {
		const row = sqlite
			.prepare(
				"SELECT Date date, Time time FROM detections ORDER BY Date DESC, Time DESC LIMIT 1",
			)
			.get() as { date: string; time: string } | undefined;
		if (!row) return { ...base, value: "None yet" };
		const recorded = new Date(`${row.date}T${row.time}`);
		if (Number.isNaN(recorded.getTime())) return { ...base, value: "Unknown" };
		const ageMs = now - recorded.getTime();
		return { ...base, value: formatTimeAgo(ageMs) };
	} catch {
		return { ...base, value: "Unknown" };
	}
}

/**
 * Never throws. The masthead it feeds sits above six working settings cards,
 * and a health probe is not worth taking those down for -- every metric that
 * cannot be measured says so in its own tile instead.
 */
export async function loadStationHealth(): Promise<StationHealth> {
	const metrics = await Promise.all([
		diskMetric(),
		databaseMetric(),
		Promise.resolve(lastDetectionMetric(Date.now())),
	]);
	return { metrics };
}
