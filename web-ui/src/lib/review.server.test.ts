import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as fileSystem from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
	correctDetection,
	deleteDetectionDirectly,
	loadReviewPage,
	recategorizeDetection,
} from "./review.server.ts";

function fixture() {
	const database = new DatabaseSync(":memory:");
	database.exec(
		"CREATE TABLE detections (Date TEXT, Time TEXT, Sci_Name TEXT, Com_Name TEXT, Confidence REAL, File_Name TEXT)",
	);
	const insert = database.prepare(
		"INSERT INTO detections VALUES (?, ?, ?, ?, ?, ?)",
	);
	insert.run(
		"2026-07-27",
		"06:00",
		"Piranga olivacea",
		"Scarlet Tanager",
		0.4,
		"Scarlet_Tanager-a.mp3",
	);
	insert.run(
		"2026-07-26",
		"06:00",
		"Cyanocitta cristata",
		"Blue Jay",
		0.2,
		"Blue_Jay-a.mp3",
	);
	insert.run(
		"2026-07-25",
		"06:00",
		"Cyanocitta cristata",
		"Blue Jay",
		1,
		"Blue_Jay-confirmed.mp3",
	);
	return database;
}

/**
 * Six species spanning a station's range: three under the rarity cut (1, 2 and
 * 3 lifetime detections), one sitting exactly on it (10), and two well clear of
 * it. Every detection is weak unless the caller says otherwise.
 */
function bandedFixture() {
	const database = new DatabaseSync(":memory:");
	database.exec(
		"CREATE TABLE detections (Date TEXT, Time TEXT, Sci_Name TEXT, Com_Name TEXT, Confidence REAL, File_Name TEXT)",
	);
	const insert = database.prepare(
		"INSERT INTO detections VALUES (?, ?, ?, ?, ?, ?)",
	);
	const species: [string, string, number][] = [
		["Bombycilla cedrorum", "Cedar Waxwing", 1],
		["Gavia immer", "Common Loon", 2],
		["Strix varia", "Barred Owl", 3],
		["Junco hyemalis", "Dark-eyed Junco", 10],
		["Cyanocitta cristata", "Blue Jay", 20],
		["Turdus migratorius", "American Robin", 30],
	];
	for (const [sciName, comName, total] of species)
		for (let i = 0; i < total; i++)
			insert.run(
				"2026-07-27",
				"06:00",
				sciName,
				comName,
				0.7,
				`${comName.replaceAll(" ", "_")}-${i}.mp3`,
			);
	return database;
}

test("the queue holds only rarely heard species, rarest first", async () => {
	const database = bandedFixture();
	const root = await mkdtemp(path.join(tmpdir(), "birdnet-review-rare-"));
	const audio = path.join(root, "By_Date", "2026-07-27", "Cedar_Waxwing");
	mkdirSync(audio, { recursive: true });
	writeFileSync(path.join(audio, "Cedar_Waxwing-0.mp3"), "audio");
	const page = loadReviewPage(database, root, { page: 1 }, undefined, 50);
	// Dark-eyed Junco sits exactly on the cut at 10, so it is out -- as are the
	// common feeder birds, however weak their recordings.
	assert.deepEqual(
		[...new Set(page.candidates.map((row) => row.comName))],
		["Cedar Waxwing", "Common Loon", "Barred Owl"],
	);
	assert.equal(page.total, 6);
	assert.equal(page.speciesTotal, 3);
	assert.equal(page.candidates[0]?.comName, "Cedar Waxwing");
	assert.equal(page.candidates[0]?.audioAvailable, true);
	database.close();
});

test("the queue pages in order, and a page past the end falls back", async () => {
	const database = bandedFixture();
	const root = await mkdtemp(path.join(tmpdir(), "birdnet-review-paged-"));
	const all = loadReviewPage(database, root, { page: 1 }, undefined, 50);
	const second = loadReviewPage(database, root, { page: 2 }, undefined, 4);
	assert.equal(second.page, 2);
	assert.equal(second.total, 6);
	assert.deepEqual(
		second.candidates.map((row) => row.rowId),
		all.candidates.slice(4).map((row) => row.rowId),
	);
	// Six rows are two pages of four, so page 9 shows page 2.
	assert.equal(
		loadReviewPage(database, root, { page: 9 }, undefined, 4).page,
		2,
	);
	database.close();
});

