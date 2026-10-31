import assert from "node:assert/strict";
import test from "node:test";

import {
	DEFAULT_REVIEW_RARE_SPECIES_MAX,
	parseSettingsCard,
} from "./settings-data.ts";

test("accepts inclusive detector boundaries", () => {
	const settings = parseSettingsCard("detection", {
		model: "BirdNET_GLOBAL_6K_V2.4_Model_FP16",
		dataModelVersion: 2,
		speciesFrequencyThreshold: 0.0005,
		confidence: 0.99,
		sensitivity: 0.5,
		overlap: 2.9,
	});
	assert.equal(settings.speciesFrequencyThreshold, 0.0005);
	assert.equal(settings.confidence, 0.99);
	assert.equal(settings.sensitivity, 0.5);
	assert.equal(settings.overlap, 2.9);
});

test("rejects detector values outside their supported ranges", () => {
	const valid = {
		model: "BirdNET_GLOBAL_6K_V2.4_Model_FP16",
		dataModelVersion: 1,
		speciesFrequencyThreshold: 0.03,
		confidence: 0.7,
		sensitivity: 1.25,
		overlap: 0,
	};
	assert.throws(() =>
		parseSettingsCard("detection", { ...valid, confidence: 1 }),
	);
	assert.throws(() =>
		parseSettingsCard("detection", { ...valid, sensitivity: 1.51 }),
	);
	assert.throws(() =>
		parseSettingsCard("detection", {
			...valid,
			speciesFrequencyThreshold: 0.0004,
		}),
	);
	assert.throws(() => parseSettingsCard("detection", { ...valid, overlap: 3 }));
});

test("validates station coordinates, timezone, and safe text", () => {
	assert.deepEqual(
		parseSettingsCard("station", {
			siteName: "Creek North",
			latitude: 90,
			longitude: -180,
			timezone: "America/Chicago",
		}),
		{
			siteName: "Creek North",
			latitude: 90,
			longitude: -180,
			timezone: "America/Chicago",
		},
	);
	assert.throws(() =>
		parseSettingsCard("station", {
			siteName: "Bad\nName",
			latitude: 0,
			longitude: 0,
			timezone: "America/Chicago",
		}),
	);
	assert.throws(() =>
		parseSettingsCard("station", {
			siteName: "Station",
			latitude: 90.1,
			longitude: 0,
			timezone: "Not/A_Zone",
		}),
	);
});

test("normalizes RTSP lines and validates the selected live stream", () => {
	const settings = parseSettingsCard("audio", {
		mode: "rtsp",
		recordingDevice: "default",
		channels: 2,
		rtspStreams: "rtsp://one/live\n\nrtsps://two/live",
		livestreamIndex: 1,
	});
	assert.deepEqual(settings.rtspStreams, [
		"rtsp://one/live",
		"rtsps://two/live",
	]);
	assert.equal(settings.livestreamIndex, 1);
	assert.throws(() =>
		parseSettingsCard("audio", { ...settings, livestreamIndex: 2 }),
	);
	assert.throws(() =>
		parseSettingsCard("audio", { ...settings, rtspStreams: ["http://bad"] }),
	);
});

test("normalizes RTSP streams the form has already split into lines", () => {
	// The textarea sends its split lines, so a trailing newline arrives as a
	// blank entry rather than as text the schema can re-split.
	const settings = parseSettingsCard("audio", {
		mode: "rtsp",
		recordingDevice: "default",
		channels: 2,
		rtspStreams: ["rtsp://one/live", " rtsps://two/live ", ""],
		livestreamIndex: 1,
	});
	assert.deepEqual(settings.rtspStreams, [
		"rtsp://one/live",
		"rtsps://two/live",
	]);
});

test("requires a recording device in microphone mode", () => {
	assert.throws(() =>
		parseSettingsCard("audio", {
			mode: "microphone",
			recordingDevice: "  ",
			channels: 2,
			rtspStreams: [],
			livestreamIndex: 0,
		}),
	);
});

test("rejects extraction longer than its recording", () => {
	assert.throws(
		() =>
			parseSettingsCard("recording", {
				recordingLength: 10,
				extractionLength: 11,
				audioFormat: "mp3",
			}),
		/Extraction length/,
	);
	assert.deepEqual(
		parseSettingsCard("recording", {
			recordingLength: 60,
			extractionLength: null,
			audioFormat: "flac",
		}),
		{ recordingLength: 60, extractionLength: null, audioFormat: "flac" },
	);
});

test("enforces privacy and storage boundaries", () => {
	assert.deepEqual(parseSettingsCard("privacy", { privacyThreshold: 0 }), {
		privacyThreshold: 0,
	});
	assert.deepEqual(
		parseSettingsCard("storage", {
			fullDiskAction: "purge",
			purgeThreshold: 99,
			maxFilesPerSpecies: 0,
			keepPerSpecies: 10,
		}),
		{
			fullDiskAction: "purge",
			purgeThreshold: 99,
			maxFilesPerSpecies: 0,
			keepPerSpecies: 10,
		},
	);
	assert.throws(() => parseSettingsCard("privacy", { privacyThreshold: 3.1 }));
	assert.throws(() =>
		parseSettingsCard("storage", {
			fullDiskAction: "delete-everything",
			purgeThreshold: 19,
			maxFilesPerSpecies: -1,
			keepPerSpecies: -1,
		}),
	);
});

test("defaults Review rarity to ten and rejects zero", () => {
	assert.equal(DEFAULT_REVIEW_RARE_SPECIES_MAX, 10);
	assert.deepEqual(parseSettingsCard("review", {}), { rareSpeciesMax: 10 });
	assert.throws(() => parseSettingsCard("review", { rareSpeciesMax: 0 }));
});
