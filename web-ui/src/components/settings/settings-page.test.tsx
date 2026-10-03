import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { SettingsPageData } from "~/lib/settings-data.ts";
import { SETTINGS_INDEX, settingsCardId } from "./settings-index.ts";
import { SettingsPage } from "./settings-page.tsx";

const data: SettingsPageData = {
	station: {
		siteName: "Backyard station",
		latitude: 41.88,
		longitude: -87.63,
		timezone: "America/Chicago",
	},
	detection: {
		model: "BirdNET_GLOBAL_6K_V2.4_Model_FP16",
		dataModelVersion: 2,
		speciesFrequencyThreshold: 0.03,
		confidence: 0.7,
		sensitivity: 1,
		overlap: 0,
	},
	privacy: { privacyThreshold: 0 },
	audio: {
		mode: "microphone",
		recordingDevice: "default",
		channels: 1,
		rtspStreams: [],
		livestreamIndex: 0,
	},
	recording: {
		recordingLength: 15,
		extractionLength: null,
		audioFormat: "mp3",
	},
	storage: {
		fullDiskAction: "purge",
		purgeThreshold: 90,
		maxFilesPerSpecies: 0,
	},
	review: { rareSpeciesMax: 10 },
	supportedModels: [
		{
			id: "BirdNET_GLOBAL_6K_V2.4_Model_FP16",
			label: "BirdNET Global 6K v2.4",
			supportsRangeModel: true,
		},
	],
	supportedTimezones: ["America/Chicago", "UTC"],
};

test("renders every settings card in order with independent save controls", () => {
	const markup = renderToStaticMarkup(<SettingsPage data={data} />);
	const headings = [
		"Station",
		"Detection",
		"Privacy",
		"Audio input",
		"Recording",
		"Storage",
	];
	let priorIndex = -1;
	for (const heading of headings) {
		const index = markup.indexOf(`>${heading}<`);
		assert.ok(
			index > priorIndex,
			`${heading} should follow the preceding card`,
		);
		priorIndex = index;
	}
	assert.equal((markup.match(/<form/g) ?? []).length, 6);
	assert.equal((markup.match(/>Save</g) ?? []).length, 6);
});

test("a freshly loaded card has nothing to save", () => {
	const markup = renderToStaticMarkup(<SettingsPage data={data} />);
	// Every Save starts disabled: the form matches the station exactly, so the
	// button would write back the values it was just given. Matched on the
	// attribute, not the string "disabled", which also appears in every
	// button's `disabled:opacity-50` class.
	assert.equal((markup.match(/disabled=""/g) ?? []).length, 6);
	for (const submit of markup.match(/<button[^>]*type="submit"[^>]*>/g) ?? []) {
		assert.match(submit, /disabled=""/);
	}
	// The header's own control is not a save and stays live.
	assert.match(markup, />Use my location</);
});

test("says nothing in a card footer until there is something to say", () => {
	const markup = renderToStaticMarkup(<SettingsPage data={data} />);
	// The old standing note explained the page's save model on every card,
	// forever. It is a property of the page, not news about this card.
	assert.doesNotMatch(markup, /save separately/i);
	// The live region survives, empty, so a save result still announces.
	assert.match(markup, /aria-live="polite"/);
});

test("offers reset only when the page can perform one, and asks first", () => {
	const withoutReset = renderToStaticMarkup(<SettingsPage data={data} />);
	assert.doesNotMatch(withoutReset, />Reset to defaults</);

	const withReset = renderToStaticMarkup(
		<SettingsPage
			data={data}
			onReset={async () => ({
				message: "Reset to defaults.",
				needsRestart: false,
			})}
		/>,
	);
	assert.match(withReset, />Reset to defaults</);
	// Destructive, so nothing happens until the dialog is opened and confirmed.
	assert.doesNotMatch(withReset, /role="alertdialog"/);
});

test("leaves the review-queue threshold to the Review page", () => {
	const markup = renderToStaticMarkup(<SettingsPage data={data} />);
	assert.doesNotMatch(markup, />Review queue</);
	assert.doesNotMatch(markup, />Rare species threshold</);
});

test("explains consequential storage settings beside their controls", () => {
	const markup = renderToStaticMarkup(<SettingsPage data={data} />);
	assert.match(markup, /removes the oldest recordings/i);
	assert.match(markup, /stops core services/i);
	for (const label of [
		"Station name",
		"Minimum confidence",
		"Privacy threshold",
		"Input mode",
		"Recording length",
		"Disk-full action",
	]) {
		assert.match(markup, new RegExp(`>${label}<`));
	}
});

test("every card the sidebar search knows is on the page at its anchor", () => {
	const markup = renderToStaticMarkup(<SettingsPage data={data} />);
	for (const entry of SETTINGS_INDEX) {
		const id = settingsCardId(entry.title);
		assert.match(markup, new RegExp(`<section id="${id}"`));
		assert.match(markup, new RegExp(`>${entry.title}<`));
	}
	assert.equal(
		(markup.match(/<section id=/g) ?? []).length,
		SETTINGS_INDEX.length,
	);
});
