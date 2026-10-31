import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
	loadSettingsPageData,
	resetSettings,
	restartStation,
	savePrivacySettings,
	saveStorageSettings,
} from "./settings.server.ts";

async function fixtureConfig(contents: string) {
	const directory = await mkdtemp(
		path.join(tmpdir(), "birdnet-settings-save-"),
	);
	const file = path.join(directory, "birdnet.conf");
	await writeFile(file, contents, "utf8");
	return { directory, file };
}

test("invalid settings neither write configuration nor run commands", async () => {
	const { file } = await fixtureConfig("PRIVACY_THRESHOLD=0\n");
	let commands = 0;
	await assert.rejects(
		savePrivacySettings(
			{ privacyThreshold: 4 },
			{
				settingsPath: file,
				runner: async () => {
					commands++;
				},
			},
		),
	);
	assert.equal(await readFile(file, "utf8"), "PRIVACY_THRESHOLD=0\n");
	assert.equal(commands, 0);
});

test("a failed restart leaves saved values and reports partial success", async () => {
	const { file } = await fixtureConfig("PRIVACY_THRESHOLD=0\n");
	const result = await savePrivacySettings(
		{ privacyThreshold: 2 },
		{
			settingsPath: file,
			runner: async () => {
				throw new Error("systemctl exposed output");
			},
		},
	);
	assert.equal(await readFile(file, "utf8"), "PRIVACY_THRESHOLD=2\n");
	assert.equal(result.status, "saved-action-failed");
	assert.equal(result.values.privacyThreshold, 2);
	assert.doesNotMatch(result.message, /systemctl exposed output/);
});

test("development skip is explicit while no-action cards save normally", async () => {
	const privacy = await fixtureConfig("PRIVACY_THRESHOLD=0\n");
	const skipped = await savePrivacySettings(
		{ privacyThreshold: 1 },
		{ settingsPath: privacy.file, skipSystemActions: true },
	);
	assert.equal(skipped.status, "saved-restart-skipped");

	const storage = await fixtureConfig(
		"FULL_DISK=purge\nPURGE_THRESHOLD=95\nMAX_FILES_SPECIES=0\n",
	);
	const saved = await saveStorageSettings(
		{
			fullDiskAction: "keep",
			purgeThreshold: 90,
			maxFilesPerSpecies: 100,
			keepPerSpecies: 10,
		},
		{ settingsPath: storage.file },
	);
	assert.equal(saved.status, "saved");
});

test("loads installed model choices and normalized configuration", async () => {
	const { directory, file } = await fixtureConfig(
		[
			'SITE_NAME="Backyard"',
			"LATITUDE=41.1",
			"LONGITUDE=-93.2",
			"MODEL=BirdNET_GLOBAL_6K_V2.4_Model_FP16",
			"DATA_MODEL_VERSION=1",
			"SF_THRESH=0.03",
			"CONFIDENCE=0.7",
			"SENSITIVITY=1.25",
			"OVERLAP=0",
			"PRIVACY_THRESHOLD=0",
			"REC_CARD=default",
			"CHANNELS=2",
			"RTSP_STREAM=",
			"RTSP_STREAM_TO_LIVESTREAM=0",
			"RECORDING_LENGTH=15",
			"EXTRACTION_LENGTH=",
			"AUDIOFMT=mp3",
			"FULL_DISK=purge",
			"PURGE_THRESHOLD=95",
			"MAX_FILES_SPECIES=0",
		].join("\n"),
	);
	await writeFile(
		path.join(directory, "BirdNET_GLOBAL_6K_V2.4_Model_FP16.tflite"),
		"model",
	);
	const page = await loadSettingsPageData({
		settingsPath: file,
		modelDirectory: directory,
		currentTimezone: "America/Chicago",
	});
	assert.equal(page.station.siteName, "Backyard");
	assert.equal(page.station.timezone, "America/Chicago");
	assert.deepEqual(
		page.supportedModels.map((model) => model.id),
		["BirdNET_GLOBAL_6K_V2.4_Model_FP16"],
	);
	assert.ok(page.supportedTimezones.includes("America/Chicago"));
	assert.equal(page.review.rareSpeciesMax, 10);
});

