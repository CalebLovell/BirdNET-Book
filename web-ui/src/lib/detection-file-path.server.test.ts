import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveDetectionClipPath } from "./detection-file-path.server.ts";

// An absolute root on whichever OS runs the tests: a literal "C:\clips" is
// a relative name on Linux, so CI resolved it beneath the working directory.
const root = path.resolve("clips");

test("resolves a detection clip beneath the extracted root", () => {
	assert.equal(
		resolveDetectionClipPath(root, {
			date: "2026-07-23",
			commonName: "House Sparrow",
			fileName: "call.wav",
		}),
		path.join(root, "By_Date", "2026-07-23", "House_Sparrow", "call.wav"),
	);
});

test("rejects a clip path that escapes the extracted root", () => {
	assert.equal(
		resolveDetectionClipPath(root, {
			date: "2026-07-23",
			commonName: "House Sparrow",
			fileName: "../../outside.wav",
		}),
		null,
	);
});
