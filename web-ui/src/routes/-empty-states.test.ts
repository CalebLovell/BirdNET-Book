import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file: string) => readFile(new URL(file, import.meta.url), "utf8");

/**
 * The rule this file guards: a page with nothing on it at all gets the card
 * treatment, and a card that is empty inside a populated page stays a quiet
 * line. Both come from `~/components/empty-state.tsx` -- nowhere should be
 * hand-rolling the paragraph any more.
 */

test("a station that has never recorded anything gets the page-level card", async () => {
	for (const file of [
		"./detections.tsx",
		"./timeline.tsx",
		"./learn.tsx",
		"./species.index.tsx",
	]) {
		const source = await read(file);
		assert.match(source, /<EmptyState/, `${file} should use EmptyState`);
		assert.match(
			source,
			/icon=\{Bird\}/,
			`${file}'s page-level empty should carry the bird`,
		);
	}
});

/**
 * Caught live against an empty database: the detections page rendered its
 * EmptyState inside the table card, so the page-level treatment appeared as a
 * card within a card under a kicker heading a table that was not there.
 */
test("a page-level empty replaces its card rather than nesting inside one", async () => {
	const detections = await read("./detections.tsx");
	const stationEmptyBranch = detections.slice(
		detections.indexOf("{stationEmpty ?"),
		detections.indexOf("<section"),
	);
	assert.match(stationEmptyBranch, /<EmptyState/);
	assert.ok(
		detections.indexOf("{stationEmpty ?") < detections.indexOf("<section"),
		"the station-empty branch must sit outside the table card",
	);

	// Same shape on the timeline page: with nothing recorded there is no window
	// to scope and no figures to show, so the cards are replaced rather than
	// rendered empty.
	const timeline = await read("./timeline.tsx");
	assert.ok(
		timeline.indexOf("data.hasAnyDetections ? (") <
			timeline.indexOf("<TimelineCards"),
		"the timeline cards must sit inside the has-detections branch",
	);
});

test("section-level empties stay quiet lines", async () => {
	const detections = await read("./detections.tsx");
	assert.match(
		detections,
		/<EmptyNote>No detections match these filters\.<\/EmptyNote>/,
	);

	const species = await read("./species.index.tsx");
	assert.match(species, /<EmptyNote>/);

	// The window periods' quiet line lives in the grid card they share.
	const speciesByHour = await read("../components/species-by-hour-card.tsx");
	assert.match(speciesByHour, /<EmptyNote>\{emptyMessage\}<\/EmptyNote>/);
});

test("no route hand-rolls the empty paragraph any more", async () => {
	for (const file of [
		"./detections.tsx",
		"./timeline.tsx",
		"./learn.tsx",
		"./species.index.tsx",
		"./species.$comName.tsx",
		"../components/detections-by-hour-card.tsx",
		"../components/detections-by-month-card.tsx",
		"../components/now/recent-log-card.tsx",
	]) {
		const source = await read(file);
		assert.doesNotMatch(
			source,
			/<p className="mt-(?:4|\(--page-gap\)) text-muted-foreground text-sm">/,
			`${file} should use EmptyNote rather than its own paragraph`,
		);
	}
});