test("reset returns every card but Station to its defaults", async () => {
	const { directory, file } = await fixtureConfig(
		[
			'SITE_NAME="Backyard"',
			"LATITUDE=41.1",
			"LONGITUDE=-93.2",
			"MODEL=Perch_v2",
			"DATA_MODEL_VERSION=2",
			"SF_THRESH=0.5",
			"CONFIDENCE=0.95",
			"SENSITIVITY=0.8",
			"OVERLAP=2",
			"PRIVACY_THRESHOLD=2.5",
			"REC_CARD=hw:1,0",
			"CHANNELS=1",
			'RTSP_STREAM="rtsp://camera/live"',
			"RTSP_STREAM_TO_LIVESTREAM=0",
			"RECORDING_LENGTH=30",
			"EXTRACTION_LENGTH=9",
			"AUDIOFMT=flac",
			"FULL_DISK=keep",
			"PURGE_THRESHOLD=40",
			"MAX_FILES_SPECIES=25",
			"REVIEW_RARE_SPECIES_MAX=99",
			"BIRDWEATHER_ID=secret-that-must-survive",
		].join("\n"),
	);
	const result = await resetSettings({
		settingsPath: file,
		skipSystemActions: true,
	});
	assert.equal(result.status, "reset-restart-skipped");

	const page = await loadSettingsPageData({
		settingsPath: file,
		modelDirectory: directory,
		currentTimezone: "America/Chicago",
	});
	assert.deepEqual(page.detection, {
		model: "BirdNET_GLOBAL_6K_V2.4_Model_FP16",
		dataModelVersion: 1,
		speciesFrequencyThreshold: 0.03,
		confidence: 0.7,
		sensitivity: 1.25,
		overlap: 0,
	});
	assert.deepEqual(page.privacy, { privacyThreshold: 0 });
	assert.deepEqual(page.audio, {
		mode: "microphone",
		recordingDevice: "default",
		channels: 2,
		rtspStreams: [],
		livestreamIndex: 0,
	});
	assert.deepEqual(page.recording, {
		recordingLength: 15,
		extractionLength: null,
		audioFormat: "mp3",
	});
	assert.deepEqual(page.storage, {
		fullDiskAction: "purge",
		purgeThreshold: 95,
		maxFilesPerSpecies: 0,
		keepPerSpecies: 10,
	});
	assert.deepEqual(page.review, { rareSpeciesMax: 10 });

	// The two things a reset must not touch: the station's own identity, and
	// every unrelated line of the file.
	assert.equal(page.station.siteName, "Backyard");
	assert.equal(page.station.latitude, 41.1);
	assert.equal(page.station.longitude, -93.2);
	assert.match(
		await readFile(file, "utf8"),
		/^BIRDWEATHER_ID=secret-that-must-survive$/m,
	);
});

test("reset restarts each affected service once", async () => {
	const { file } = await fixtureConfig("PRIVACY_THRESHOLD=1\n");
	const commands: string[][] = [];
	const result = await resetSettings({
		settingsPath: file,
		runner: async (executable, args) => {
			commands.push([executable, ...args]);
		},
	});
	assert.equal(result.status, "reset");
	assert.equal(commands.length, 1);
	const services = commands[0].slice(3);
	assert.deepEqual(services, [...new Set(services)]);
	assert.ok(services.includes("birdnet_analysis.service"));
	assert.ok(services.includes("birdnet_recording.service"));
});

test("a failed restart still reports the reset that landed", async () => {
	const { file } = await fixtureConfig("PRIVACY_THRESHOLD=1\n");
	const result = await resetSettings({
		settingsPath: file,
		runner: async () => {
			throw new Error("systemctl exposed output");
		},
	});
	assert.equal(result.status, "reset-action-failed");
	assert.doesNotMatch(result.message, /systemctl exposed output/);
	assert.match(await readFile(file, "utf8"), /^PRIVACY_THRESHOLD=0$/m);
});

