import assert from "node:assert/strict";
import { test } from "node:test";

import { type SearchPage, searchSite } from "~/lib/site-search.ts";

const SPECIES = [
	{ comName: "American Robin", sciName: "Turdus migratorius", count: 1284 },
	{
		comName: "Rose-breasted Grosbeak",
		sciName: "Pheucticus ludovicianus",
		count: 37,
	},
	{ comName: "Blue Jay", sciName: "Cyanocitta cristata", count: 412 },
];

const PAGES: SearchPage[] = [
	{ label: "Live", to: "/live" },
	{ label: "Species", to: "/species" },
	{ label: "Settings", to: "/settings" },
];

test("searchSite returns nothing for a blank query", () => {
	assert.deepEqual(searchSite("   ", SPECIES, PAGES), {
		species: [],
		pages: [],
	});
});

test("searchSite matches species by common or scientific name", () => {
	assert.deepEqual(
		searchSite("robin", SPECIES, PAGES).species.map((s) => s.comName),
		["American Robin"],
	);
	assert.deepEqual(
		searchSite("cyanocitta", SPECIES, PAGES).species.map((s) => s.comName),
		["Blue Jay"],
	);
});

test("searchSite matches pages by word prefix, ignoring case", () => {
	assert.deepEqual(
		searchSite("S", SPECIES, PAGES).pages.map((p) => p.label),
		["Species", "Settings"],
	);
	assert.deepEqual(searchSite("ive", SPECIES, PAGES).pages, []);
});

test("searchSite caps species at six", () => {
	const many = Array.from({ length: 10 }, (_, i) => ({
		comName: `Warbler ${i}`,
		sciName: `Setophaga ${i}`,
		count: i,
	}));
	assert.equal(searchSite("warbler", many, PAGES).species.length, 6);
});