test("configured rarity changes the queue at a strict boundary", async () => {
	const database = bandedFixture();
	const root = await mkdtemp(path.join(tmpdir(), "birdnet-review-configured-"));
	const underThree = loadReviewPage(database, root, { page: 1 }, 3, 50);
	assert.deepEqual(
		[...new Set(underThree.candidates.map((row) => row.comName))],
		["Cedar Waxwing", "Common Loon"],
	);
	assert.equal(underThree.rareSpeciesMax, 3);
	assert.equal(
		loadReviewPage(database, root, { page: 1 }, 11, 50).speciesTotal,
		4,
	);
	database.close();
});

test("a recording BirdNET was already sure about stays out of the queue", async () => {
	const database = bandedFixture();
	// Raised in place rather than inserted: an extra row would change the Loon's
	// lifetime total, which is the other half of what puts it in the queue.
	database
		.prepare(
			"UPDATE detections SET Confidence=0.95 WHERE File_Name='Common_Loon-0.mp3'",
		)
		.run();
	const root = await mkdtemp(path.join(tmpdir(), "birdnet-review-confident-"));
	const page = loadReviewPage(database, root, { page: 1 }, undefined, 50);
	assert.equal(
		page.candidates.some((row) => (row.confidence ?? 0) >= 0.9),
		false,
	);
	assert.equal(page.total, 5);
	// The Loon is still queued -- only that one confident recording dropped out.
	assert.equal(page.speciesTotal, 3);
	database.close();
});

test("signing off records a review without touching BirdNET's score", () => {
	const database = fixture();
	correctDetection(database, 1);
	// The whole reason the sidecar table exists: averages elsewhere in the app
	// read this column, so review must not inflate it.
	assert.equal(
		database.prepare("SELECT Confidence FROM detections WHERE rowid=1").get()
			?.Confidence,
		0.4,
	);
	const review = database
		.prepare("SELECT Com_Name, action, confidence FROM reviews")
		.get();
	assert.equal(review?.Com_Name, "Scarlet Tanager");
	assert.equal(review?.action, "confirmed");
	assert.equal(review?.confidence, 0.4);
	database.close();
});

test("signing off twice leaves one review", () => {
	const database = fixture();
	correctDetection(database, 1);
	correctDetection(database, 1);
	assert.equal(database.prepare("SELECT COUNT(*) n FROM reviews").get()?.n, 1);
	database.close();
});

test("a signed-off detection drops out of the queue", async () => {
	const database = bandedFixture();
	const root = await mkdtemp(path.join(tmpdir(), "birdnet-review-signed-"));
	const before = loadReviewPage(database, root, { page: 1 }, undefined, 50);
	assert.equal(before.total, 6);
	const waxwing = before.candidates.find(
		(row) => row.comName === "Cedar Waxwing",
	);
	assert.ok(waxwing);
	correctDetection(database, waxwing.rowId);
	const after = loadReviewPage(database, root, { page: 1 }, undefined, 50);
	assert.equal(after.total, 5);
	assert.equal(
		after.candidates.some((row) => row.comName === "Cedar Waxwing"),
		false,
	);
	database.close();
});

test("deleting a detection takes its review with it", async () => {
	const database = bandedFixture();
	const root = await mkdtemp(path.join(tmpdir(), "birdnet-review-deleted-"));
	const page = loadReviewPage(database, root, { page: 1 }, undefined, 50);
	const row = page.candidates[0];
	assert.ok(row);
	correctDetection(database, row.rowId);
	await deleteDetectionDirectly(database, root, row.rowId);
	// Left behind, this would silently sign off the next recording that landed
	// on the same date, time, species and filename.
	assert.equal(database.prepare("SELECT COUNT(*) n FROM reviews").get()?.n, 0);
	database.close();
});

