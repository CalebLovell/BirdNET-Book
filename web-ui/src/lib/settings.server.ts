import "@tanstack/react-start/server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { timezoneOptions } from "~/lib/timezones.ts";

import {
	readReviewRareSpeciesMax,
	readSettingsPageValues,
	resolveSettingsPath,
	writeSettingsCard,
} from "./settings-config.server.ts";
import {
	type AudioSettings,
	type DetectionSettings,
	type PrivacySettings,
	parseSettingsCard,
	RESETTABLE_CARDS,
	type RecordingSettings,
	type ReviewSettings,
	SETTINGS_DEFAULTS,
	type SettingsByKind,
	type SettingsCardKind,
	type SettingsPageData,
	type SettingsSaveResult,
	type StationSettings,
	type StorageSettings,
	SUPPORTED_MODELS,
} from "./settings-data.ts";
import {
	restartServices,
	runCardSystemActions,
	type SettingsCommandRunner,
} from "./settings-system.server.ts";

export { readReviewRareSpeciesMax };

export type SettingsServerDependencies = {
	settingsPath?: string;
	modelDirectory?: string;
	currentTimezone?: string;
	timezoneFileExists?: boolean;
	skipSystemActions?: boolean;
	runner?: SettingsCommandRunner;
};

async function currentTimezone() {
	try {
		const configured = (await readFile("/etc/timezone", "utf8")).trim();
		if (configured) return configured;
	} catch {
		// Non-Debian and development hosts fall back to the runtime timezone.
	}
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function installedModels(
	modelDirectory: string,
	configuredModel: string,
) {
	let names: string[] = [];
	try {
		names = await readdir(modelDirectory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const installed = new Set(
		names
			.filter((name) => name.endsWith(".tflite"))
			.map((name) => name.slice(0, -".tflite".length)),
	);
	return SUPPORTED_MODELS.filter(
		(model) => installed.has(model.id) || model.id === configuredModel,
	).map((model) => ({
		...model,
		label:
			installed.has(model.id) || model.id !== configuredModel
				? model.label
				: `${model.label} (configured file missing)`,
	}));
}

export async function loadSettingsPageData(
	dependencies: SettingsServerDependencies = {},
): Promise<SettingsPageData> {
	try {
		const timezone = dependencies.currentTimezone ?? (await currentTimezone());
		const settings = await readSettingsPageValues(
			dependencies.settingsPath ?? resolveSettingsPath(),
			timezone,
		);
		const modelDirectory =
			dependencies.modelDirectory ??
			process.env.BIRDNET_MODEL_DIR ??
			path.resolve(process.cwd(), "../model");
		return {
			...settings,
			supportedModels: await installedModels(
				modelDirectory,
				settings.detection.model,
			),
			supportedTimezones: timezoneOptions(),
		};
	} catch {
		throw new Error("BirdNET settings are unavailable.");
	}
}

/**
 * The one thing the reader needs to know, in the words they would use for it:
 * the value is stored, BirdNET has not picked it up yet, and a restart is what
 * does. Whether the restart was declined by the environment or attempted and
 * refused is a distinction only this file cares about -- both leave the station
 * running the old value, and both are fixed by the same button.
 */
const SAVED_NEEDS_RESTART = "Saved. Restart BirdNET for this to take effect.";
const RESET_NEEDS_RESTART =
	"Reset to defaults. Restart BirdNET for this to take effect.";

async function saveSettings<K extends SettingsCardKind>(
	kind: K,
	input: SettingsByKind[K],
	dependencies: SettingsServerDependencies,
): Promise<SettingsSaveResult<SettingsByKind[K]>> {
	const values = parseSettingsCard(kind, input);
	let previousTimezone: string | undefined;
	if (kind === "station")
		previousTimezone =
			dependencies.currentTimezone ?? (await currentTimezone());
	try {
		await writeSettingsCard(
			kind,
			values,
			dependencies.settingsPath ?? resolveSettingsPath(),
		);
	} catch {
		throw new Error("Settings could not be saved.");
	}
	try {
		const action = await runCardSystemActions(
			kind,
			{
				previousTimezone,
				timezone:
					kind === "station"
						? (values as SettingsByKind["station"]).timezone
						: undefined,
				timezoneFileExists: dependencies.timezoneFileExists,
				skipSystemActions: dependencies.skipSystemActions,
			},
			dependencies.runner,
		);
		return action.skipped
			? {
					status: "saved-restart-skipped",
					values,
					message: SAVED_NEEDS_RESTART,
				}
			: {
					status: "saved",
					values,
					message: action.attempted ? "Saved and now in effect." : "Saved.",
				};
	} catch {
		return {
			status: "saved-action-failed",
			values,
			message: SAVED_NEEDS_RESTART,
		};
	}
}

export function saveStationSettings(
	input: StationSettings,
	dependencies: SettingsServerDependencies = {},
) {
	return saveSettings("station", input, dependencies);
}

export function saveDetectionSettings(
	input: DetectionSettings,
	dependencies: SettingsServerDependencies = {},
) {
	return saveSettings("detection", input, dependencies);
}

export function savePrivacySettings(
	input: PrivacySettings,
	dependencies: SettingsServerDependencies = {},
) {
	return saveSettings("privacy", input, dependencies);
}

export function saveAudioSettings(
	input: AudioSettings,
	dependencies: SettingsServerDependencies = {},
) {
	return saveSettings("audio", input, dependencies);
}

export function saveRecordingSettings(
	input: RecordingSettings,
	dependencies: SettingsServerDependencies = {},
) {
	return saveSettings("recording", input, dependencies);
}

export function saveStorageSettings(
	input: StorageSettings,
	dependencies: SettingsServerDependencies = {},
) {
	return saveSettings("storage", input, dependencies);
}

export function saveReviewSettings(
	input: ReviewSettings,
	dependencies: SettingsServerDependencies = {},
) {
	return saveSettings("review", input, dependencies);
}

export type SettingsResetResult = {
	status: "reset" | "reset-restart-skipped" | "reset-action-failed";
	message: string;
};

/**
 * Returns every card but Station to its install default. Station is left alone
 * deliberately -- see `SETTINGS_DEFAULTS`, which has no entry for it.
 *
 * Cards are written one at a time rather than in a single pass because each
 * still goes through its own schema on the way out; a value that cannot be
 * parsed stops the reset before it touches the file. Nothing is rolled back if
 * a later write fails, so the file is left part-reset and the caller is told
 * plainly -- the alternative, a staged rewrite of birdnet.conf, would risk the
 * lines this UI does not own.
 */
export async function resetSettings(
	dependencies: SettingsServerDependencies = {},
): Promise<SettingsResetResult> {
	const settingsPath = dependencies.settingsPath ?? resolveSettingsPath();
	for (const kind of RESETTABLE_CARDS) {
		try {
			await writeSettingsCard(kind, SETTINGS_DEFAULTS[kind], settingsPath);
		} catch {
			throw new Error("Settings could not be reset.");
		}
	}
	try {
		const action = await restartServices(
			undefined,
			{ skipSystemActions: dependencies.skipSystemActions },
			dependencies.runner,
		);
		return action.skipped
			? { status: "reset-restart-skipped", message: RESET_NEEDS_RESTART }
			: {
					status: "reset",
					message: action.attempted
						? "Reset to defaults and now in effect."
						: "Reset to defaults.",
				};
	} catch {
		return { status: "reset-action-failed", message: RESET_NEEDS_RESTART };
	}
}

export type RestartResult = {
	status: "restarted" | "nothing-to-restart" | "restart-skipped";
	message: string;
};

/**
 * Retries the restart a save could not finish. Named for what the reader asked
 * for rather than for systemd: from the page it is "the new settings are not
 * live yet, make them live", and the services involved are this file's problem.
 */
export async function restartStation(
	card?: SettingsCardKind,
	dependencies: SettingsServerDependencies = {},
): Promise<RestartResult> {
	try {
		const action = await restartServices(
			card,
			{ skipSystemActions: dependencies.skipSystemActions },
			dependencies.runner,
		);
		if (action.attempted)
			return {
				status: "restarted",
				message: "Restarted. Your settings are live.",
			};
		// Two different nothings, and saying the wrong one is a lie: a card with
		// no services really is live already, but a restart the environment
		// declined has left the station on its old values.
		return action.skipped
			? {
					status: "restart-skipped",
					message:
						"Restarting is disabled in this environment. Your settings apply the next time BirdNET starts.",
				}
			: {
					status: "nothing-to-restart",
					message: "Nothing needed restarting — this setting was already live.",
				};
	} catch {
		// Deliberately no systemctl output: it can carry paths and unit detail,
		// and this reaches a browser.
		throw new Error(
			"BirdNET could not be restarted. Your settings are saved and will apply the next time it starts.",
		);
	}
}
