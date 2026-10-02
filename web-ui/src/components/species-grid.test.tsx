import assert from "node:assert/strict";
import test from "node:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";

import {
	newTooltip,
	returnedTooltip,
	vocalTooltip,
} from "~/components/species-flag-pills.tsx";
import {
	SpeciesGrid,
	type SpeciesGridItem,
} from "~/components/species-grid.tsx";

async function renderGrid(species: SpeciesGridItem[]) {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => (
			<SpeciesGrid
				species={species}
				emptyMessage="Nothing heard in this window."
			/>
		),
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
}

const robin: SpeciesGridItem = {
	comName: "European Robin",
	sciName: "Erithacus rubecula",
	imageUrl: "/illustrations/robin.png",
	count: 128,
	averageConfidence: 0.83,
	isNew: false,
	firstHeard: null,
	isRare: false,
	isReturned: false,
	daysAway: null,
	vocal: null,
	// 24-count fixture, midnight first, peak at 06:00 — lets the row show bars.
	hourCounts: (() => {
		const c = Array(24).fill(0);
		c[6] = 30;
		c[7] = 15;
		return c;
	})(),
};

test("a species row shows its name, count and confidence", async () => {
	const markup = await renderGrid([robin]);
	assert.match(markup, /European Robin/);
	assert.match(markup, /href="\/species\/european-robin"/);
	assert.match(markup, /128/);
	assert.match(markup, /83%/);
	// No chips on an ordinary resident.
	assert.doesNotMatch(markup, /lucide-sparkles/);
	assert.doesNotMatch(markup, /lucide-gem/);
});

test("a new species gets a New chip", async () => {
	const markup = await renderGrid([
		{ ...robin, isNew: true, firstHeard: "2026-09-22" },
	]);
	assert.match(markup, /lucide-sparkles/);
	assert.match(markup, /New/);
});

test("the New tooltip names the day the bird was first recorded", () => {
	assert.equal(
		newTooltip("2026-09-22"),
		"First recorded here on Sep 22, 2026.",
	);
});

test("a rare visitor gets a Rare chip with the gem icon", async () => {
	const markup = await renderGrid([{ ...robin, isRare: true }]);
	assert.match(markup, /lucide-gem/);
	assert.match(markup, /Rare/);
});

test("a returned visitor gets a Returned chip", async () => {
	const markup = await renderGrid([
		{ ...robin, isReturned: true, daysAway: 23 },
	]);
	assert.match(markup, /lucide-undo-2/);
	assert.match(markup, /Returned/);
});

test("the Returned tooltip says how long the bird was away", () => {
	// The tooltip content lives in a Radix portal that only mounts on hover, so
	// it never reaches the static markup above -- test the copy at its source.
	assert.equal(returnedTooltip(23), "Back after 23 days away.");
	assert.equal(returnedTooltip(null), "Back after time away.");
});

test("an empty grid shows its empty note", async () => {
	const markup = await renderGrid([]);
	assert.match(markup, /Nothing heard in this window/);
});

test("a grid row draws the bird's hourly bars when hourCounts is present", async () => {
	const markup = await renderGrid([robin]);
	// 24 bars for the one bird in the grid.
	assert.equal((markup.match(/data-hour-bar/g) ?? []).length, 24);
	// And the eight three-hour ticks beneath them.
	assert.equal((markup.match(/data-hour-tick/g) ?? []).length, 8);
});

test("a grid row without hourCounts draws no bars", async () => {
	const { hourCounts, ...noHours } = robin;
	void hourCounts;
	const markup = await renderGrid([noHours]);
	assert.doesNotMatch(markup, /data-hour-bar/);
});

test("a bird heard far more than usual gets a Vocal chip", async () => {
	const vocal = { perDay: 76, usualPerDay: 4.6, ratio: 16.5 };
	const markup = await renderGrid([{ ...robin, vocal }]);
	assert.match(markup, /lucide-audio-lines/);
	assert.match(markup, /Vocal/);
	assert.equal(vocalTooltip(vocal), "Heard 76 times a day; usually 4.6.");
});
