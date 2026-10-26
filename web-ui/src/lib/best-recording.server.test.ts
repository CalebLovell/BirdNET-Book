import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { bestRecordings } from "./best-recording.server.ts";

type Row = [
	date: string,
	time: string,
	comName: string,
	confidence: number | null,
	fileName: string,
];

function fixture(rows: Row[], onDisk: string[]) {
	const database = new DatabaseSync(":memory:");
	database.exec(
		"CREATE TABLE detections (Date TEXT, Time TEXT, Sci_Name TEXT, Com_Name TEXT, Confidence REAL, File_Name TEXT)",
	);
	const insert = database.prepare(
		"INSERT INTO detections VALUES (?, ?, ?, ?, ?, ?)",
	);
	const root = mkdtempSync(path.join(tmpdir(), "best-recording-"));
	for (const [date, time, comName, confidence, fileName] of rows) {
		insert.run(date, time, `${comName} sci`, comName, confidence, fileName);
		if (onDisk.includes(fileName)) {
			const dir = path.join(
				root,
				"By_Date",
				date,
				comName.replaceAll(" ", "_"),
			);
			mkdirSync(dir, { recursive: true });
			writeFileSync(path.join(dir, fileName), "");
		}
	}
	return { database, root };
}

test("picks each species' highest-confidence clip", () => {
	const { database, root } = fixture(
		[
			["2026-10-19", "12:00:00", "Blue Jay", 0.8, "recent.wav"],
			["2026-06-30", "06:00:00", "Blue Jay", 0.98, "best.wav"],
			["2026-07-01", "07:00:00", "House Finch", 0.7, "finch.wav"],
		],
		["recent.wav", "best.wav", "finch.wav"],
	);
	const best = bestRecordings(database, root);
	assert.equal(best.get("Blue Jay")?.fileName, "best.wav");
	assert.equal(best.get("House Finch")?.fileName, "finch.wav");
});

test("breaks a confidence tie toward the most recent clip", () => {
	const { database, root } = fixture(
		[
			["2026-06-30", "06:00:00", "Blue Jay", 0.9, "older.wav"],
			["2026-07-30", "06:00:00", "Blue Jay", 0.9, "newer.wav"],
		],
		["older.wav", "newer.wav"],
	);
	assert.equal(
		bestRecordings(database, root).get("Blue Jay")?.fileName,
		"newer.wav",
	);
});

test("falls back to the next-best clip still on disk", () => {
	const { database, root } = fixture(
		[
			["2026-06-30", "06:00:00", "Blue Jay", 0.98, "deleted.wav"],
			["2026-07-01", "06:00:00", "Blue Jay", 0.9, "runner-up.wav"],
			["2026-07-02", "06:00:00", "Blue Jay", 0.5, "weak.wav"],
		],
		["runner-up.wav", "weak.wav"],
	);
	assert.equal(
		bestRecordings(database, root).get("Blue Jay")?.fileName,
		"runner-up.wav",
	);
});

test("leaves out a species with nothing left on disk", () => {
	const { database, root } = fixture(
		[["2026-06-30", "06:00:00", "Blue Jay", 0.98, "deleted.wav"]],
		[],
	);
	assert.equal(bestRecordings(database, root).has("Blue Jay"), false);
});

test("narrows to one species when named", () => {
	const { database, root } = fixture(
		[
			["2026-06-30", "06:00:00", "Blue Jay", 0.98, "jay.wav"],
			["2026-06-30", "06:00:00", "House Finch", 0.9, "finch.wav"],
		],
		["jay.wav", "finch.wav"],
	);
	assert.deepEqual(
		[...bestRecordings(database, root, "Blue Jay").keys()],
		["Blue Jay"],
	);
});
