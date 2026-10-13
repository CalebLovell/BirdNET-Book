import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUnlocked } from "./auth.ts";
import {
	loadSettingsPageData,
	resetSettings,
	restartStation,
	saveAudioSettings,
	saveDetectionSettings,
	saveHighlightSettings,
	savePrivacySettings,
	saveRecordingSettings,
	saveReviewSettings,
	saveStationSettings,
	saveStorageSettings,
	saveUpdateSettings,
} from "./settings.server.ts";
import {
	audioSettingsSchema,
	detectionSettingsSchema,
	highlightSettingsSchema,
	privacySettingsSchema,
	recordingSettingsSchema,
	reviewSettingsSchema,
	stationSettingsSchema,
	storageSettingsSchema,
	updateSettingsSchema,
} from "./settings-data.ts";

export const getSettingsPage = createServerFn({ method: "GET" })
	.middleware([requireUnlocked])
	.handler(() => loadSettingsPageData());

export const saveStationSettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(stationSettingsSchema)
	.handler(({ data }) => saveStationSettings(data));

export const saveDetectionSettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(detectionSettingsSchema)
	.handler(({ data }) => saveDetectionSettings(data));

export const savePrivacySettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(privacySettingsSchema)
	.handler(({ data }) => savePrivacySettings(data));

export const saveAudioSettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(audioSettingsSchema)
	.handler(({ data }) => saveAudioSettings(data));

export const saveRecordingSettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(recordingSettingsSchema)
	.handler(({ data }) => saveRecordingSettings(data));

export const saveStorageSettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(storageSettingsSchema)
	.handler(({ data }) => saveStorageSettings(data));

export const saveReviewSettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(reviewSettingsSchema)
	.handler(({ data }) => saveReviewSettings(data));

export const saveHighlightSettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(highlightSettingsSchema)
	.handler(({ data }) => saveHighlightSettings(data));

export const saveUpdateSettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(updateSettingsSchema)
	.handler(({ data }) => saveUpdateSettings(data));

export const resetSettingsFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.handler(() => resetSettings());

/**
 * The card names the services to bounce, so a stale Detection card does not
 * take the recorder down with it. Validated against the known cards rather
 * than trusted: this ends in an argument list to `systemctl restart`.
 */
export const restartStationFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.validator(
		z.object({
			card: z
				.enum([
					"station",
					"detection",
					"privacy",
					"audio",
					"recording",
					"storage",
					"review",
					"highlights",
					"updates",
				])
				.optional(),
		}),
	)
	.handler(({ data }) => restartStation(data.card));