test("the queue works on a station that has never reviewed anything", async () => {
	const database = bandedFixture();
	const root = await mkdtemp(path.join(tmpdir(), "birdnet-review-virgin-"));
	assert.equal(
		database.prepare("SELECT 1 FROM sqlite_master WHERE name='reviews'").get(),
		undefined,
	);
	assert.equal(
		loadReviewPage(database, root, { page: 1 }, undefined, 50).total,
		6,
	);
	database.close();
});

test("recategorizing a shared recording copies assets for the selected row", async () => {
	const database = fixture();
	database
		.prepare("INSERT INTO detections VALUES (?, ?, ?, ?, ?, ?)")
		.run(
			"2026-07-27",
			"06:01",
			"Piranga olivacea",
			"Scarlet Tanager",
			0.5,
			"Scarlet_Tanager-a.mp3",
		);
	const root = await mkdtemp(path.join(tmpdir(), "birdnet-review-shared-"));
	const oldDir = path.join(root, "By_Date", "2026-07-27", "Scarlet_Tanager");
	mkdirSync(oldDir, { recursive: true });
	const oldAudio = path.join(oldDir, "Scarlet_Tanager-a.mp3");
	writeFileSync(oldAudio, "shared audio");
	writeFileSync(`${oldAudio}.png`, "shared image");
	await recategorizeDetection(
		database,
		root,
		1,
		{ sciName: "Cyanocitta cristata", comName: "Blue Jay" },
		[{ sciName: "Cyanocitta cristata", comName: "Blue Jay" }],
	);
	const newAudio = path.join(
		root,
		"By_Date",
		"2026-07-27",
		"Blue_Jay",
		"Blue_Jay-a.mp3",
	);
	assert.equal(readFileSync(oldAudio, "utf8"), "shared audio");
	assert.equal(readFileSync(newAudio, "utf8"), "shared audio");
	assert.equal(existsSync(`${oldAudio}.png`), true);
	assert.equal(existsSync(`${newAudio}.png`), true);
	// Re-identified, not re-scored: the confidence is still what BirdNET said.
	assert.equal(
		database.prepare("SELECT Confidence FROM detections WHERE rowid=1").get()
			?.Confidence,
		0.4,
	);
	// Filed under the name it now carries, so it stays out of the queue.
	const review = database
		.prepare("SELECT Com_Name, File_Name, action FROM reviews")
		.get();
	assert.equal(review?.Com_Name, "Blue Jay");
	assert.equal(review?.File_Name, "Blue_Jay-a.mp3");
	assert.equal(review?.action, "recategorized");
	database.close();
});

test("recategorization restores audio when moving the spectrogram fails", async () => {
	const database = fixture();
	const root = await mkdtemp(path.join(tmpdir(), "birdnet-review-rollback-"));
	const oldDir = path.join(root, "By_Date", "2026-07-27", "Scarlet_Tanager");
	mkdirSync(oldDir, { recursive: true });
	const oldAudio = path.join(oldDir, "Scarlet_Tanager-a.mp3");
	writeFileSync(oldAudio, "audio");
	writeFileSync(`${oldAudio}.png`, "image");
	await assert.rejects(
		recategorizeDetection(
			database,
			root,
			1,
			{ sciName: "Cyanocitta cristata", comName: "Blue Jay" },
			[{ sciName: "Cyanocitta cristata", comName: "Blue Jay" }],
			{
				...fileSystem,
				rename: async (oldPath, newPath) => {
					if (oldPath.toString().endsWith(".png"))
						throw new Error("spectrogram locked");
					await fileSystem.rename(oldPath, newPath);
				},
			},
		),
		/spectrogram locked/,
	);
	assert.equal(readFileSync(oldAudio, "utf8"), "audio");
	assert.equal(existsSync(`${oldAudio}.png`), true);
	assert.equal(
		database.prepare("SELECT Com_Name FROM detections WHERE rowid=1").get()
			?.Com_Name,
		"Scarlet Tanager",
	);
	database.close();
});
