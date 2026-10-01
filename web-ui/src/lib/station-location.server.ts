import "@tanstack/react-start/server-only";

import { readSettingsPageValues } from "./settings-config.server.ts";

export type StationLocation = {
	latitude: number;
	longitude: number;
	timezone: string;
};

/**
 * Where the station is and which clock it keeps, from its config. Null when the
 * config can't be read: the pages that use it (the heat map's sunrise start)
 * fall back to midnight rather than failing.
 */
export async function readStationLocation(): Promise<StationLocation | null> {
	try {
		const { station } = await readSettingsPageValues();
		return {
			latitude: station.latitude,
			longitude: station.longitude,
			timezone: station.timezone,
		};
	} catch {
		return null;
	}
}
