import assert from "node:assert/strict";
import test from "node:test";

import { speciesLinkFor } from "~/lib/species-link.ts";

test("a bird links to its eBird page", () => {
	assert.deepEqual(speciesLinkFor("Cardinalis cardinalis"), {
		href: "https://ebird.org/species/norcar",
		site: "eBird",
	});
});

test("a bird under a retired binomial still reaches eBird", () => {
	assert.deepEqual(speciesLinkFor("Leucolia violiceps"), {
		href: "https://ebird.org/species/vichum",
		site: "eBird",
	});
});

test("a non-bird animal links to its iNaturalist taxon", () => {
	assert.deepEqual(speciesLinkFor("Tamias striatus"), {
		href: "https://www.inaturalist.org/taxa/46217",
		site: "iNaturalist",
	});
	assert.equal(speciesLinkFor("Odocoileus virginianus")?.site, "iNaturalist");
});

test("an unknown binomial falls back to iNaturalist's search", () => {
	assert.deepEqual(speciesLinkFor("Notarealia species"), {
		href: "https://www.inaturalist.org/taxa/search?q=Notarealia%20species",
		site: "iNaturalist",
	});
});

test("a sound class has no page", () => {
	assert.equal(speciesLinkFor("Dog"), null);
	assert.equal(speciesLinkFor("Human vocal"), null);
	assert.equal(speciesLinkFor("Engine"), null);
});
