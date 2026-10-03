import "@tanstack/react-start/server-only";

import { randomUUID } from "node:crypto";
import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";

import {
	DEFAULT_REVIEW_RARE_SPECIES_MAX,
	parseSettingsCard,
	SETTINGS_DEFAULTS,
	type SettingsByKind,
	type SettingsCardKind,
} from "./settings-data.ts";

export function resolveSettingsPath() {
	return process.env.BIRDNET_CONF ?? "/etc/birdnet/birdnet.conf";
}

function decodeShellValue(value: string) {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		return value
			.slice(1, -1)
			.replace(/\\(["\\])/g, (_match, escaped: string) => escaped);
	}
	return value;
}

export function parseBirdnetConfig(text: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const line of text.split(/\r?\n/)) {
		const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
		if (match) values[match[1]] = decodeShellValue(match[2]);
	}
	return values;
}

function numberValue(
	values: Record<string, string>,
	key: string,
	fallback: number,
) {
	const parsed = Number(values[key]);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function integerValue(
	values: Record<string, string>,
	key: string,
	fallback: number,
) {
	const parsed = Number(values[key]);
	return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export async function readSettingsPageValues(
	settingsPath = resolveSettingsPath(),
	timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<SettingsByKind> {
	const values = parseBirdnetConfig(await readFile(settingsPath, "utf8"));
	const defaults = SETTINGS_DEFAULTS;
	const streams = (values.RTSP_STREAM ?? "")
		.split(",")
		.map((stream) => stream.trim())
		.filter(Boolean);
	const extraction = values.EXTRACTION_LENGTH?.trim();
	return {
		station: parseSettingsCard("station", {
			siteName: values.SITE_NAME ?? "",
			latitude: numberValue(values, "LATITUDE", 0),
			longitude: numberValue(values, "LONGITUDE", 0),
			timezone,
		}),
		detection: parseSettingsCard("detection", {
			model: values.MODEL ?? defaults.detection.model,
			dataModelVersion: integerValue(
				values,
				"DATA_MODEL_VERSION",
				defaults.detection.dataModelVersion,
			),
			speciesFrequencyThreshold: numberValue(
				values,
				"SF_THRESH",
				defaults.detection.speciesFrequencyThreshold,
			),
			confidence: numberValue(
				values,
				"CONFIDENCE",
				defaults.detection.confidence,
			),
			sensitivity: numberValue(
				values,
				"SENSITIVITY",
				defaults.detection.sensitivity,
			),
			overlap: numberValue(values, "OVERLAP", defaults.detection.overlap),
		}),
		privacy: parseSettingsCard("privacy", {
			privacyThreshold: numberValue(
				values,
				"PRIVACY_THRESHOLD",
				defaults.privacy.privacyThreshold,
			),
		}),
		audio: parseSettingsCard("audio", {
			mode: streams.length > 0 ? "rtsp" : "microphone",
			recordingDevice: values.REC_CARD ?? defaults.audio.recordingDevice,
			channels: integerValue(values, "CHANNELS", defaults.audio.channels),
			rtspStreams: streams,
			livestreamIndex: integerValue(
				values,
				"RTSP_STREAM_TO_LIVESTREAM",
				defaults.audio.livestreamIndex,
			),
		}),
		recording: parseSettingsCard("recording", {
			recordingLength: integerValue(
				values,
				"RECORDING_LENGTH",
				defaults.recording.recordingLength,
			),
			// Blank is the documented way to ask for the backend's own 6 seconds,
			// so an empty key stays null rather than being filled in here.
			extractionLength: extraction
				? integerValue(values, "EXTRACTION_LENGTH", 6)
				: null,
			audioFormat: values.AUDIOFMT ?? defaults.recording.audioFormat,
		}),
		storage: parseSettingsCard("storage", {
			fullDiskAction: values.FULL_DISK ?? defaults.storage.fullDiskAction,
			purgeThreshold: integerValue(
				values,
				"PURGE_THRESHOLD",
				defaults.storage.purgeThreshold,
			),
			maxFilesPerSpecies: integerValue(
				values,
				"MAX_FILES_SPECIES",
				defaults.storage.maxFilesPerSpecies,
			),
		}),
		review: parseSettingsCard("review", {
			rareSpeciesMax: integerValue(
				values,
				"REVIEW_RARE_SPECIES_MAX",
				DEFAULT_REVIEW_RARE_SPECIES_MAX,
			),
		}),
	};
}

function quoteShellValue(value: string) {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function assignmentsFor<K extends SettingsCardKind>(
	kind: K,
	input: SettingsByKind[K],
): Record<string, string> {
	const value = parseSettingsCard(kind, input);
	switch (kind) {
		case "station": {
			const station = value as SettingsByKind["station"];
			return {
				SITE_NAME: quoteShellValue(station.siteName),
				LATITUDE: String(station.latitude),
				LONGITUDE: String(station.longitude),
			};
		}
		case "detection": {
			const detection = value as SettingsByKind["detection"];
			return {
				MODEL: detection.model,
				DATA_MODEL_VERSION: String(detection.dataModelVersion),
				SF_THRESH: String(detection.speciesFrequencyThreshold),
				CONFIDENCE: String(detection.confidence),
				SENSITIVITY: String(detection.sensitivity),
				OVERLAP: String(detection.overlap),
			};
		}
		case "privacy": {
			const privacy = value as SettingsByKind["privacy"];
			return { PRIVACY_THRESHOLD: String(privacy.privacyThreshold) };
		}
		case "audio": {
			const audio = value as SettingsByKind["audio"];
			return {
				REC_CARD: quoteShellValue(audio.recordingDevice),
				CHANNELS: String(audio.channels),
				RTSP_STREAM: quoteShellValue(
					audio.mode === "rtsp" ? audio.rtspStreams.join(",") : "",
				),
				RTSP_STREAM_TO_LIVESTREAM: String(
					audio.mode === "rtsp" ? audio.livestreamIndex : 0,
				),
			};
		}
		case "recording": {
			const recording = value as SettingsByKind["recording"];
			return {
				RECORDING_LENGTH: String(recording.recordingLength),
				EXTRACTION_LENGTH:
					recording.extractionLength === null
						? ""
						: String(recording.extractionLength),
				AUDIOFMT: recording.audioFormat,
			};
		}
		case "storage": {
			const storage = value as SettingsByKind["storage"];
			return {
				FULL_DISK: storage.fullDiskAction,
				PURGE_THRESHOLD: String(storage.purgeThreshold),
				MAX_FILES_SPECIES: String(storage.maxFilesPerSpecies),
			};
		}
		case "review": {
			const review = value as SettingsByKind["review"];
			return { REVIEW_RARE_SPECIES_MAX: String(review.rareSpeciesMax) };
		}
	}
}

/**
 * Rewrites in place, appending a key the file has never carried. Appending is
 * the same promise the read path already makes: `readSettingsPageValues` fills a
 * missing key with a default and shows it, so refusing to write it back would
 * leave a card displaying a value it cannot save -- which is what a station
 * installed before a key existed (REVIEW_RARE_SPECIES_MAX, say) would hit.
 * Every other line of the file, including secrets this UI never reads, is left
 * exactly as it was.
 */
function replaceAssignments(text: string, assignments: Record<string, string>) {
	let updated = text;
	for (const [key, value] of Object.entries(assignments)) {
		const expression = new RegExp(`^${key}=.*$`, "m");
		if (expression.test(updated))
			updated = updated.replace(expression, `${key}=${value}`);
		else {
			if (updated.length > 0 && !updated.endsWith("\n")) updated += "\n";
			updated += `${key}=${value}\n`;
		}
	}
	return updated;
}

export async function writeSettingsCard<K extends SettingsCardKind>(
	kind: K,
	values: SettingsByKind[K],
	settingsPath = resolveSettingsPath(),
) {
	const assignments = assignmentsFor(kind, values);
	const source = await readFile(settingsPath, "utf8");
	const sourceStat = await stat(settingsPath);
	const updated = replaceAssignments(source, assignments);
	const temporaryPath = `${settingsPath}.tmp-${process.pid}-${randomUUID()}`;
	try {
		await writeFile(temporaryPath, updated, {
			encoding: "utf8",
			mode: sourceStat.mode,
		});
		await chmod(temporaryPath, sourceStat.mode);
		await rename(temporaryPath, settingsPath);
	} finally {
		await rm(temporaryPath, { force: true });
	}
	return parseSettingsCard(kind, values);
}

export async function readReviewRareSpeciesMax(
	settingsPath = resolveSettingsPath(),
) {
	try {
		const values = parseBirdnetConfig(await readFile(settingsPath, "utf8"));
		const parsed = Number(values.REVIEW_RARE_SPECIES_MAX);
		return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10_000
			? parsed
			: DEFAULT_REVIEW_RARE_SPECIES_MAX;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT")
			return DEFAULT_REVIEW_RARE_SPECIES_MAX;
		throw error;
	}
}

/**
 * The station's own name (`SITE_NAME`), trimmed, or "" when unset or the config
 * can't be read. Only ever handed to a signed-in browser: it names whoever's
 * station this is, and Settings -- where it's edited -- is gated too.
 */
export async function readSiteName(settingsPath = resolveSettingsPath()) {
	try {
		const values = parseBirdnetConfig(await readFile(settingsPath, "utf8"));
		return (values.SITE_NAME ?? "").trim();
	} catch {
		return "";
	}
}
