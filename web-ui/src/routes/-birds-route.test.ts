import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("an unknown slug throws notFound and the route catches it itself", async () => {
	const source = await readFile(
		new URL("./birds.$comName.tsx", import.meta.url),
		"utf8",
	);
	assert.match(source, /status === "unknown"/);
	assert.match(source, /throw notFound\(\)/);
	assert.match(source, /notFoundComponent:\s*SpeciesNotFound/);
	assert.match(source, /<StatusPage/);
});

test("a known but unheard bird gets a profile, not an error", async () => {
	const source = await readFile(
		new URL("./birds.$comName.tsx", import.meta.url),
		"utf8",
	);
	assert.match(source, /status === "undetected"/);
	assert.match(source, /Not detected at this station yet/);
	assert.match(source, /ebirdUrlFor/);
	assert.match(source, /illustrationUrlFor/);
	// An undetected bird is not a PageStatus card.
	const undetected = source.slice(source.indexOf("function UndetectedSpecies"));
	assert.doesNotMatch(undetected.slice(0, 1600), /<PageStatus/);
});

test("hooks live in the detail view, not behind a conditional", async () => {
	const source = await readFile(
		new URL("./birds.$comName.tsx", import.meta.url),
		"utf8",
	);
	const view = source.slice(source.indexOf("function SpeciesDetailView"));
	assert.match(view.slice(0, 800), /useAgeOffset\(detail\.generatedAt\)/);
	assert.match(view.slice(0, 800), /useFavicon/);
});
