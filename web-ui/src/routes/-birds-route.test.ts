import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("an unknown slug gets the page's own not-found card", async () => {
	const source = await readFile(
		new URL("./birds.$comName.tsx", import.meta.url),
		"utf8",
	);
	// The detail is deferred, so the loader returns before the slug resolves:
	// the not-found card is rendered in place rather than thrown.
	assert.match(source, /status !== "detected"\) return <SpeciesNotFound \/>/);
	assert.match(source, /<PageStatus/);
	// A bird's page: no "All Birds" masthead above the dead end.
	assert.doesNotMatch(source, /<StatusPage|<PageHeaderCard/);
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
	const undetected = source.slice(
		source.indexOf("function UndetectedSpecies"),
		source.indexOf("function SpeciesNotFound"),
	);
	assert.doesNotMatch(undetected, /<PageStatus/);
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
