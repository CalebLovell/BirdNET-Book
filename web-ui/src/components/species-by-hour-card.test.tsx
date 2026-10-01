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
	rotatedHours,
	SpeciesByHourCard,
	type SpeciesByHourSun,
	type SpeciesHourRow,
} from "~/components/species-by-hour-card.tsx";

const robin: SpeciesHourRow = {
	comName: "European Robin",
	imageUrl: null,
	hourCounts: Array.from({ length: 24 }, (_, hour) => hour + 1),
	totalDetections: 300,
	isNew: false,
	firstHeard: null,
	isReturned: false,
	isRare: false,
	daysAway: null,
	vocalRatio: null,
};

async function renderCard(sun?: SpeciesByHourSun) {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => (
			<SpeciesByHourCard rows={[robin]} emptyMessage="Nothing." sun={sun} />
		),
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
}

/** The hours the row's cells stand for, in the order they're drawn. */
function cellHours(markup: string): string[] {
	return [...markup.matchAll(/European Robin — (\d+ [AP]M):/g)].map(
		(match) => match[1],
	);
}

test("rotatedHours starts at the given hour and wraps past midnight", () => {
	assert.deepEqual(rotatedHours(0).slice(0, 3), [0, 1, 2]);
	const fromSix = rotatedHours(6);
	assert.equal(fromSix.length, 24);
	assert.deepEqual(fromSix.slice(0, 2), [6, 7]);
	assert.deepEqual(fromSix.slice(-2), [4, 5]);
});

test("without a sun the day starts at midnight", async () => {
	const hours = cellHours(await renderCard());
	assert.equal(hours[0], "12 AM");
	assert.equal(hours.length, 24);
});

test("with a sun the day starts at the sunrise hour, counts still matched", async () => {
	const markup = await renderCard({
		startHour: 6,
		sunsetHour: 19,
		caption: "Sunrise 6:42 AM · Sunset 7:15 PM",
	});
	const hours = cellHours(markup);
	assert.equal(hours[0], "6 AM");
	assert.equal(hours.at(-1), "5 AM");
	// The 6 AM cell still carries hour 6's count (7), not midnight's.
	assert.match(markup, /European Robin — 6 AM: 7 detections/);
	assert.match(markup, /Sunrise 6:42 AM · Sunset 7:15 PM/);
	assert.equal((markup.match(/data-sun-tick/g) ?? []).length, 2);
});
