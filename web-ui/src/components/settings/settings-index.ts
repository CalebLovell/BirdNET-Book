import type { LucideIcon } from "lucide-react";
import {
	Disc3,
	HardDrive,
	MapPin,
	Mic2,
	ShieldCheck,
	SlidersHorizontal,
} from "lucide-react";

import type { SearchSetting } from "~/lib/site-search.ts";

export type SettingsIndexEntry = SearchSetting & { icon: LucideIcon };

/** The anchor a card is reachable at: "Audio input" is `/settings#audio-input`. */
export function settingsCardId(title: string): string {
	return title.toLowerCase().replaceAll(" ", "-");
}

/**
 * The Settings cards as the sidebar search knows them: each card's title and
 * icon, the labels of the fields inside it, and a few words people reach for
 * that no label says ("microphone", "disk"). Kept apart from the cards so the
 * sidebar can import it without pulling in the forms; the settings page test
 * checks every title here still names a card.
 */
export const SETTINGS_INDEX: SettingsIndexEntry[] = [
	{
		title: "Station",
		icon: MapPin,
		fields: ["Station name", "Latitude", "Longitude", "Timezone"],
		keywords: ["location", "coordinates"],
	},
	{
		title: "Detection",
		icon: SlidersHorizontal,
		fields: [
			"Analysis model",
			"Minimum confidence",
			"Sensitivity",
			"Analysis overlap",
			"Location model version",
			"Species-frequency threshold",
		],
	},
	{
		title: "Privacy",
		icon: ShieldCheck,
		fields: ["Privacy threshold"],
		keywords: ["human", "voice"],
	},
	{
		title: "Audio input",
		icon: Mic2,
		fields: [
			"Input mode",
			"Recording device",
			"Channels",
			"RTSP streams",
			"Live-player stream",
		],
		keywords: ["microphone", "stream"],
	},
	{
		title: "Recording",
		icon: Disc3,
		fields: ["Recording length", "Extraction length", "Audio format"],
		keywords: ["clip"],
	},
	{
		title: "Storage",
		icon: HardDrive,
		fields: [
			"Disk-full action",
			"Disk-used threshold",
			"Maximum files per species",
		],
		keywords: ["disk", "purge"],
	},
];
