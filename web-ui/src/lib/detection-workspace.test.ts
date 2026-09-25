import assert from "node:assert/strict";
import test from "node:test";

import {
	detectionRowKey,
	normalizeDetectionWorkspaceSearch,
} from "./detection-workspace.ts";

test("normalizes out-of-range detections search values", () => {
	assert.deepEqual(
		normalizeDetectionWorkspaceSearch({
			page: -3,
			pageSize: 999,
			sort: "unknown",
			direction: "sideways",
			minConfidence: 1.4,
		}),
		{ page: 1, pageSize: 100, sort: "recorded", direction: "desc" },
	);
});

test("uses SQLite rowid for table selection identity", () => {
	assert.equal(detectionRowKey({ rowId: 42 }), "42");
});
