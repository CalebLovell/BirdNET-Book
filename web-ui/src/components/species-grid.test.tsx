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

import { returnedTooltip } from "~/components/species-flag-pills.tsx";
import {
	SpeciesGrid,
	type SpeciesGridItem,
} from "~/components/species-grid.tsx";

async function renderGrid(species: SpeciesGridItem[], newLabel: string | null) {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => (
			<SpeciesGrid
				species={species}
				newLabel={newLabel}
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
	isRare: false,
	isReturned: false,
	returnedUnit: null,
	// 24-count fixture, midnight first, peak at 06:00 — lets the row show bars.
	hourCounts: (() => {
		const c = Array(24).fill(0);
		c[6] = 30;
		c[7] = 15;
		return c;
	})(),
};

test("a species row shows its name, count and confidence", async () => {
	const markup = await renderGrid([robin], "this week");
	assert.match(markup, /European Robin/);
	assert.match(markup, /href="\/species\/european-robin"/);
	assert.match(markup, /128/);
	assert.match(markup, /83%/);
	// No chips on an ordinary resident.
	assert.doesNotMatch(markup, /lucide-sparkles/);
	assert.doesNotMatch(markup, /lucide-gem/);
});

test("a new species gets a New chip when the window is named", async () => {
	const markup = await renderGrid([{ ...robin, isNew: true }], "this week");
	assert.match(markup, /lucide-sparkles/);
	assert.match(markup, /New/);
});

test("a null newLabel hides the New chip", async () => {
	const markup = await renderGrid([{ ...robin, isNew: true }], null);
	assert.doesNotMatch(markup, /lucide-sparkles/);
});

test("a rare visitor gets a Rare chip with the gem icon", async () => {
	const markup = await renderGrid([{ ...robin, isRare: true }], "this week");
	assert.match(markup, /lucide-gem/);
	assert.match(markup, /Rare/);
});

test("a returned visitor gets a Returned chip", async () => {
	const markup = await renderGrid(
		[{ ...robin, isReturned: true, returnedUnit: "day" }],
		"this week",
	);
	assert.match(markup, /lucide-undo-2/);
	assert.match(markup, /Returned/);
});

test("the Returned tooltip names one unit of the selected period", () => {
	// The tooltip content lives in a Radix portal that only mounts on hover, so
	// it never reaches the static markup above -- test the copy at its source.
	// "Returned" always means absent the single period before, so it is always
	// "a <unit> before", never a today-relative "ago" or a bare date.
	assert.equal(
		returnedTooltip("day"),
		"Back after an absence — last heard a day before.",
	);
	assert.equal(
		returnedTooltip("month"),
		"Back after an absence — last heard a month before.",
	);
	assert.match(returnedTooltip("year"), /last heard a year before\./);
	assert.doesNotMatch(returnedTooltip("week"), /ago|\d/);
});

test("an empty grid shows its empty note", async () => {
	const markup = await renderGrid([], "this week");
	assert.match(markup, /Nothing heard in this window/);
});

test("a grid row draws the bird's hourly bars when hourCounts is present", async () => {
	const markup = await renderGrid([robin], "this week");
	// 24 bars for the one bird in the grid.
	assert.equal((markup.match(/data-hour-bar/g) ?? []).length, 24);
	// And the eight three-hour ticks beneath them.
	assert.equal((markup.match(/data-hour-tick/g) ?? []).length, 8);
});

test("a grid row without hourCounts draws no bars", async () => {
	const { hourCounts, ...noHours } = robin;
	void hourCounts;
	const markup = await renderGrid([noHours], "this week");
	assert.doesNotMatch(markup, /data-hour-bar/);
});