test("a save that cannot restart says so in the reader's terms", async () => {
	const { file } = await fixtureConfig("PRIVACY_THRESHOLD=0\n");
	const refused = await savePrivacySettings(
		{ privacyThreshold: 2 },
		{
			settingsPath: file,
			runner: async () => {
				throw new Error("boom");
			},
		},
	);
	const declined = await savePrivacySettings(
		{ privacyThreshold: 2 },
		{ settingsPath: file, skipSystemActions: true },
	);
	// A refused restart and a declined one leave the station in the same place,
	// so they read identically -- the difference is ours, not the reader's.
	assert.equal(
		refused.message,
		"Saved. Restart BirdNET for this to take effect.",
	);
	assert.equal(declined.message, refused.message);
	for (const message of [refused.message, declined.message]) {
		assert.doesNotMatch(message, /system action|systemctl|service/i);
	}
});

test("a card with nothing to restart just saves", async () => {
	const { file } = await fixtureConfig(
		"FULL_DISK=purge\nPURGE_THRESHOLD=95\nMAX_FILES_SPECIES=0\n",
	);
	const saved = await saveStorageSettings(
		{
			fullDiskAction: "keep",
			purgeThreshold: 90,
			maxFilesPerSpecies: 0,
			keepPerSpecies: 10,
		},
		{ settingsPath: file, skipSystemActions: true },
	);
	// Storage is read per operation, so it is live the moment it is written --
	// offering a restart here would be asking for a pointless interruption.
	assert.equal(saved.status, "saved");
	assert.equal(saved.message, "Saved.");
});

test("restart bounces exactly the named card's services", async () => {
	const commands: string[][] = [];
	const result = await restartStation("audio", {
		runner: async (executable, args) => {
			commands.push([executable, ...args]);
		},
	});
	assert.equal(result.status, "restarted");
	assert.deepEqual(commands, [
		[
			"sudo",
			"systemctl",
			"restart",
			"birdnet_recording.service",
			"livestream.service",
		],
	]);
});

test("restart without a card brings back the whole set once", async () => {
	const commands: string[][] = [];
	await restartStation(undefined, {
		runner: async (executable, args) => {
			commands.push([executable, ...args]);
		},
	});
	assert.equal(commands.length, 1);
	const services = commands[0].slice(3);
	assert.deepEqual(services, [...new Set(services)]);
});

test("restarting distinguishes nothing to do from a declined restart", async () => {
	let commands = 0;
	const runner = async () => {
		commands++;
	};
	// Storage has no services, so it genuinely is already live.
	const nothing = await restartStation("storage", { runner });
	assert.equal(nothing.status, "nothing-to-restart");
	assert.match(nothing.message, /already live/);

	// Detection does, and a declined restart leaves it on the old values --
	// reporting that as "nothing needed restarting" would be false.
	const declined = await restartStation("detection", {
		runner,
		skipSystemActions: true,
	});
	assert.equal(declined.status, "restart-skipped");
	assert.doesNotMatch(declined.message, /already live/);
	assert.match(declined.message, /next time BirdNET starts/);

	assert.equal(commands, 0);
});

test("a failed restart explains the consequence without exposing systemctl", async () => {
	await assert.rejects(
		restartStation("detection", {
			runner: async () => {
				throw new Error("systemctl exposed output");
			},
		}),
		(error: Error) => {
			assert.doesNotMatch(error.message, /systemctl exposed output/);
			// The reader's real question after a failed restart: are my settings gone?
			assert.match(error.message, /saved/i);
			return true;
		},
	);
});

test("configuration access errors do not reveal paths", async () => {
	const missing = path.join(
		tmpdir(),
		"birdnet-secret-location",
		"missing.conf",
	);
	await assert.rejects(
		loadSettingsPageData({ settingsPath: missing }),
		(error: Error) => {
			assert.equal(error.message, "BirdNET settings are unavailable.");
			assert.doesNotMatch(error.message, /birdnet-secret-location/);
			return true;
		},
	);
});
