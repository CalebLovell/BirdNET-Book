import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Importing these confirms every gated symbol still exists and type-checks as
// a server function -- if a name below gets renamed or removed, this file
// fails to load before the assertions even run.
import {
	isUnauthorizedError,
	requireUnlocked,
	UnauthorizedError,
} from "./auth.ts";
import { deleteDetections } from "./detections.ts";
import { getStationHealth } from "./health.ts";
import {
	confirmReviewDetection,
	deleteReviewDetection,
	getReviewPage,
	getReviewSpecies,
	recategorizeReviewDetection,
} from "./review.ts";
import {
	getSettingsPage,
	resetSettingsFn,
	restartStationFn,
	saveAudioSettingsFn,
	saveDetectionSettingsFn,
	savePrivacySettingsFn,
	saveRecordingSettingsFn,
	saveReviewSettingsFn,
	saveStationSettingsFn,
	saveStorageSettingsFn,
} from "./settings.ts";
import {
	getSpeciesControlPage,
	saveSpeciesControl,
} from "./species-control.ts";

// @tanstack/react-start's `.handler(...)` does not retain a `.options`
// property on the server function it returns (confirmed against the
// installed 1.168.x line: the returned callable only carries `method` and
// `__executeServer`), and server functions cannot be invoked outside a
// request context in this test runner. So instead of runtime reflection,
// this asserts the wiring the same way a reviewer would: each gated
// function's own source must chain `.middleware([requireUnlocked])` between
// `createServerFn(...)` and `.handler(...)`.
function sourceOf(relativePath: string) {
	return readFileSync(
		fileURLToPath(new URL(relativePath, import.meta.url)),
		"utf8",
	);
}

function assertGated(source: string, name: string) {
	const start = source.indexOf(`export const ${name} =`);
	assert.ok(start !== -1, `${name} not found in source`);
	const nextExport = source.indexOf("\nexport const", start + 1);
	const body = source.slice(start, nextExport === -1 ? undefined : nextExport);
	assert.ok(
		body.includes(".middleware([requireUnlocked])"),
		`${name} is not gated`,
	);
}

test("every gated server function carries requireUnlocked", () => {
	// Referenced so the imports above are not flagged as unused -- their
	// presence is itself part of the assertion (see comment above).
	void requireUnlocked;
	void saveSpeciesControl;
	void resetSettingsFn;
	void restartStationFn;
	void saveAudioSettingsFn;
	void saveDetectionSettingsFn;
	void savePrivacySettingsFn;
	void saveRecordingSettingsFn;
	void saveReviewSettingsFn;
	void saveStationSettingsFn;
	void saveStorageSettingsFn;
	void confirmReviewDetection;
	void deleteReviewDetection;
	void recategorizeReviewDetection;
	void getReviewPage;
	void getReviewSpecies;
	void getSettingsPage;
	void getSpeciesControlPage;
	void getStationHealth;
	void deleteDetections;

	const settingsSource = sourceOf("./settings.ts");
	for (const name of [
		"saveStationSettingsFn",
		"saveDetectionSettingsFn",
		"savePrivacySettingsFn",
		"saveAudioSettingsFn",
		"saveRecordingSettingsFn",
		"saveStorageSettingsFn",
		"saveReviewSettingsFn",
		"resetSettingsFn",
		"restartStationFn",
		"getSettingsPage",
	]) {
		assertGated(settingsSource, name);
	}

	const speciesControlSource = sourceOf("./species-control.ts");
	for (const name of ["saveSpeciesControl", "getSpeciesControlPage"]) {
		assertGated(speciesControlSource, name);
	}

	const reviewSource = sourceOf("./review.ts");
	for (const name of [
		"confirmReviewDetection",
		"recategorizeReviewDetection",
		"deleteReviewDetection",
		"getReviewPage",
		"getReviewSpecies",
	]) {
		assertGated(reviewSource, name);
	}

	// Lives outside the three gated feature modules, which is exactly how it
	// was missed the first time round.
	assertGated(sourceOf("./health.ts"), "getStationHealth");

	// Same trap: detections.ts is mostly read paths for a public page, so its
	// one destructive export shipped ungated.
	assertGated(sourceOf("./detections.ts"), "deleteDetections");
});

test("the gate's refusal is recognised after losing its class", () => {
	assert.equal(isUnauthorizedError(new UnauthorizedError()), true);
	// What reaches the browser: a plain Error carrying the same message.
	assert.equal(
		isUnauthorizedError(new Error(new UnauthorizedError().message)),
		true,
	);
	assert.equal(isUnauthorizedError(new Error("database is locked")), false);
	assert.equal(
		isUnauthorizedError("This page requires the station password."),
		false,
	);
});
